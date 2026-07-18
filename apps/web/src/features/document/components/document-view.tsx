import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setGoogleFontsEnabled } from "@eigenpal/docx-editor-core";
import {
  DocxEditor,
  type DocxEditorRef,
} from "@eigenpal/docx-editor-react";
import { useDocxAgentTools } from "@eigenpal/docx-editor-agents/react";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  PanelRightOpenIcon,
} from "lucide-react";

import "@eigenpal/docx-editor-react/styles.css";

import { Button } from "@heydesk/ui/components/button";
import { useTheme } from "@/components/theme-provider";
import { AssistantRail } from "@/features/assistant/components/assistant-rail";
import { useAssistantSession } from "@/features/assistant/assistant-session";
import {
  claimDocumentTool,
  respondToDocumentTool,
} from "@/features/assistant/assistant.service";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import { documentKeys, documentQueryOptions } from "../document.queries";
import {
  getDocument,
  getDocumentIfChanged,
  saveDocument,
} from "../document.service";
import {
  DocumentRevisionConflictError,
  type DocumentFile,
  type LoadedDocument,
} from "../document.types";

setGoogleFontsEnabled(false);

const documentToolNames = [
  "read_document",
  "read_selection",
  "read_page",
  "read_pages",
  "find_text",
  "read_comments",
  "read_changes",
  "add_comment",
  "suggest_change",
  "apply_formatting",
  "set_paragraph_style",
  "scroll",
] as const;
const mutatingDocumentTools = new Set([
  "add_comment",
  "suggest_change",
  "apply_formatting",
  "set_paragraph_style",
]);

type SaveStatus = "saved" | "unsaved" | "saving" | "conflict" | "error";

type DocumentViewProps = {
  workspace: WorkspaceSummary;
  path: string;
  onOpenPage: (path: string) => void;
  onRegisterFlush: (flush: (() => Promise<void>) | null) => void;
};

