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

import {
  createEmptyDocx,
  validateDocx,
} from "@eigenpal/docx-editor-core/docx/rezip";

import type { WorkspaceService } from "../workspace/workspace.service";
import type {
  DocumentContent,
  DocumentFile,
  DocumentSummary,
} from "./document.types";
import { ensureStandardDocumentStyles } from "./document-styles";

export const maximumDocumentSize = 25 * 1024 * 1024;

export class DocumentNotFoundError extends Error {}
export class InvalidDocumentError extends Error {}
export class DocumentAlreadyExistsError extends Error {}
export class DocumentRevisionConflictError extends Error {
  constructor(readonly current: DocumentFile) {
    super("This document changed on disk.");
  }
}

export class DocumentService {
  constructor(
    private readonly workspaces: Pick<WorkspaceService, "getById">,
  ) {}

  async list(workspaceId: string): Promise<DocumentSummary[]> {
    const root = await this.root(workspaceId);
    const paths = await discoverDocuments(root);
    return Promise.all(paths.map((path) => summaryFor(root, path))).then(
      (items) =>
        items.sort((left, right) =>
          left.path.localeCompare(right.path, undefined, {
            sensitivity: "base",
          }),
        ),
    );
  }

  async create(workspaceId: string, requestedName: string): Promise<DocumentFile> {
    const root = await this.root(workspaceId);
    const name = normalizeNewName(requestedName);
    const target = resolve(root, name);
    await assertNewTarget(root, target);
    const created = await ensureStandardDocumentStyles(
      new Uint8Array(await createEmptyDocx()),
    );
    const buffer = created.buffer;
    validateSize(buffer);
    await atomicCreate(target, buffer);
    return fileFor(root, target, buffer);
  }

  async import(
    workspaceId: string,
    requestedName: string,
    buffer: Uint8Array,
  ): Promise<DocumentFile> {
    validateSize(buffer);
    await assertValidDocx(buffer);
    const root = await this.root(workspaceId);
    const name = normalizeNewName(requestedName);
    const target = resolve(root, name);
    await assertNewTarget(root, target);
    await atomicCreate(target, buffer);
    return fileFor(root, target, buffer);
  }

  async read(workspaceId: string, requestedPath: string): Promise<DocumentContent> {
    const root = await this.root(workspaceId);
    const path = await resolveExistingDocument(root, requestedPath);
    const buffer = await readDocumentWithStyleRepair(path);
    validateSize(buffer);
    return { ...(await fileFor(root, path, buffer)), buffer };
  }

