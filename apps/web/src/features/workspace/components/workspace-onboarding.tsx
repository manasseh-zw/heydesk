import { useEffect, useId, useState } from "react";
import { Folder, FolderOpen, LoaderCircle, Plus, RotateCcw } from "lucide-react";

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

type DialogMode = "create" | "open" | null;

export function WorkspaceOnboarding() {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

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

  if (selectedWorkspace) {
    return (
      <main className="grid min-h-svh place-items-center px-6">
        <div className="max-w-md text-center">
          <LogoMark className="mx-auto size-12 text-primary" />
          <h1 className="mt-6 font-heading text-2xl font-semibold tracking-tight">
            {selectedWorkspace.name} is ready
          </h1>
          <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
            {selectedWorkspace.path}
          </p>
          <Button className="mt-6" variant="outline" onClick={() => setSelectedWorkspace(null)}>
            Back to workspaces
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-svh overflow-y-auto bg-background px-7 py-14 sm:px-12 md:px-16 md:py-20">
      <section className="mx-auto flex w-full max-w-4xl flex-col justify-center md:min-h-[calc(100svh-10rem)]">
        <header className="flex items-center gap-3.5">
          <LogoMark className="size-11 shrink-0 text-primary" />
          <div>
            <h1 className="font-brand text-2xl font-semibold tracking-tight">Heydesk</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Your local AI workspace</p>
          </div>
        </header>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
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
            onClick={() => setDialogMode("open")}
          />
        </div>

        <div className="mt-12 min-h-40">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Recent
            </h2>
            {error && (
              <Button size="sm" variant="ghost" onClick={() => void loadOverview()}>
                <RotateCcw /> Retry
              </Button>
            )}
          </div>

          {!overview && !error && (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Loading workspaces…
            </div>
          )}
          {error && <p className="mt-5 text-sm text-destructive">{error}</p>}
          {overview?.recent.length === 0 && (
            <div className="mt-6 rounded-3xl border border-dashed px-5 py-7 text-sm text-muted-foreground">
              Your recently opened workspaces will appear here.
            </div>
          )}
          {overview && overview.recent.length > 0 && (
            <div className="mt-4 divide-y">
              {overview.recent.map((workspace) => (
                <button
                  className="group flex w-full items-center gap-4 rounded-2xl px-2 py-4 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  key={workspace.path}
                  onClick={() => setSelectedWorkspace(workspace)}
                  type="button"
                >
                  <Folder className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{workspace.name}</span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {workspace.path}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <WorkspaceDialog
        defaultLocation={overview?.defaultLocation ?? "~/Documents/Heydesk"}
        mode={dialogMode}
        onOpenChange={(open) => !open && setDialogMode(null)}
        onWorkspaceReady={(workspace) => {
          setOverview((current) =>
            current
              ? {
                  ...current,
                  recent: [workspace, ...current.recent.filter((item) => item.path !== workspace.path)],
                }
              : current,
          );
          setDialogMode(null);
          setSelectedWorkspace(workspace);
        }}
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
    <button
      className="group flex min-h-24 items-start gap-3.5 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      onClick={onClick}
      type="button"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block font-heading text-base font-medium">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
    </button>
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
