import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  WorkspaceRepository,
  createWorkspaceStateFile,
} from "./workspace.repository";
import type { WorkspaceOverview, WorkspaceSummary } from "./workspace.types";

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
    return {
      defaultLocation: this.defaultLocation,
      recent: await this.repository.listRecent(),
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
    await writeFile(
      join(workspacePath, ".heydesk", "workspace.json"),
      `${JSON.stringify({ version: 1, name, createdAt: new Date().toISOString() }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      join(workspacePath, "Welcome.md"),
      `# Welcome to ${name}\n\nThis workspace belongs to you.\n`,
      { encoding: "utf8", flag: "wx" },
    );

    return this.remember(name, workspacePath);
  }

  async open(folderPath: string): Promise<WorkspaceSummary> {
    const workspacePath = resolve(folderPath.replace(/^~(?=$|\/)/, homedir()));
    try {
      const details = await stat(workspacePath);
      if (!details.isDirectory()) throw new WorkspaceNotFoundError("That path is not a folder.");
      await access(workspacePath);
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) throw error;
      throw new WorkspaceNotFoundError("Heydesk could not open that folder.");
    }

    return this.remember(basename(workspacePath), workspacePath);
  }

  private async remember(name: string, path: string): Promise<WorkspaceSummary> {
    const workspace = { name, path, lastOpenedAt: new Date().toISOString() };
    await this.repository.remember(workspace);
    return workspace;
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
