export type ArtifactKind = "page" | "document";

export type ArtifactSummary = {
  path: string;
  name: string;
  title: string;
  kind: ArtifactKind;
  excerpt: string;
  updatedAt: string;
  size: number;
};

export type Artifact = ArtifactSummary & {
  content: string;
};
