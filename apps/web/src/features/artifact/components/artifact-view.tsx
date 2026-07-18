import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@heydesk/ui/components/button";

import { Markdown } from "@/components/ai/markdown";
import { artifactQueryOptions } from "../artifact.queries";

type ArtifactViewProps = {
  path: string;
  workspaceId: string;
};

export function ArtifactView({ path, workspaceId }: ArtifactViewProps) {
  const query = useQuery(artifactQueryOptions(workspaceId, path));

  if (query.isPending) {
    return (
      <div className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" />
        Opening artifact
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="m-auto max-w-sm text-center">
        <AlertCircleIcon className="mx-auto size-5 text-destructive" />
        <p className="mt-3 text-sm">{query.error.message}</p>
        <Button
          className="mt-4"
          onClick={() => void query.refetch()}
          size="sm"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="size-full overflow-y-auto">
      <article className="mx-auto w-full max-w-3xl px-8 py-12">
        <p className="mb-8 text-xs text-muted-foreground">{query.data.path}</p>
        <Markdown>{query.data.content}</Markdown>
      </article>
    </div>
  );
}