export function DocumentView({
  workspace,
  path,
  onOpenPage,
  onRegisterFlush,
}: DocumentViewProps) {
  const queryClient = useQueryClient();
  const query = useQuery(documentQueryOptions(workspace.id, path));
  const [loaded, setLoaded] = useState<LoadedDocument | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<DocumentFile | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [railWidth, setRailWidth] = useState(380);
  const editorRef = useRef<DocxEditorRef>(null);
  const loadedRef = useRef<LoadedDocument | null>(null);
  const statusRef = useRef<SaveStatus>("saved");
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const changedDuringSaveRef = useRef(false);
  const suppressChangesRef = useRef(false);
  const handledToolCallsRef = useRef(new Set<string>());
  const toolChainRef = useRef(Promise.resolve());
  const session = useAssistantSession();
  const { resolvedTheme } = useTheme();
  const { executeToolCall } = useDocxAgentTools({
    editorRef,
    author: "Heydesk",
    include: documentToolNames,
  });

  useEffect(() => {
    if (!query.data || loadedRef.current) return;
    loadedRef.current = query.data;
    setLoaded(query.data);
    dirtyRef.current = false;
    setConflict(null);
    statusRef.current = "saved";
    setStatus("saved");
  }, [query.data]);

  const updateStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const performSave = useCallback(
    async (revisionOverride?: string) => {
      if (!dirtyRef.current || !editorRef.current || !loadedRef.current) return;
      if (statusRef.current === "conflict" && !revisionOverride) {
        throw new Error("Resolve the document conflict before saving.");
      }
      updateStatus("saving");
      changedDuringSaveRef.current = false;
      const buffer = await editorRef.current.save();
      if (!buffer) throw new Error("The document editor is not ready to save.");
      try {
        const saved = await saveDocument(
          workspace.id,
          path,
          buffer,
          revisionOverride ?? loadedRef.current.revision,
        );
        const next: LoadedDocument = { ...saved, buffer };
        loadedRef.current = next;
        queryClient.setQueryData(documentKeys.detail(workspace.id, path), next);
        await queryClient.invalidateQueries({ queryKey: documentKeys.all(workspace.id) });
        setConflict(null);
        if (changedDuringSaveRef.current) {
          dirtyRef.current = true;
          updateStatus("unsaved");
          scheduleSave();
        } else {
          dirtyRef.current = false;
          updateStatus("saved");
        }
      } catch (error) {
        if (error instanceof DocumentRevisionConflictError) {
          setConflict(error.current);
          updateStatus("conflict");
        } else {
          updateStatus("error");
        }
        throw error;
      }
    },
    [path, queryClient, updateStatus, workspace.id],
  );

  const flush = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    saveChainRef.current = saveChainRef.current.then(() => performSave());
    return saveChainRef.current;
  }, [performSave]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveChainRef.current = saveChainRef.current
        .then(() => performSave())
        .catch(() => undefined);
    }, 1_500);
  }, [performSave]);

  useEffect(() => {
    onRegisterFlush(flush);
    return () => onRegisterFlush(null);
  }, [flush, onRegisterFlush]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const loadDurableDocument = useCallback(
    async (disk: LoadedDocument) => {
      suppressChangesRef.current = true;
      try {
        await editorRef.current?.loadDocumentBuffer(disk.buffer);
      } finally {
        suppressChangesRef.current = false;
      }
      loadedRef.current = disk;
      queryClient.setQueryData(documentKeys.detail(workspace.id, path), disk);
      dirtyRef.current = false;
      setConflict(null);
      updateStatus("saved");
    },
    [path, queryClient, updateStatus, workspace.id],
  );

  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      const baseline = loadedRef.current;
      if (!baseline) return;
      void getDocumentIfChanged(workspace.id, path, baseline.revision)
        .then((changed) => {
          if (!changed) return;
          if (dirtyRef.current) {
            setConflict(changed);
            updateStatus("conflict");
            return;
          }
          void loadDurableDocument(changed);
        })
        .catch(() => undefined);
    }, 5_000);
    return () => clearInterval(interval);
  }, [loadDurableDocument, loaded, path, updateStatus, workspace.id]);

  const reloadDiskVersion = async () => {
    const disk = await getDocument(workspace.id, path);
    await loadDurableDocument(disk);
  };

  const overwriteDraft = async () => {
    if (!conflict) return;
    dirtyRef.current = true;
    await performSave(conflict.revision);
  };

  useEffect(() => {
    for (const call of session.state.documentToolCalls) {
      if (handledToolCallsRef.current.has(call.callId)) continue;
      handledToolCallsRef.current.add(call.callId);
      toolChainRef.current = toolChainRef.current.then(async () => {
        try {
          await claimDocumentTool(workspace.id, call.callId);
          const result = executeToolCall(call.tool, call.arguments);
          let revision: string | undefined;
          if (result.success && mutatingDocumentTools.has(call.tool)) {
            dirtyRef.current = true;
            await performSave();
            revision = loadedRef.current?.revision;
          }
          await respondToDocumentTool(workspace.id, call.callId, {
            success: result.success,
            ...(result.success ? { data: result.data } : { error: result.error }),
            ...(revision ? { revision } : {}),
          });
        } catch (error) {
          await reloadDiskVersion().catch(() => undefined);
          await respondToDocumentTool(workspace.id, call.callId, {
            success: false,
            error: error instanceof Error ? error.message : "The document action failed.",
          }).catch(() => undefined);
        }
      });
    }
  }, [executeToolCall, performSave, session.state.documentToolCalls, workspace.id]);

  const sendDocumentMessage = async (message: string) => {
    await flush();
    const current = loadedRef.current;
    if (!current) return;
    await session.sendMessage(message, {
      context: {
        kind: "document",
        path,
        expectedRevision: current.revision,
      },
    });
  };

  if (query.isError) {
    return <div className="m-auto text-sm text-destructive">{query.error.message}</div>;
  }
  if (query.isPending || !loaded) {
    return (
      <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Opening document…
      </div>
    );
  }
  return (
    <div className="flex size-full min-w-0">
      <section className="relative min-w-0 flex-1 overflow-hidden bg-muted/35">
        <DocxEditor
          ref={editorRef}
          author="Heydesk user"
          className="size-full"
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          documentBuffer={loaded.buffer}
          documentName={loaded.name}
          documentNameEditable={false}
          mode={session.isRunning ? "viewing" : "editing"}
          onChange={() => {
            if (suppressChangesRef.current) return;
            if (statusRef.current === "saving") changedDuringSaveRef.current = true;
            dirtyRef.current = true;
            updateStatus("unsaved");
            scheduleSave();
          }}
          onError={() => updateStatus("error")}
          showFileOpen={false}
          showHelpMenu={false}
          showMarginGuides
          showRuler
          renderTitleBarRight={() => (
            <div className="flex items-center gap-1">
              <SaveIndicator status={status} />
              {!railOpen && (
                <Button
                  aria-label="Open document assistant"
                  onClick={() => setRailOpen(true)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <PanelRightOpenIcon />
                </Button>
              )}
              <Button
                aria-label="Open document assistant"
                className="lg:hidden"
                onClick={() => setMobileRailOpen(true)}
                size="icon-sm"
                variant="ghost"
              >
                <PanelRightOpenIcon />
              </Button>
            </div>
          )}
        />
        {conflict && (
          <div className="absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-3xl border bg-background/95 p-3 shadow-lg backdrop-blur">
            <AlertTriangle className="size-4 text-amber-600" />
            <span className="text-sm">This document changed on disk.</span>
            <Button onClick={() => void reloadDiskVersion()} size="sm" variant="outline">
              Reload disk version
            </Button>
            <Button onClick={() => void overwriteDraft()} size="sm">
              Overwrite with my draft
            </Button>
          </div>
        )}
      </section>
      <AssistantRail
        disabled={status === "conflict"}
        mobileOpen={mobileRailOpen}
        onMobileOpenChange={setMobileRailOpen}
        onOpenChange={setRailOpen}
        onOpenPage={onOpenPage}
        onSend={sendDocumentMessage}
        onWidthChange={setRailWidth}
        open={railOpen}
        title="Document assistant"
        width={railWidth}
        workspace={workspace}
      />
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return <span className="flex items-center gap-1.5 text-xs"><LoaderCircle className="size-3 animate-spin" />Saving</span>;
  }
  if (status === "saved") {
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3" />Saved</span>;
  }
  return (
    <span className={status === "conflict" || status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
      {status === "unsaved" ? "Unsaved" : status === "conflict" ? "Conflict" : "Save failed"}
    </span>
  );
}
