import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { WorkspaceSummary } from "./workspace.types";
import {
  applicationWorkspaceStatePath,
  resolveWorkspaceEnvironment,
  type WorkspaceEnvironment,
} from "./workspace.paths";

type RecentWorkspaceFile = {
  version: 1;
  workspaces: WorkspaceSummary[];
};

export class WorkspaceRepository {
  constructor(private readonly stateFile: string) {}

  async listRecent(): Promise<WorkspaceSummary[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.stateFile, "utf8"));
      if (!isRecentWorkspaceFile(value)) return [];
      return value.workspaces;
    } catch (error) {
      if (isMissingFileError(error)) return [];
      throw error;
    }
  }

  async remember(workspace: WorkspaceSummary): Promise<void> {
    const current = await this.listRecent();
    const workspaces = [
      workspace,
      ...current.filter((item) => item.path !== workspace.path),
    ].slice(0, 8);

    await this.writeRecent(workspaces);
  }

  async forget(id: string): Promise<void> {
    const current = await this.listRecent();
    await this.writeRecent(current.filter((workspace) => workspace.id !== id));
  }

  private async writeRecent(workspaces: WorkspaceSummary[]): Promise<void> {
    const value: RecentWorkspaceFile = { version: 1, workspaces };

    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporaryFile = `${this.stateFile}.tmp`;
    await writeFile(
      temporaryFile,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryFile, this.stateFile);
  }
}

export function createWorkspaceStateFile(
  homeDirectory: string,
  environment: WorkspaceEnvironment = resolveWorkspaceEnvironment(),
): string {
  return join(
    applicationWorkspaceStatePath(homeDirectory, environment),
    "workspaces.json",
  );
}

function isRecentWorkspaceFile(value: unknown): value is RecentWorkspaceFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.workspaces) &&
    candidate.workspaces.every(isWorkspaceSummary)
  );
}

function isWorkspaceSummary(value: unknown): value is WorkspaceSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.id === undefined || typeof candidate.id === "string") &&
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.lastOpenedAt === "string"
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
