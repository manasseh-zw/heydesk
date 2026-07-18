import { queryOptions } from "@tanstack/react-query";

import { getDocument, listDocuments } from "./document.service";

export const documentKeys = {
  all: (workspaceId: string) => ["workspaces", workspaceId, "documents"] as const,
  detail: (workspaceId: string, path: string) =>
    [...documentKeys.all(workspaceId), "detail", path] as const,
};

export function documentsQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: documentKeys.all(workspaceId),
    queryFn: () => listDocuments(workspaceId),
    refetchInterval: 5_000,
  });
}

export function documentQueryOptions(workspaceId: string, path: string) {
  return queryOptions({
    queryKey: documentKeys.detail(workspaceId, path),
    queryFn: () => getDocument(workspaceId, path),
    retry: false,
  });
}
