import { queryOptions } from "@tanstack/react-query";

import { getArtifact, listArtifacts } from "./artifact.service";

export const artifactKeys = {
  all: (workspaceId: string) => ["workspaces", workspaceId, "artifacts"] as const,
  detail: (workspaceId: string, path: string) =>
    [...artifactKeys.all(workspaceId), "detail", path] as const,
};

export function artifactsQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: artifactKeys.all(workspaceId),
    queryFn: () => listArtifacts(workspaceId),
  });
}

export function artifactQueryOptions(workspaceId: string, path: string) {
  return queryOptions({
    queryKey: artifactKeys.detail(workspaceId, path),
    queryFn: () => getArtifact(workspaceId, path),
    retry: false,
  });
}
