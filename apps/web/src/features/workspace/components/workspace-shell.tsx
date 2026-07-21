import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SquarePen } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@heydesk/ui/components/breadcrumb";
import { Button } from "@heydesk/ui/components/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@heydesk/ui/components/sidebar";

import type { WorkspaceSummary } from "../workspace.types";
import { AssistantHome } from "@/features/assistant/components/assistant-home";
import {
  AssistantSessionProvider,
  useAssistantSession,
} from "@/features/assistant/assistant-session";
import type {
  AssistantDocumentHandoff,
  AssistantPageHandoff,
  AssistantRunPreferences,
  AssistantScope,
} from "@/features/assistant/assistant.types";
import { PageView } from "@/features/page/components/page-view";
import { pageKeys } from "@/features/page/page.queries";
import { createPage, deletePage } from "@/features/page/page.service";
import { documentKeys } from "@/features/document/document.queries";
import {
  createDocument,
  deleteDocument,
  importDocument,
} from "@/features/document/document.service";
import { preloadDocumentView } from "@/features/document/components/lazy-document-view";
import { WorkspaceSidebar } from "./sidebar";
import {
  messageForComposerSubmission,
  type ComposerSubmission,
} from "../workspace-assistant-routing";

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
  const isDesktop = Boolean(window.heydeskDesktop);
  const queryClient = useQueryClient();
  const [activePagePath, setActivePagePath] = useState<string | null>(null);
  const [activeDocumentPath, setActiveDocumentPath] = useState<string | null>(
    null,
  );
  const [homeSessionId, setHomeSessionId] = useState(() =>
    crypto.randomUUID(),
  );
  const handledDocumentHandoffsRef = useRef(new Set<string>());
  const handledPageHandoffsRef = useRef(new Set<string>());
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
      setActivePagePath(null);
      setActiveDocumentPath(null);
    });
  };
  const startNewChat = () => {
    void afterFlush(() => {
      setHomeSessionId(crypto.randomUUID());
      setActivePagePath(null);
      setActiveDocumentPath(null);
    });
  };
  const openPage = (path: string) => {
    void afterFlush(() => {
      setActiveDocumentPath(null);
      setActivePagePath(path);
    });
  };
  const openDocument = (path: string) => {
    void afterFlush(() => {
      setActivePagePath(null);
      setActiveDocumentPath(path);
    });
  };
  const createWorkspacePage = async (name: string) => {
    await flushContentRef.current?.();
    const page = await createPage(workspace.id, name);
    await queryClient.invalidateQueries({
      queryKey: pageKeys.all(workspace.id),
    });
    setActiveDocumentPath(null);
    setActivePagePath(page.path);
  };
  const deleteWorkspacePage = async (path: string) => {
    if (activePagePath === path) {
      await flushContentRef.current?.();
    }
    await deletePage(workspace.id, path);
    queryClient.removeQueries({
      queryKey: pageKeys.detail(workspace.id, path),
    });
    await queryClient.invalidateQueries({
      queryKey: pageKeys.all(workspace.id),
    });
    if (activePagePath === path) {
      setActivePagePath(null);
      setActiveDocumentPath(null);
    }
  };
  const createWordDocument = async (name: string) => {
    await flushContentRef.current?.();
    const document = await createDocument(workspace.id, name);
    await queryClient.invalidateQueries({
      queryKey: documentKeys.all(workspace.id),
    });
    setActivePagePath(null);
    setActiveDocumentPath(document.path);
  };
  const importWordDocument = async (file: File) => {
    await flushContentRef.current?.();
    const document = await importDocument(workspace.id, file);
    await queryClient.invalidateQueries({
      queryKey: documentKeys.all(workspace.id),
    });
    setActivePagePath(null);
    setActiveDocumentPath(document.path);
  };
  const deleteWorkspaceDocument = async (path: string) => {
    if (activeDocumentPath === path) {
      await flushContentRef.current?.();
    }
    await deleteDocument(workspace.id, path);
    queryClient.removeQueries({
      queryKey: documentKeys.detail(workspace.id, path),
    });
    await queryClient.invalidateQueries({
      queryKey: documentKeys.all(workspace.id),
    });
    if (activeDocumentPath === path) {
      setActivePagePath(null);
      setActiveDocumentPath(null);
    }
  };
  const closeWorkspace = () => void afterFlush(onCloseWorkspace);
  const currentPage = activePagePath
    ? pageLabel(activePagePath)
    : activeDocumentPath
      ? documentLabel(activeDocumentPath)
      : "Home";

  const registerFlush = useCallback((flush: (() => Promise<void>) | null) => {
    flushContentRef.current = flush;
  }, []);
  const handleDocumentHandoff = useCallback(
    (handoff: AssistantDocumentHandoff) => {
      if (handledDocumentHandoffsRef.current.has(handoff.sourceRunId)) return;
      handledDocumentHandoffsRef.current.add(handoff.sourceRunId);
      openDocument(handoff.path);
    },
    [],
  );
  const handlePageHandoff = useCallback((handoff: AssistantPageHandoff) => {
    if (handledPageHandoffsRef.current.has(handoff.sourceRunId)) return;
    handledPageHandoffsRef.current.add(handoff.sourceRunId);
    openPage(handoff.path);
  }, []);
  return (
    <SidebarProvider className="h-full overflow-hidden">
      <WorkspaceSidebar
        activePagePath={activePagePath}
        activeDocumentPath={activeDocumentPath}
        onCreateDocument={createWordDocument}
        onDeleteDocument={deleteWorkspaceDocument}
        onImportDocument={importWordDocument}
        onCreatePage={createWorkspacePage}
        onDeletePage={deleteWorkspacePage}
        onOpenDocument={openDocument}
        onOpenPage={openPage}
        onOpenHome={openHome}
        onSwitchWorkspace={closeWorkspace}
        workspace={workspace}
      />

      <SidebarInset
        className={`z-20 h-full min-h-0 overflow-hidden shadow-[-5px_0_16px_-11px_rgba(15,23,42,0.16)] ${isDesktop ? "peer-data-[state=collapsed]:[--desktop-titlebar-reserve:78px]" : ""}`}
      >
        <header
          className={`flex h-12 shrink-0 items-center gap-3 border-b pr-3 pl-[calc(0.75rem+var(--desktop-titlebar-reserve,0px))] transition-[padding] ${isDesktop ? "py-2 [-webkit-app-region:drag]" : ""}`}
        >
          <SidebarTrigger
            className={isDesktop ? "[-webkit-app-region:no-drag]" : ""}
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <button
                      className={
                        isDesktop ? "[-webkit-app-region:no-drag]" : ""
                      }
                      onClick={openHome}
                      type="button"
                    />
                  }
                >
                  {workspace.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{currentPage}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Button
            className={`ml-auto font-normal ${isDesktop ? "[-webkit-app-region:no-drag]" : ""}`}
            onClick={startNewChat}
            size="sm"
            type="button"
            variant="outline"
          >
            <SquarePen />
            New chat
          </Button>
        </header>
        <main className="flex min-h-0 flex-1 overflow-hidden">
          {activePagePath ? (
            <ScopedAssistantSurface
              key={`page:${activePagePath}`}
              scope={{ kind: "page", path: activePagePath }}
              workspace={workspace}
            >
              <PageView
                onOpenDocument={openDocument}
                onOpenPage={openPage}
                onRegisterFlush={registerFlush}
                path={activePagePath}
                workspace={workspace}
              />
            </ScopedAssistantSurface>
          ) : activeDocumentPath ? (
            <ScopedAssistantSurface
              key={`document:${activeDocumentPath}`}
              scope={{ kind: "document", path: activeDocumentPath }}
              workspace={workspace}
            >
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
            </ScopedAssistantSurface>
          ) : (
            <HomeAssistantSessionSurface
              onDocumentHandoff={handleDocumentHandoff}
              onPageHandoff={handlePageHandoff}
              onOpenPage={openPage}
              sessionId={homeSessionId}
              workspace={workspace}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ScopedAssistantSurface({
  children,
  scope,
  workspace,
}: {
  children: ReactNode;
  scope: AssistantScope;
  workspace: WorkspaceSummary;
}) {
  return (
    <AssistantSessionProvider scope={scope} workspace={workspace}>
      {children}
    </AssistantSessionProvider>
  );
}

function HomeAssistantSessionSurface({
  onDocumentHandoff,
  onPageHandoff,
  onOpenPage,
  sessionId,
  workspace,
}: {
  onDocumentHandoff: (handoff: AssistantDocumentHandoff) => void;
  onPageHandoff: (handoff: AssistantPageHandoff) => void;
  onOpenPage: (path: string) => void;
  sessionId: string;
  workspace: WorkspaceSummary;
}) {
  return (
    <ScopedAssistantSurface
      scope={{ kind: "home", sessionId }}
      workspace={workspace}
    >
      <HomeAssistantSurface
        onDocumentHandoff={onDocumentHandoff}
        onPageHandoff={onPageHandoff}
        onOpenPage={onOpenPage}
        workspace={workspace}
      />
    </ScopedAssistantSurface>
  );
}

function HomeAssistantSurface({
  onDocumentHandoff,
  onPageHandoff,
  onOpenPage,
  workspace,
}: {
  onDocumentHandoff: (handoff: AssistantDocumentHandoff) => void;
  onPageHandoff: (handoff: AssistantPageHandoff) => void;
  onOpenPage: (path: string) => void;
  workspace: WorkspaceSummary;
}) {
  const session = useAssistantSession();
  useEffect(() => {
    const handoff = session.state.documentHandoff;
    if (handoff) onDocumentHandoff(handoff);
  }, [onDocumentHandoff, session.state.documentHandoff]);
  useEffect(() => {
    const handoff = session.state.pageHandoff;
    if (handoff) onPageHandoff(handoff);
  }, [onPageHandoff, session.state.pageHandoff]);
  const sendHomeMessage = async (
    message: string,
    preferences?: AssistantRunPreferences,
    submission?: ComposerSubmission,
  ) => {
    await session.sendMessage(
      messageForComposerSubmission(message, submission),
      {
        preferences,
      },
    );
  };

  return (
    <AssistantHome
      onOpenPage={onOpenPage}
      onSend={sendHomeMessage}
      workspace={workspace}
    />
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
