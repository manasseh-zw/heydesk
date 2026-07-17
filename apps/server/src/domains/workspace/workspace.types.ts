export type WorkspaceSummary = {
  name: string;
  path: string;
  lastOpenedAt: string;
};

export type WorkspaceOverview = {
  defaultLocation: string;
  recent: WorkspaceSummary[];
};
