import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
import { documentKeys } from "@/features/document/document.queries";
import {
  createDocument,
  importDocument,
} from "@/features/document/document.service";
import { preloadDocumentView } from "@/features/document/components/lazy-document-view";
import { WorkspaceSidebar } from "./sidebar";

const LazyDocumentView = lazy(() =>
  preloadDocumentView().then((module) => ({ default: module.DocumentView })),
);

type WorkspaceShellProps = {
  workspace: WorkspaceSummary;
  onCloseWorkspace: () => void;
};

export function WorkspaceShell({
  workspace,
  onCloseWorkspace,
}: WorkspaceShellProps) {
  const queryClient = useQueryClient();
  const [draftKind, setDraftKind] = useState<"page" | null>(null);
  const [activePagePath, setActivePagePath] = useState<string | null>(null);
  const [activeDocumentPath, setActiveDocumentPath] = useState<string | null>(null);
  const flushContentRef = useRef<(() => Promise<void>) | null>(null);

  const afterFlush = async (navigate: () => void) => {
    try {
      await flushContentRef.current?.();
      navigate();
    } catch {
      // The editor surfaces the save conflict and keeps the page open.
    }
  };

  const openHome = () => {
    void afterFlush(() => {
      setDraftKind(null);
      setActivePagePath(null);
      setActiveDocumentPath(null);
    });
  };
  const openPage = (path: string) => {
    void afterFlush(() => {
      setDraftKind(null);
      setActiveDocumentPath(null);
      setActivePagePath(path);
    });
  };
  const openDocument = (path: string) => {
    void afterFlush(() => {
      setDraftKind(null);
      setActivePagePath(null);
      setActiveDocumentPath(path);
    });
  };
  const createDraft = () => {
    void afterFlush(() => {
      setActivePagePath(null);
      setActiveDocumentPath(null);
      setDraftKind("page");
    });
  };
  const createWordDocument = async (name: string) => {
    await flushContentRef.current?.();
    const document = await createDocument(workspace.id, name);
    await queryClient.invalidateQueries({ queryKey: documentKeys.all(workspace.id) });
    setDraftKind(null);
    setActivePagePath(null);
    setActiveDocumentPath(document.path);
  };
  const importWordDocument = async (file: File) => {
    await flushContentRef.current?.();
    const document = await importDocument(workspace.id, file);
    await queryClient.invalidateQueries({ queryKey: documentKeys.all(workspace.id) });
    setDraftKind(null);
    setActivePagePath(null);
    setActiveDocumentPath(document.path);
  };
  const closeWorkspace = () => void afterFlush(onCloseWorkspace);
  const currentPage = draftKind
    ? `Untitled ${draftKind}`
    : activePagePath
      ? pageLabel(activePagePath)
      : activeDocumentPath
        ? documentLabel(activeDocumentPath)
      : "Home";

  const registerFlush = useCallback((flush: (() => Promise<void>) | null) => {
    flushContentRef.current = flush;
  }, []);
  const assistantScope = activeDocumentPath
    ? ({ kind: "document", path: activeDocumentPath } as const)
    : ({ kind: "workspace" } as const);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AssistantSessionProvider
        key={activeDocumentPath ? `document:${activeDocumentPath}` : "workspace"}
        scope={assistantScope}
        workspace={workspace}
      >
        <WorkspaceSidebar
          activePagePath={activePagePath}
          activeDocumentPath={activeDocumentPath}
          onCreateDocument={createWordDocument}
          onImportDocument={importWordDocument}
          onCreatePage={createDraft}
          onOpenDocument={openDocument}
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
              onRegisterFlush={registerFlush}
              path={activePagePath}
              workspace={workspace}
            />
          ) : activeDocumentPath ? (
            <Suspense
              fallback={
                <div className="m-auto text-sm text-muted-foreground">
                  Loading Word editor…
                </div>
              }
            >
              <LazyDocumentView
                onOpenPage={openPage}
                onRegisterFlush={registerFlush}
                path={activeDocumentPath}
                workspace={workspace}
              />
            </Suspense>
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

function documentLabel(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename.replace(/\.docx$/i, "");
}
