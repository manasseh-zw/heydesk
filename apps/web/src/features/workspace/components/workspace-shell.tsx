import { useRef, useState } from "react";

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
import { AssistantSessionProvider } from "@/features/assistant/assistant-session";
import { PageView } from "@/features/page/components/page-view";
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
  const [activePagePath, setActivePagePath] = useState<string | null>(null);
  const flushPageRef = useRef<(() => Promise<void>) | null>(null);

  const afterFlush = async (navigate: () => void) => {
    try {
      await flushPageRef.current?.();
      navigate();
    } catch {
      // The editor surfaces the save conflict and keeps the page open.
    }
  };

  const openHome = () => {
    void afterFlush(() => {
      setDraftKind(null);
      setActivePagePath(null);
    });
  };
  const openPage = (path: string) => {
    void afterFlush(() => {
      setDraftKind(null);
      setActivePagePath(path);
    });
  };
  const createDraft = (kind: "page" | "document") => {
    void afterFlush(() => {
      setActivePagePath(null);
      setDraftKind(kind);
    });
  };
  const closeWorkspace = () => void afterFlush(onCloseWorkspace);
  const currentPage = draftKind
    ? `Untitled ${draftKind}`
    : activePagePath
      ? pageLabel(activePagePath)
      : "Home";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AssistantSessionProvider workspace={workspace}>
        <WorkspaceSidebar
          activePagePath={activePagePath}
          onCreateDocument={() => createDraft("document")}
          onCreatePage={() => createDraft("page")}
          onOpenPage={openPage}
          onOpenHome={openHome}
          onSwitchWorkspace={closeWorkspace}
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
          {activePagePath ? (
            <PageView
              onOpenPage={openPage}
              onRegisterFlush={(flush) => {
                flushPageRef.current = flush;
              }}
              path={activePagePath}
              workspace={workspace}
            />
          ) : draftKind ? (
            <div className="m-auto max-w-md p-8 text-center">
              <p className="text-sm font-medium">Untitled {draftKind}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A new {draftKind} is ready for its editor.
              </p>
            </div>
          ) : (
            <AssistantHome onOpenPage={openPage} workspace={workspace} />
          )}
        </main>
        </SidebarInset>
      </AssistantSessionProvider>
    </SidebarProvider>
  );
}

function pageLabel(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename.replace(/\.mdx?$/i, "");
}
