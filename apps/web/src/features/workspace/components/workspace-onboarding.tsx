import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@heydesk/ui/components/dropdown-menu";

import { LogoMark } from "@/components/logo";
import { assistantKeys } from "@/features/assistant/assistant.queries";
import { getAssistantReadiness } from "@/features/assistant/assistant.service";
import { documentsQueryOptions } from "@/features/document/document.queries";
import { pagesQueryOptions } from "@/features/page/page.queries";
import {
  createWorkspace,
  getWorkspaceOverview,
  openWorkspace,
  removeWorkspace,
} from "../workspace.service";
import type { WorkspaceOverview, WorkspaceSummary } from "../workspace.types";
import { WorkspaceShell } from "./workspace-shell";

type DialogMode = "create" | "open" | null;
type WorkspaceTransition =
  | "idle"
  | "mounting"
  | "presenting"
  | "splash"
  | "revealing";

const workspaceSplashDurationMs = 1_800;
const workspaceSplashExitMs = 280;

export function WorkspaceOnboarding() {
  const queryClient = useQueryClient();
  const openingRef = useRef(false);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [transition, setTransition] = useState<WorkspaceTransition>("idle");
  const [workspaceToRemove, setWorkspaceToRemove] =
    useState<WorkspaceSummary | null>(null);
  const [removingWorkspace, setRemovingWorkspace] = useState(false);

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

  useEffect(() => {
    if (!selectedWorkspace || transition !== "mounting") return;
    let cancelled = false;

    const reveal = async () => {
      await nextStablePaint();
      if (cancelled) return;
      setTransition("presenting");
    };
    void reveal();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspace, transition]);

  useEffect(() => {
    if (!selectedWorkspace || transition !== "presenting") return;
    let cancelled = false;

    const reveal = async () => {
      // Give the browser compositor a complete branded splash frame before
      // asking Electron to expose the maximized native window.
      await nextStablePaint();
      try {
        await window.heydeskDesktop?.revealWorkspaceWindow();
      } catch (revealError) {
        setError(toMessage(revealError));
      }
      if (cancelled) return;
      setTransition("splash");
    };
    void reveal();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkspace, transition]);

  useEffect(() => {
    if (transition !== "splash") return;
    const timer = window.setTimeout(
      () => setTransition("revealing"),
      workspaceSplashDurationMs,
    );
    return () => window.clearTimeout(timer);
  }, [transition]);

  useEffect(() => {
    if (transition !== "revealing") return;
    const timer = window.setTimeout(
      () => setTransition("idle"),
      workspaceSplashExitMs,
    );
    return () => window.clearTimeout(timer);
  }, [transition]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "workspace-splash",
      transition !== "idle",
    );
  }, [transition]);

  async function handleWorkspaceReady(workspace: WorkspaceSummary) {
    setOverview((current) =>
      current
        ? {
            ...current,
            recent: [workspace, ...current.recent.filter((item) => item.path !== workspace.path)],
          }
        : current,
    );
    await Promise.allSettled([
      queryClient.ensureQueryData(pagesQueryOptions(workspace.id)),
      queryClient.ensureQueryData(documentsQueryOptions(workspace.id)),
      queryClient.ensureQueryData({
        queryKey: assistantKeys.readiness(),
        queryFn: getAssistantReadiness,
      }),
    ]);
    setDialogMode(null);
    setTransition("mounting");
    try {
      await window.heydeskDesktop?.prepareWorkspaceWindow();
    } catch (transitionError) {
      setTransition("idle");
      throw transitionError;
    }
    setSelectedWorkspace(workspace);
  }

  async function openWorkspacePath(path: string) {
    if (openingRef.current) return;
    openingRef.current = true;
    setError(null);
    try {
      await handleWorkspaceReady(await openWorkspace(path));
    } catch (openError) {
      setError(toMessage(openError));
    } finally {
      openingRef.current = false;
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
      if (path) await openWorkspacePath(path);
    } catch (pickError) {
      setError(toMessage(pickError));
    }
  }

  async function confirmRemoveWorkspace() {
    if (!workspaceToRemove) return;
    setRemovingWorkspace(true);
    setError(null);
    try {
      await removeWorkspace(workspaceToRemove.id);
      setOverview((current) =>
        current
          ? {
              ...current,
              recent: current.recent.filter(
                (workspace) => workspace.id !== workspaceToRemove.id,
              ),
            }
          : current,
      );
      queryClient.removeQueries({
        queryKey: ["workspaces", workspaceToRemove.id],
      });
      setWorkspaceToRemove(null);
    } catch (removeError) {
      setError(toMessage(removeError));
    } finally {
      setRemovingWorkspace(false);
    }
  }

  if (selectedWorkspace) {
    const workspaceVisible =
      transition === "idle" || transition === "revealing";
    return (
      <div
        className={`relative size-full overflow-hidden ${transition === "idle" ? "bg-background" : "bg-transparent"}`}
      >
        <div
          className={
            workspaceVisible ? "size-full visible" : "size-full invisible"
          }
        >
          <WorkspaceShell
            onCloseWorkspace={() => {
              void window.heydeskDesktop?.setWindowMode("launcher");
              setSelectedWorkspace(null);
            }}
            workspace={selectedWorkspace}
          />
        </div>
        {transition !== "idle" && (
          <div
            aria-label="Heydesk"
            className={`fixed inset-0 z-[100] grid place-items-center bg-white/32 transition-opacity ease-out motion-reduce:transition-none ${transition === "revealing" ? "pointer-events-none opacity-0" : "opacity-100"}`}
            role="status"
            style={{ transitionDuration: `${workspaceSplashExitMs}ms` }}
          >
            <div
              className={`flex items-center gap-2.5 transition-[opacity,transform] duration-350 ease-out motion-reduce:transition-none ${transition === "mounting" ? "translate-y-1 scale-[0.985] opacity-0" : "translate-y-0 scale-100 opacity-100"}`}
            >
              <LogoMark className="size-7 shrink-0 text-logo-mark" />
              <span className="font-brand text-3xl font-normal tracking-normal text-foreground/80">
                Heydesk
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="relative flex h-full w-full overflow-hidden bg-background">
      <section className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden px-7 py-10 sm:px-12 sm:py-12">
        <div className="my-auto flex min-h-0 flex-col gap-9">
          <header className="flex shrink-0 items-center gap-3">
            <LogoMark className="size-10 shrink-0 text-logo-mark" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5">
                <h1 className="font-brand text-xl font-normal tracking-normal text-foreground/80">
                  Heydesk
                </h1>
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
                  <div className="group relative" key={workspace.path}>
                    <Button
                      className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 pr-10 text-left"
                      onClick={() => void openWorkspacePath(workspace.path)}
                      variant="ghost"
                    >
                      <Folder className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {workspace.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                          {workspace.path}
                        </span>
                      </span>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Workspace options for ${workspace.name}`}
                        className="absolute top-1/2 right-3 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 group-hover:opacity-100 aria-expanded:opacity-100"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-32 min-w-32 rounded-lg p-0.5"
                      >
                        <DropdownMenuItem
                          className="gap-1.5 rounded-md px-1.5 py-1 text-xs font-normal [&_svg]:size-3"
                          onClick={() => setWorkspaceToRemove(workspace)}
                          variant="destructive"
                        >
                          <Trash2 /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
      <Dialog
        open={Boolean(workspaceToRemove)}
        onOpenChange={(open) => {
          if (!open && !removingWorkspace) setWorkspaceToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove “{workspaceToRemove?.name}” from Heydesk?
            </DialogTitle>
            <DialogDescription>
              This clears it from your recent workspaces. The folder and all of
              its files remain safely on your computer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              disabled={removingWorkspace}
              onClick={() => void confirmRemoveWorkspace()}
              type="button"
              variant="destructive"
            >
              {removingWorkspace ? "Removing…" : "Remove workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  onWorkspaceReady: (workspace: WorkspaceSummary) => Promise<void>;
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
      await onWorkspaceReady(workspace);
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

function nextStablePaint(): Promise<void> {
  return new Promise((complete) => {
    requestAnimationFrame(() => requestAnimationFrame(() => complete()));
  });
}
