import { useEffect, useId, useState } from "react";
import { Folder, FolderOpen, LoaderCircle, Plus } from "lucide-react";

import { Button } from "@heydesk/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@heydesk/ui/components/dialog";
import { Input } from "@heydesk/ui/components/input";
import { Label } from "@heydesk/ui/components/label";

import { LogoMark } from "@/components/logo";
import {
  createWorkspace,
  getWorkspaceOverview,
  openWorkspace,
} from "../workspace.service";
import type { WorkspaceOverview, WorkspaceSummary } from "../workspace.types";
import { WorkspaceShell } from "./workspace-shell";

type DialogMode = "create" | "open" | null;

export function WorkspaceOnboarding() {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [openingLabel, setOpeningLabel] = useState<string | null>(null);

  async function loadOverview() {
    setError(null);
    try {
      setOverview(await getWorkspaceOverview());
    } catch (loadError) {
      setError(toMessage(loadError));
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  function handleWorkspaceReady(workspace: WorkspaceSummary) {
    setOverview((current) =>
      current
        ? {
            ...current,
            recent: [workspace, ...current.recent.filter((item) => item.path !== workspace.path)],
          }
        : current,
    );
    void window.heydeskDesktop?.setWindowMode("workspace");
    setDialogMode(null);
    setSelectedWorkspace(workspace);
  }

  async function openWorkspacePath(path: string, label: string) {
    setError(null);
    setOpeningLabel(label);
    try {
      handleWorkspaceReady(await openWorkspace(path));
    } catch (openError) {
      setError(toMessage(openError));
    } finally {
      setOpeningLabel(null);
    }
  }

  async function chooseWorkspaceFolder() {
    const pickWorkspaceFolder = window.heydeskDesktop?.pickWorkspaceFolder;
    if (!pickWorkspaceFolder) {
      setDialogMode("open");
      return;
    }

    setError(null);
    try {
      const path = await pickWorkspaceFolder();
      if (path) await openWorkspacePath(path, displayNameForPath(path));
    } catch (pickError) {
      setError(toMessage(pickError));
    }
  }

  if (selectedWorkspace) {
    return (
      <WorkspaceShell
        onCloseWorkspace={() => {
          void window.heydeskDesktop?.setWindowMode("launcher");
          setSelectedWorkspace(null);
        }}
        workspace={selectedWorkspace}
      />
    );
  }

  return (
    <main className="relative flex h-full w-full overflow-hidden bg-background">
      {openingLabel && (
        <div
          aria-live="polite"
          className="absolute inset-0 z-50 grid place-items-center bg-background/85 backdrop-blur-sm"
          role="status"
        >
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Opening {openingLabel}…
          </div>
        </div>
      )}

      <section className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden px-7 py-10 sm:px-12 sm:py-12">
        <div className="my-auto flex min-h-0 flex-col gap-9">
          <header className="flex shrink-0 items-center gap-3">
            <LogoMark className="size-10 shrink-0 text-logo-mark" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5">
                <h1 className="font-brand text-xl font-semibold tracking-tight">Heydesk</h1>
                {window.heydeskDesktop?.appVersion && (
                  <span className="font-mono text-[0.6875rem] text-muted-foreground">
                    v{window.heydeskDesktop.appVersion}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Your local AI workspace</p>
            </div>
          </header>

          <div className="grid shrink-0 gap-3 sm:grid-cols-2">
            <WorkspaceAction
              icon={Plus}
              title="Create new workspace"
              description="Start with a private workspace in Documents."
              onClick={() => setDialogMode("create")}
            />
            <WorkspaceAction
              icon={FolderOpen}
              title="Open existing folder"
              description="Use a folder you already have on this machine."
              onClick={() => void chooseWorkspaceFolder()}
            />
          </div>

          {error && (
            <div
              className="flex shrink-0 items-center justify-between gap-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5"
              role="alert"
            >
              <p className="text-xs text-destructive">{error}</p>
              <Button
                className="h-auto shrink-0 px-1.5 py-0.5 text-xs text-destructive"
                onClick={() => setError(null)}
                variant="ghost"
              >
                Dismiss
              </Button>
            </div>
          )}

          <section className="flex min-h-0 flex-col" aria-labelledby="recent-workspaces-heading">
            <h2
              className="mb-2 shrink-0 font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase"
              id="recent-workspaces-heading"
            >
              Recent
            </h2>

            {!overview && !error && (
              <div className="flex h-16 items-center justify-center text-muted-foreground" role="status">
                <LoaderCircle className="size-4 animate-spin opacity-70" />
                <span className="sr-only">Loading workspaces…</span>
              </div>
            )}
            {overview?.recent.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                Workspaces you open will appear here for quick access.
              </p>
            )}
            {overview && overview.recent.length > 0 && (
              <div className="-mx-3 max-h-52 min-h-0 space-y-0.5 overflow-y-auto px-1">
                {overview.recent.map((workspace) => (
                  <Button
                    className="group h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left"
                    key={workspace.path}
                    onClick={() => void openWorkspacePath(workspace.path, workspace.name)}
                    variant="ghost"
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{workspace.name}</span>
                      <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                        {workspace.path}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      <WorkspaceDialog
        defaultLocation={overview?.defaultLocation ?? "~/Documents/Heydesk"}
        mode={dialogMode}
        onOpenChange={(open) => !open && setDialogMode(null)}
        onWorkspaceReady={handleWorkspaceReady}
      />
    </main>
  );
}

type WorkspaceActionProps = {
  icon: typeof Plus;
  title: string;
  description: string;
  onClick: () => void;
};

function WorkspaceAction({ icon: Icon, title, description, onClick }: WorkspaceActionProps) {
  return (
    <Button
      className="h-auto min-h-20 flex-col items-start justify-start gap-1.5 rounded-xl bg-card/70 px-4 py-3.5 text-left whitespace-normal"
      onClick={onClick}
      variant="outline"
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="font-heading text-sm font-medium">{title}</span>
      </span>
      <span className="text-xs leading-snug font-normal text-muted-foreground">{description}</span>
    </Button>
  );
}

type WorkspaceDialogProps = {
  defaultLocation: string;
  mode: DialogMode;
  onOpenChange: (open: boolean) => void;
  onWorkspaceReady: (workspace: WorkspaceSummary) => void;
};

function WorkspaceDialog({
  defaultLocation,
  mode,
  onOpenChange,
  onWorkspaceReady,
}: WorkspaceDialogProps) {
  const nameId = useId();
  const pathId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValue("");
    setError(null);
  }, [mode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const workspace =
        mode === "create" ? await createWorkspace(value) : await openWorkspace(value);
      onWorkspaceReady(workspace);
    } catch (submitError) {
      setError(toMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  const isCreate = mode === "create";
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isCreate ? "Create new workspace" : "Open existing folder"}</DialogTitle>
            <DialogDescription>
              {isCreate
                ? "Create a private Heydesk workspace with a useful starting page."
                : "Enter the full path to a folder already on this machine."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor={isCreate ? nameId : pathId}>
                {isCreate ? "Workspace name" : "Folder path"}
              </Label>
              <Input
                autoFocus
                id={isCreate ? nameId : pathId}
                onChange={(event) => setValue(event.target.value)}
                placeholder={isCreate ? "Acme workspace" : "/Users/you/Documents/Acme"}
                value={value}
              />
            </div>
            {isCreate && (
              <div className="space-y-2">
                <Label>Location</Label>
                <div className="truncate rounded-3xl bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
                  {defaultLocation}
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="mt-7">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button disabled={!value.trim() || submitting} type="submit">
              {submitting && <LoaderCircle className="animate-spin" />}
              {isCreate ? "Create workspace" : "Open folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function displayNameForPath(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments.at(-1) ?? path;
}
