import { env } from "@heydesk/env/web";

import type { Artifact, ArtifactSummary } from "./artifact.types";

export async function listArtifacts(
  workspaceId: string,
): Promise<ArtifactSummary[]> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/artifacts`);
}

export async function getArtifact(
  workspaceId: string,
  path: string,
): Promise<Artifact> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/artifacts/content?path=${encodeURIComponent(path)}`,
  );
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${env.VITE_SERVER_URL}${path}`);
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : "Heydesk could not load that artifact.";
    throw new Error(message);
  }
  return result as T;
}
