import { queryOptions } from "@tanstack/react-query";

import { getPage, listPages } from "./page.service";

export const pageKeys = {
  all: (workspaceId: string) => ["workspaces", workspaceId, "pages"] as const,
  detail: (workspaceId: string, path: string) =>
    [...pageKeys.all(workspaceId), "detail", path] as const,
};

export function pagesQueryOptions(workspaceId: string) {
  return queryOptions({
    queryKey: pageKeys.all(workspaceId),
    queryFn: () => listPages(workspaceId),
  });
}

export function pageQueryOptions(workspaceId: string, path: string) {
  return queryOptions({
    queryKey: pageKeys.detail(workspaceId, path),
    queryFn: () => getPage(workspaceId, path),
    retry: false,
  });
}
