export type WorkspaceSummary = {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: string;
};

export type WorkspaceOverview = {
  defaultLocation: string;
  recent: WorkspaceSummary[];
};
