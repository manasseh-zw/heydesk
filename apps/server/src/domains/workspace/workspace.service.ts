import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  WorkspaceRepository,
  createWorkspaceStateFile,
} from "./workspace.repository";
import type {
  WorkspaceManifest,
  WorkspaceOverview,
  WorkspaceSummary,
} from "./workspace.types";

export class WorkspaceConflictError extends Error {}
export class WorkspaceNotFoundError extends Error {}

export class WorkspaceService {
  readonly defaultLocation: string;

  constructor(
    private readonly repository: WorkspaceRepository,
    homeDirectory = homedir(),
  ) {
    this.defaultLocation = join(homeDirectory, "Documents", "Heydesk");
  }

  async getOverview(): Promise<WorkspaceOverview> {
    const recent: WorkspaceSummary[] = [];
    for (const workspace of await this.repository.listRecent()) {
      try {
        const manifest = await this.ensureManifest(
          workspace.path,
          workspace.name,
        );
        recent.push({ ...workspace, id: manifest.id, name: manifest.name });
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
    }
    for (const workspace of [...recent].reverse()) {
      await this.repository.remember(workspace);
    }
    return {
      defaultLocation: this.defaultLocation,
      recent,
    };
  }

  async create(name: string): Promise<WorkspaceSummary> {
    const workspacePath = join(this.defaultLocation, name);
    if (await pathExists(workspacePath)) {
      throw new WorkspaceConflictError(
        `A workspace named “${name}” already exists in Heydesk.`,
      );
    }

    await mkdir(join(workspacePath, ".heydesk"), { recursive: true });
    const manifest: WorkspaceManifest = {
      version: 2,
      id: randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    await writeManifest(workspacePath, manifest, "wx");
    await writeFile(
      join(workspacePath, "Welcome.md"),
      `# Welcome to ${name}\n\nThis workspace belongs to you.\n`,
      { encoding: "utf8", flag: "wx" },
    );

    return this.remember(manifest, workspacePath);
  }

  async open(folderPath: string): Promise<WorkspaceSummary> {
    const workspacePath = resolve(folderPath.replace(/^~(?=$|\/)/, homedir()));
    try {
      const details = await stat(workspacePath);
      if (!details.isDirectory())
        throw new WorkspaceNotFoundError("That path is not a folder.");
      await access(workspacePath);
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) throw error;
      throw new WorkspaceNotFoundError("Heydesk could not open that folder.");
    }

    const manifest = await this.ensureManifest(
      workspacePath,
      basename(workspacePath),
    );
    return this.remember(manifest, workspacePath);
  }

  async getById(id: string): Promise<WorkspaceSummary> {
    const workspace = (await this.repository.listRecent()).find(
      (item) => item.id === id,
    );
    if (!workspace)
      throw new WorkspaceNotFoundError(
        "That workspace is no longer available.",
      );
    try {
      await access(workspace.path);
    } catch {
      throw new WorkspaceNotFoundError(
        "That workspace is no longer available.",
      );
    }
    return workspace;
  }

  private async remember(
    manifest: WorkspaceManifest,
    path: string,
  ): Promise<WorkspaceSummary> {
    const workspace = {
      id: manifest.id,
      name: manifest.name,
      path,
      lastOpenedAt: new Date().toISOString(),
    };
    await this.repository.remember(workspace);
    return workspace;
  }

  private async ensureManifest(
    workspacePath: string,
    fallbackName: string,
  ): Promise<WorkspaceManifest> {
    const manifestPath = join(workspacePath, ".heydesk", "workspace.json");
    try {
      const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
      if (isWorkspaceManifest(value)) return value;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }

    await mkdir(join(workspacePath, ".heydesk"), { recursive: true });
    const manifest: WorkspaceManifest = {
      version: 2,
      id: randomUUID(),
      name: fallbackName,
      createdAt: new Date().toISOString(),
    };
    await writeManifest(workspacePath, manifest, "w");
    return manifest;
  }
}

const homeDirectory = homedir();
export const workspaceService = new WorkspaceService(
  new WorkspaceRepository(createWorkspaceStateFile(homeDirectory)),
  homeDirectory,
);

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeManifest(
  workspacePath: string,
  manifest: WorkspaceManifest,
  flag: "w" | "wx",
): Promise<void> {
  await writeFile(
    join(workspacePath, ".heydesk", "workspace.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", flag },
  );
}

function isWorkspaceManifest(value: unknown): value is WorkspaceManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 2 &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.createdAt === "string"
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
