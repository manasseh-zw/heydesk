import { ArrowUpRightIcon, DownloadIcon, FileTextIcon } from "lucide-react";

import { Button } from "@heydesk/ui/components/button";

import {
  Document,
  DocumentAction,
  DocumentContent,
  DocumentHeader,
  DocumentTitle,
} from "@/components/ai/document";
import { Markdown } from "@/components/ai/markdown";
import type { Page } from "@/features/page/page.types";

type ArtifactPreviewProps = {
  page: Page;
  onOpenPage: (path: string) => void;
};

export function ArtifactPreview({ page, onOpenPage }: ArtifactPreviewProps) {
  const filename = page.path.split("/").at(-1) ?? page.path;

  return (
    <div className="relative">
      <Document className="overflow-hidden" collapsedHeight={260}>
        <DocumentHeader className="h-12 px-4">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <DocumentTitle className="truncate text-foreground">
            {filename}
          </DocumentTitle>
          <DocumentAction>
            <Button
              aria-label={`Download ${filename}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => downloadArtifact(page.content, filename)}
              size="icon-sm"
              variant="ghost"
            >
              <DownloadIcon />
            </Button>
          </DocumentAction>
        </DocumentHeader>
        <DocumentContent>
          <div className="px-1 pb-12 pt-2">
            <Markdown>{page.content}</Markdown>
          </div>
        </DocumentContent>
      </Document>

      <Button
        className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-foreground/90 px-4 text-xs text-background shadow-sm backdrop-blur-xl hover:bg-foreground"
        onClick={() => onOpenPage(page.path)}
        size="sm"
      >
        Open page
        <ArrowUpRightIcon />
      </Button>
    </div>
  );
}

function downloadArtifact(content: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
