import { useQuery } from "@tanstack/react-query";

import { pageQueryOptions } from "@/features/page/page.queries";
import { ArtifactPreview } from "./artifact-preview";

type CommittedArtifactPreviewProps = {
  onOpenPage: (path: string) => void;
  path: string;
  workspaceId: string;
};

export function CommittedArtifactPreview({
  onOpenPage,
  path,
  workspaceId,
}: CommittedArtifactPreviewProps) {
  const query = useQuery(pageQueryOptions(workspaceId, path));
  if (!query.data) return null;
  return <ArtifactPreview onOpenPage={onOpenPage} page={query.data} />;
}
