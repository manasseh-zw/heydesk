export const assistantKeys = {
  all: ["assistant"] as const,
  readiness: () => [...assistantKeys.all, "readiness"] as const,
  models: () => [...assistantKeys.all, "models"] as const,
  workspace: (workspaceId: string) =>
    [...assistantKeys.all, "workspace", workspaceId] as const,
  scope: (workspaceId: string, scopeKey: string) =>
    [...assistantKeys.workspace(workspaceId), "scope", scopeKey] as const,
  state: (workspaceId: string, scopeKey = "workspace") =>
    [...assistantKeys.scope(workspaceId, scopeKey), "state"] as const,
};
