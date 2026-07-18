import { useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@heydesk/ui/components/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@heydesk/ui/components/sidebar";

import type { WorkspaceSummary } from "../workspace.types";
import { AssistantHome } from "@/features/assistant/components/assistant-home";
import { ArtifactView } from "@/features/artifact/components/artifact-view";
import { WorkspaceSidebar } from "./sidebar";

type WorkspaceShellProps = {
  workspace: WorkspaceSummary;
  onCloseWorkspace: () => void;
};

export function WorkspaceShell({
  workspace,
  onCloseWorkspace,
}: WorkspaceShellProps) {
  const [draftKind, setDraftKind] = useState<"page" | "document" | null>(null);
  const [activeArtifactPath, setActiveArtifactPath] = useState<string | null>(null);

  const openHome = () => {
    setDraftKind(null);
    setActiveArtifactPath(null);
  };
  const openArtifact = (path: string) => {
    setDraftKind(null);
    setActiveArtifactPath(path);
  };
  const createDraft = (kind: "page" | "document") => {
    setActiveArtifactPath(null);
    setDraftKind(kind);
  };
  const currentPage = draftKind
    ? `Untitled ${draftKind}`
    : activeArtifactPath
      ? artifactLabel(activeArtifactPath)
      : "Home";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <WorkspaceSidebar
        activeArtifactPath={activeArtifactPath}
        onCreateDocument={() => createDraft("document")}
        onCreatePage={() => createDraft("page")}
        onOpenArtifact={openArtifact}
        onOpenHome={openHome}
        onSwitchWorkspace={onCloseWorkspace}
        workspace={workspace}
      />

      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 px-3">
          <SidebarTrigger />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <button onClick={openHome} type="button" />
                  }
                >
                  {workspace.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {currentPage}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex min-h-0 flex-1 overflow-hidden">
          {activeArtifactPath ? (
            <ArtifactView path={activeArtifactPath} workspaceId={workspace.id} />
          ) : draftKind ? (
            <div className="m-auto max-w-md p-8 text-center">
              <p className="text-sm font-medium">Untitled {draftKind}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A new {draftKind} is ready for its editor.
              </p>
            </div>
          ) : (
            <AssistantHome onOpenArtifact={openArtifact} workspace={workspace} />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function artifactLabel(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename.replace(/\.mdx?$/i, "");
}
