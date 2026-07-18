import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";

import type { WorkspaceService } from "../workspace/workspace.service";
import type { Artifact, ArtifactSummary } from "./artifact.types";

const supportedExtensions = new Set([".md", ".mdx"]);
const maximumArtifactSize = 2 * 1024 * 1024;

export class ArtifactNotFoundError extends Error {}
export class InvalidArtifactPathError extends Error {}

export class ArtifactService {
  constructor(
    private readonly workspaces: Pick<WorkspaceService, "getById">,
  ) {}

  async list(workspaceId: string): Promise<ArtifactSummary[]> {
    const workspace = await this.workspaces.getById(workspaceId);
    const root = await realpath(workspace.path);
    const paths = await discoverArtifacts(root);
    const artifacts = await Promise.all(
      paths.map((path) => this.readSummary(root, path)),
    );
    return artifacts.sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { sensitivity: "base" }),
    );
  }

  async read(workspaceId: string, requestedPath: string): Promise<Artifact> {
    const workspace = await this.workspaces.getById(workspaceId);
    const root = await realpath(workspace.path);
    const artifactPath = await resolveArtifactPath(root, requestedPath);
    const summary = await this.readSummary(root, artifactPath);
    return { ...summary, content: await readFile(artifactPath, "utf8") };
  }

  private async readSummary(
    root: string,
    artifactPath: string,
  ): Promise<ArtifactSummary> {
    const details = await stat(artifactPath);
    if (!details.isFile() || details.size > maximumArtifactSize) {
      throw new ArtifactNotFoundError("That artifact is not available.");
    }
    const content = await readFile(artifactPath, "utf8");
    const path = relative(root, artifactPath).split(sep).join("/");
    const extension = extname(path).toLowerCase();
    const name = basename(path, extension);
    return {
      path,
      name,
      title: extractTitle(content) ?? name,
      kind: "page",
      excerpt: extractExcerpt(content),
      updatedAt: details.mtime.toISOString(),
      size: details.size,
    };
  }
}

async function discoverArtifacts(root: string): Promise<string[]> {
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
        if (details.size <= maximumArtifactSize) discovered.push(path);
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

async function resolveArtifactPath(
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
    throw new InvalidArtifactPathError("That artifact path is not allowed.");
  }

  let current = root;
  try {
    for (const segment of segments) {
      current = resolve(current, segment);
      const details = await lstat(current);
      if (details.isSymbolicLink()) {
        throw new InvalidArtifactPathError("Linked artifacts are not allowed.");
      }
    }
    const canonical = await realpath(current);
    if (!isInside(root, canonical)) {
      throw new InvalidArtifactPathError("That artifact is outside this workspace.");
    }
    return canonical;
  } catch (error) {
    if (error instanceof InvalidArtifactPathError) throw error;
    throw new ArtifactNotFoundError("That artifact is not available.");
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
