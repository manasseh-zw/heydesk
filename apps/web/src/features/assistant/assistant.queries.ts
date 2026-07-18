export const assistantKeys = {
  all: ["assistant"] as const,
  readiness: () => [...assistantKeys.all, "readiness"] as const,
  models: () => [...assistantKeys.all, "models"] as const,
  workspace: (workspaceId: string) =>
    [...assistantKeys.all, "workspace", workspaceId] as const,
  state: (workspaceId: string) =>
    [...assistantKeys.workspace(workspaceId), "state"] as const,
};