  async write(
    workspaceId: string,
    requestedPath: string,
    buffer: Uint8Array,
    expectedRevision: string,
  ): Promise<DocumentFile> {
    validateSize(buffer);
    await assertValidDocx(buffer);
    const root = await this.root(workspaceId);
    const path = await resolveExistingDocument(root, requestedPath);
    const currentBuffer = await readFile(path);
    const current = await fileFor(root, path, currentBuffer);
    if (current.revision !== expectedRevision) {
      throw new DocumentRevisionConflictError(current);
    }
    const details = await stat(path);
    const temporaryPath = resolve(
      dirname(path),
      `.${basename(path)}.heydesk-${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, buffer, { flag: "wx", mode: details.mode });
      await rename(temporaryPath, path);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    return fileFor(root, path, buffer);
  }

  private async root(workspaceId: string): Promise<string> {
    const workspace = await this.workspaces.getById(workspaceId);
    return realpath(workspace.path);
  }
}

async function discoverDocuments(root: string): Promise<string[]> {
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
        extname(entry.name).toLowerCase() === ".docx"
      ) {
        const details = await stat(path);
        if (details.size <= maximumDocumentSize) discovered.push(path);
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

async function resolveExistingDocument(
  root: string,
  requestedPath: string,
): Promise<string> {
  const normalized = normalizePath(requestedPath);
  let current = root;
  try {
    for (const segment of normalized.split("/")) {
      current = resolve(current, segment);
      if ((await lstat(current)).isSymbolicLink()) {
        throw new InvalidDocumentError("Linked documents are not allowed.");
      }
    }
    const canonical = await realpath(current);
    if (!isInside(root, canonical)) {
      throw new InvalidDocumentError("That document is outside this workspace.");
    }
    return canonical;
  } catch (error) {
    if (error instanceof InvalidDocumentError) throw error;
    throw new DocumentNotFoundError("That document is not available.");
  }
}

function normalizePath(requestedPath: string): string {
  const normalized = requestedPath.trim().replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    extname(normalized).toLowerCase() !== ".docx" ||
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || segment.startsWith("."),
    )
  ) {
    throw new InvalidDocumentError("That document path is not allowed.");
  }
  return normalized;
}

function normalizeNewName(requestedName: string): string {
  const trimmed = requestedName.trim();
  const withExtension = trimmed.toLowerCase().endsWith(".docx")
    ? trimmed
    : `${trimmed}.docx`;
  const normalized = normalizePath(withExtension);
  if (normalized.includes("/")) {
    throw new InvalidDocumentError("New documents must be created at the workspace root.");
  }
  return normalized;
}

async function assertNewTarget(root: string, target: string): Promise<void> {
  if (!isInside(root, target)) {
    throw new InvalidDocumentError("That document path is not allowed.");
  }
  try {
    await lstat(target);
    throw new DocumentAlreadyExistsError("A document with that name already exists.");
  } catch (error) {
    if (error instanceof DocumentAlreadyExistsError) throw error;
    if (!isMissingFileError(error)) throw error;
  }
}

async function atomicCreate(path: string, buffer: Uint8Array): Promise<void> {
  const temporaryPath = resolve(
    dirname(path),
    `.${basename(path)}.heydesk-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, buffer, { flag: "wx", mode: 0o600 });
    try {
      await link(temporaryPath, path);
    } catch (error) {
      if (isExistsError(error)) {
        throw new DocumentAlreadyExistsError("A document with that name already exists.");
      }
      throw error;
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function readDocumentWithStyleRepair(path: string): Promise<Uint8Array> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const original = await readFile(path);
    let repaired: Awaited<ReturnType<typeof ensureStandardDocumentStyles>>;
    try {
      repaired = await ensureStandardDocumentStyles(original, "referenced");
    } catch (error) {
      throw new InvalidDocumentError(
        error instanceof Error
          ? error.message
          : "The document style catalog could not be read.",
      );
    }
    if (!repaired.changed) return original;

    const current = await readFile(path);
    if (!current.equals(original)) continue;
    await atomicReplace(path, repaired.buffer);
    return repaired.buffer;
  }
  return readFile(path);
}

async function atomicReplace(path: string, buffer: Uint8Array): Promise<void> {
  const details = await stat(path);
  const temporaryPath = resolve(
    dirname(path),
    `.${basename(path)}.heydesk-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, buffer, { flag: "wx", mode: details.mode });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function assertValidDocx(buffer: Uint8Array): Promise<void> {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const validation = await validateDocx(arrayBuffer);
  if (!validation.valid) {
    throw new InvalidDocumentError(
      validation.errors[0] ?? "That file is not a valid Word document.",
    );
  }
}

function validateSize(buffer: Uint8Array): void {
  if (buffer.byteLength === 0 || buffer.byteLength > maximumDocumentSize) {
    throw new InvalidDocumentError("That document is empty or too large.");
  }
}

async function summaryFor(root: string, path: string): Promise<DocumentSummary> {
  const details = await stat(path);
  if (!details.isFile() || details.size > maximumDocumentSize) {
    throw new DocumentNotFoundError("That document is not available.");
  }
  const workspacePath = relative(root, path).split(sep).join("/");
  return {
    path: workspacePath,
    name: basename(workspacePath, extname(workspacePath)),
    size: details.size,
    updatedAt: details.mtime.toISOString(),
  };
}

async function fileFor(
  root: string,
  path: string,
  buffer: Uint8Array,
): Promise<DocumentFile> {
  return {
    ...(await summaryFor(root, path)),
    revision: createHash("sha256").update(buffer).digest("hex"),
  };
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}
