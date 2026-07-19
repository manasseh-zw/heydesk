import { join } from "node:path";

export type WorkspaceEnvironment = "development" | "production" | "test";

export const workspaceStateDirectory = ".heydesk";
export const workspaceDatabaseName = "heydesk.sqlite";
export const workspacePagesDirectory = "pages";
export const workspaceDocumentsDirectory = "documents";

export function resolveWorkspaceEnvironment(
  value = process.env.NODE_ENV,
): WorkspaceEnvironment {
  if (value === "production" || value === "test") return value;
  return "development";
}

export function defaultWorkspaceLocation(
  homeDirectory: string,
  environment: WorkspaceEnvironment,
): string {
  const root = join(homeDirectory, "Documents", "Heydesk");
  if (environment === "production") return root;
  return join(root, environment === "development" ? "Dev" : "Test");
}

export function applicationWorkspaceStatePath(
  homeDirectory: string,
  environment: WorkspaceEnvironment,
): string {
  const root = join(homeDirectory, workspaceStateDirectory);
  if (environment === "production") return root;
  return join(root, environment === "development" ? "dev" : "test");
}

export function workspaceStatePath(workspacePath: string): string {
  return join(workspacePath, workspaceStateDirectory);
}

export function workspacePagesPath(workspacePath: string): string {
  return join(workspacePath, workspacePagesDirectory);
}

export function workspaceDocumentsPath(workspacePath: string): string {
  return join(workspacePath, workspaceDocumentsDirectory);
}
