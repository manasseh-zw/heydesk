export type WorkspaceSummary = {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: string;
};

export type WorkspaceManifest = {
  version: 2;
  id: string;
  name: string;
  createdAt: string;
};

export type WorkspaceOverview = {
  defaultLocation: string;
  recent: WorkspaceSummary[];
};
