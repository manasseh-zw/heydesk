import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  link,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

import type { WorkspaceService } from "../workspace/workspace.service";
import { workspacePagesDirectory } from "../workspace/workspace.paths";
import type { Page, PageSummary } from "./page.types";

const supportedExtensions = new Set([".md", ".mdx"]);
const maximumPageSize = 2 * 1024 * 1024;

export class PageNotFoundError extends Error {}
export class InvalidPagePathError extends Error {}
export class PageAlreadyExistsError extends Error {}
export class PageRevisionConflictError extends Error {
  constructor(readonly current: Page) {
    super("This page changed on disk.");
  }
}

export class PageService {
  constructor(
    private readonly workspaces: Pick<WorkspaceService, "getById">,
  ) {}

  async list(workspaceId: string): Promise<PageSummary[]> {
    const workspace = await this.workspaces.getById(workspaceId);
    const root = await realpath(workspace.path);
    const pagesRoot = await realpath(resolve(root, workspacePagesDirectory));
    const paths = await discoverPages(pagesRoot);
    const pages = await Promise.all(
      paths.map((path) => this.readSummary(root, path)),
    );
    return pages.sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { sensitivity: "base" }),
    );
  }

  async read(workspaceId: string, requestedPath: string): Promise<Page> {
    const workspace = await this.workspaces.getById(workspaceId);
    const root = await realpath(workspace.path);
    const pagePath = await resolvePagePath(root, requestedPath);
    const summary = await this.readSummary(root, pagePath);
    const content = await readFile(pagePath, "utf8");
    return createPage(summary, content);
  }

  async create(workspaceId: string, requestedName: string): Promise<Page> {
    const workspace = await this.workspaces.getById(workspaceId);
    const root = await realpath(workspace.path);
    const { filename, title } = normalizeNewPageName(requestedName);
    const target = resolve(root, workspacePagesDirectory, filename);
    if (!isInside(root, target)) {
      throw new InvalidPagePathError("That page path is not allowed.");
    }
    const content = `# ${title}\n\n`;
    await atomicCreatePage(target, content);
    return this.read(
      workspaceId,
      `${workspacePagesDirectory}/${filename}`,
    );
  }

  async delete(workspaceId: string, requestedPath: string): Promise<void> {
    const workspace = await this.workspaces.getById(workspaceId);
    const root = await realpath(workspace.path);
    const pagePath = await resolvePagePath(root, requestedPath);
    await rm(pagePath);
  }

  async write(
    workspaceId: string,
    requestedPath: string,
    content: string,
    expectedRevision: string,
  ): Promise<Page> {
    if (Buffer.byteLength(content, "utf8") > maximumPageSize) {
      throw new InvalidPagePathError("That page is too large.");
    }
    const workspace = await this.workspaces.getById(workspaceId);
    const root = await realpath(workspace.path);
    const pagePath = await resolvePagePath(root, requestedPath);
    const current = await this.read(workspaceId, requestedPath);
    if (current.revision !== expectedRevision) {
      throw new PageRevisionConflictError(current);
    }

    const details = await stat(pagePath);
    const temporaryPath = resolve(
      dirname(pagePath),
      `.${basename(pagePath)}.heydesk-${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, content, {
        encoding: "utf8",
        flag: "wx",
        mode: details.mode,
      });
      await rename(temporaryPath, pagePath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    return this.read(workspaceId, requestedPath);
  }

  private async readSummary(
    root: string,
    pagePath: string,
  ): Promise<PageSummary> {
    const details = await stat(pagePath);
    if (!details.isFile() || details.size > maximumPageSize) {
      throw new PageNotFoundError("That page is not available.");
    }
    const content = await readFile(pagePath, "utf8");
    const path = relative(root, pagePath).split(sep).join("/");
    const extension = extname(path).toLowerCase();
    const name = basename(path, extension);
    return {
      path,
      name,
      title: extractTitle(content) ?? name,
      excerpt: extractExcerpt(content),
      updatedAt: details.mtime.toISOString(),
      size: details.size,
    };
  }
}

function createPage(summary: PageSummary, content: string): Page {
  const syntax = extname(summary.path).toLowerCase() === ".mdx" ? "mdx" : "markdown";
  return {
    ...summary,
    content,
    revision: revisionFor(content),
    syntax,
    editorMode: syntax === "mdx" ? "source" : "rich",
  };
}

function revisionFor(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizeNewPageName(requestedName: string): {
  filename: string;
  title: string;
} {
  const trimmed = requestedName.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new InvalidPagePathError(
      "New pages must be created directly inside Pages.",
    );
  }
  const requestedExtension = extname(trimmed).toLowerCase();
  if (requestedExtension && !supportedExtensions.has(requestedExtension)) {
    throw new InvalidPagePathError("New pages must use Markdown or MDX.");
  }
  const filename = requestedExtension ? trimmed : `${trimmed}.md`;
  const title = basename(filename, extname(filename)).trim();
  if (!title || filename.startsWith(".")) {
    throw new InvalidPagePathError("Choose a visible page name.");
  }
  return { filename, title };
}

async function atomicCreatePage(path: string, content: string): Promise<void> {
  const temporaryPath = resolve(
    dirname(path),
    `.${basename(path)}.heydesk-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    try {
      await link(temporaryPath, path);
    } catch (error) {
      if (isExistsError(error)) {
        throw new PageAlreadyExistsError(
          "A page with that name already exists.",
        );
      }
      throw error;
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function discoverPages(pagesRoot: string): Promise<string[]> {
  const discovered: string[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path);
      } else if (
        entry.isFile() &&
        supportedExtensions.has(extname(entry.name).toLowerCase())
      ) {
        const details = await stat(path);
        if (details.size <= maximumPageSize) discovered.push(path);
      }
    }
  }

  await walk(pagesRoot);
  return discovered;
}

async function resolvePagePath(
  root: string,
  requestedPath: string,
): Promise<string> {
  const normalized = requestedPath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    segments[0] !== workspacePagesDirectory ||
    segments.length < 2 ||
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || segment.startsWith("."),
    ) ||
    !supportedExtensions.has(extname(normalized).toLowerCase())
  ) {
    throw new InvalidPagePathError("That page path is not allowed.");
  }

  let current = root;
  try {
    for (const segment of segments) {
      current = resolve(current, segment);
      const details = await lstat(current);
      if (details.isSymbolicLink()) {
        throw new InvalidPagePathError("Linked pages are not allowed.");
      }
    }
    const canonical = await realpath(current);
    if (!isInside(root, canonical)) {
      throw new InvalidPagePathError("That page is outside this workspace.");
    }
    return canonical;
  } catch (error) {
    if (error instanceof InvalidPagePathError) throw error;
    throw new PageNotFoundError("That page is not available.");
  }
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
}

function isExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

function extractTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function extractExcerpt(content: string): string {
  const withoutFrontmatter = content.replace(/^---\s*[\s\S]*?\n---\s*/u, "");
  const excerpt = withoutFrontmatter
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("```") &&
        !line.startsWith("<"),
    )
    .join(" ")
    .replace(/[*_`>[\]()-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return excerpt.length > 180 ? `${excerpt.slice(0, 177).trimEnd()}…` : excerpt;
}
