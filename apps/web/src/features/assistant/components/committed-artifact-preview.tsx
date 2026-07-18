import { useQuery } from "@tanstack/react-query";

import { artifactQueryOptions } from "@/features/artifact/artifact.queries";
import { ArtifactPreview } from "@/features/artifact/components/artifact-preview";

type CommittedArtifactPreviewProps = {
  onOpen: (path: string) => void;
  path: string;
  workspaceId: string;
};

export function CommittedArtifactPreview({
  onOpen,
  path,
  workspaceId,
}: CommittedArtifactPreviewProps) {
  const query = useQuery(artifactQueryOptions(workspaceId, path));
  if (!query.data) return null;
  return <ArtifactPreview artifact={query.data} onOpen={onOpen} />;
}
