import { getServerUrl } from "../../lib/server-url";

import type { WorkspaceOverview, WorkspaceSummary } from "./workspace.types";

export async function getWorkspaceOverview(): Promise<WorkspaceOverview> {
  return request<WorkspaceOverview>("/api/workspaces");
}

export async function createWorkspace(name: string): Promise<WorkspaceSummary> {
  return request<WorkspaceSummary>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function openWorkspace(path: string): Promise<WorkspaceSummary> {
  return request<WorkspaceSummary>("/api/workspaces/open", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export async function removeWorkspace(workspaceId: string): Promise<void> {
  const response = await fetch(
    `${getServerUrl()}/api/workspaces/${encodeURIComponent(workspaceId)}`,
    { method: "DELETE" },
  );
  if (response.ok) return;
  const result: unknown = await response.json().catch(() => null);
  throw new Error(
    result && typeof result === "object" && "error" in result
      ? String(result.error)
      : "Heydesk could not remove that workspace.",
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getServerUrl()}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const result: unknown = await response.json();

  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : "Heydesk could not complete that request.";
    throw new Error(message);
  }

  return result as T;
}
