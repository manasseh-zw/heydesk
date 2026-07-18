import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
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
import type { Page, PageSummary } from "./page.types";

const supportedExtensions = new Set([".md", ".mdx"]);
const maximumPageSize = 2 * 1024 * 1024;

export class PageNotFoundError extends Error {}
export class InvalidPagePathError extends Error {}
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
    const paths = await discoverPages(root);
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
    editorMode:
      syntax === "mdx" || hasUnsupportedRichMarkdown(content)
        ? "source"
        : "rich",
  };
}

function revisionFor(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function hasUnsupportedRichMarkdown(content: string): boolean {
  return (
    /^---\s*\n/u.test(content) ||
    /<!--[\s\S]*?-->/u.test(content) ||
    /<\/?[A-Za-z][^>]*>/u.test(content) ||
    /^\s*\{[^\n]*\}\s*$/m.test(content) ||
    /^\s*[-*]\s+\[[ xX]\]\s+/m.test(content) ||
    /^\s*\[[^\]]+\]:\s+/m.test(content) ||
    /!\[[^\]]*\]\([^)]*\)/u.test(content) ||
    /^\s*\|?.+\|.+\|?\s*\n\s*\|?\s*:?-{3,}/m.test(content)
  );
}

async function discoverPages(root: string): Promise<string[]> {
  const discovered: string[] = [];
  const ignoredPaths = await readWorkspaceIgnorePaths(root);

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = resolve(directory, entry.name);
      const workspacePath = relative(root, path).split(sep).join("/");
      if (isIgnoredWorkspacePath(workspacePath, ignoredPaths)) continue;
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

  await walk(root);
  return discovered;
}

async function readWorkspaceIgnorePaths(root: string): Promise<Set<string>> {
  const ignored = new Set(["node_modules", "dist", "build", "coverage"]);
  try {
    const source = await readFile(resolve(root, ".gitignore"), "utf8");
    for (const line of source.split("\n")) {
      const value = line.trim();
      if (!value || value.startsWith("#") || value.startsWith("!")) continue;
      const normalized = value
        .replace(/^\//, "")
        .replace(/\/$/, "")
        .replaceAll("\\", "/");
      if (normalized && !normalized.includes("*")) ignored.add(normalized);
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return ignored;
}

function isIgnoredWorkspacePath(path: string, ignored: Set<string>): boolean {
  for (const ignoredPath of ignored) {
    if (path === ignoredPath || path.startsWith(`${ignoredPath}/`)) return true;
  }
  return false;
}

async function resolvePagePath(
  root: string,
  requestedPath: string,
): Promise<string> {
  const normalized = requestedPath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/") ||
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

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
