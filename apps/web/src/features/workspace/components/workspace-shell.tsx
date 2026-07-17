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
import { WorkspaceSidebar } from "./sidebar";

type WorkspaceShellProps = {
  workspace: WorkspaceSummary;
  onCloseWorkspace: () => void;
};

export function WorkspaceShell({ workspace, onCloseWorkspace }: WorkspaceShellProps) {
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
                    <button
                      onClick={() => setDraftKind(null)}
                      type="button"
                    />
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
        <main className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <p className="text-sm font-medium">
              {draftKind ? `Untitled ${draftKind}` : workspace.name}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {draftKind
                ? `A new ${draftKind} is ready for its editor.`
                : "Your workspace frame is ready. Pages, content, and assistant activity will live here."}
            </p>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
