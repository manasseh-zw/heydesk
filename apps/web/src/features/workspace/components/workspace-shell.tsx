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

  return (
    <SidebarProvider>
      <WorkspaceSidebar
        onCreateDocument={() => setDraftKind("document")}
        onCreatePage={() => setDraftKind("page")}
        onSwitchWorkspace={onCloseWorkspace}
        workspace={workspace}
      />

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-3 px-3">
          <SidebarTrigger />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <button onClick={() => setDraftKind(null)} type="button" />
                  }
                >
                  {workspace.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {draftKind ? `Untitled ${draftKind}` : "Home"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex min-h-0 flex-1 overflow-hidden">
          {draftKind ? (
            <div className="m-auto max-w-md p-8 text-center">
              <p className="text-sm font-medium">Untitled {draftKind}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A new {draftKind} is ready for its editor.
              </p>
            </div>
          ) : (
            <AssistantHome workspace={workspace} />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
