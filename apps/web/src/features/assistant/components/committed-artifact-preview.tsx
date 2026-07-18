import { useQuery } from "@tanstack/react-query";
import { FileCheck2Icon } from "lucide-react";

import { pageQueryOptions } from "@/features/page/page.queries";
import { ArtifactPreview } from "./artifact-preview";

type CommittedArtifactPreviewProps = {
  kind: "page" | "document";
  onOpenPage: (path: string) => void;
  path: string;
  workspaceId: string;
};

export function CommittedArtifactPreview({
  kind,
  onOpenPage,
  path,
  workspaceId,
}: CommittedArtifactPreviewProps) {
  if (kind === "document") {
    return <CommittedDocumentArtifact path={path} />;
  }
  return (
    <CommittedPageArtifact
      onOpenPage={onOpenPage}
      path={path}
      workspaceId={workspaceId}
    />
  );
}

function CommittedDocumentArtifact({ path }: { path: string }) {
  const filename = path.split("/").at(-1) ?? path;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 text-sm">
      <FileCheck2Icon className="size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="truncate font-medium">{filename}</p>
        <p className="text-xs text-muted-foreground">Saved Word document</p>
      </div>
    </div>
  );
}

function CommittedPageArtifact({
  onOpenPage,
  path,
  workspaceId,
}: Omit<CommittedArtifactPreviewProps, "kind">) {
  const query = useQuery(pageQueryOptions(workspaceId, path));
  if (!query.data) return null;
  return <ArtifactPreview onOpenPage={onOpenPage} page={query.data} />;
}
