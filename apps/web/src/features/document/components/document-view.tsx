import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  setGoogleFontsEnabled,
  type TextFormatting,
} from "@eigenpal/docx-editor-core";
import {
  DocxEditor,
  type DocxEditorRef,
} from "@eigenpal/docx-editor-react";
import { useDocxAgentTools } from "@eigenpal/docx-editor-agents/react";
import {
  AlertCircle,
  AlertTriangle,
  CheckIcon,
  LoaderCircleIcon,
  PanelRightOpenIcon,
} from "lucide-react";

import "@eigenpal/docx-editor-react/styles.css";
import "./document-editor.css";

import { Button } from "@heydesk/ui/components/button";
import { MicrosoftWord } from "@/components/icons";
import {
  AssistantRail,
  defaultAssistantRailWidth,
} from "@/features/assistant/components/assistant-rail";
import { useAssistantSession } from "@/features/assistant/assistant-session";
import type { AssistantRunPreferences } from "@/features/assistant/assistant.types";
import {
  claimDocumentTool,
  respondToDocumentTool,
} from "@/features/assistant/assistant.service";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import {
  messageForComposerSubmission,
  type ComposerSubmission,
} from "@/features/workspace/workspace-assistant-routing";
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

const documentFontFamilies = [
  "Calibri",
  "Georgia",
  "Arial",
  "Times New Roman",
] as const;

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
  "apply_formatting_batch",
  "set_paragraph_style",
  "set_paragraph_styles",
  "append_paragraphs",
]);

type AppendParagraphRun = {
  text: string;
  marks?: TextFormatting;
};

type AppendParagraph = {
  runs: AppendParagraphRun[];
  styleId?: string;
};

type DocumentToolResult =
  | { success: true; data: unknown; buffer?: ArrayBuffer; mutated?: boolean }
  | { success: false; error: string; buffer?: never; mutated?: boolean };

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
  const [railWidth, setRailWidth] = useState(defaultAssistantRailWidth);
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
  const { executeToolCall } = useDocxAgentTools({
    editorRef,
    author: "Heydesk",
    include: documentToolNames,
  });

  const executeDocumentTool = useCallback(
    async (
      tool: string,
      argumentsValue: Record<string, unknown>,
    ): Promise<DocumentToolResult> => {
      if (tool === "apply_formatting_batch") {
        return executeDocumentBatch(
          "apply_formatting",
          parseDocumentBatchOperations(argumentsValue),
          executeToolCall,
        );
      }
      if (tool === "set_paragraph_styles") {
        return executeDocumentBatch(
          "set_paragraph_style",
          parseDocumentBatchOperations(argumentsValue),
          executeToolCall,
        );
      }
      if (tool !== "append_paragraphs") {
        const result = executeToolCall(tool, argumentsValue);
        return result.success
          ? { success: true, data: result.data }
          : {
              success: false,
              error: result.error ?? "The document action failed.",
            };
      }
      const paragraphs = parseAppendParagraphs(argumentsValue);
      const editor = editorRef.current;
      let agent = editor?.getAgent();
      if (!editor || !agent) {
        return { success: false, error: "The document editor is not ready." };
      }
      const outline = agent.getAgentContext(8_001).outline;
      let paragraphIndex = agent.getParagraphCount() - 1;
      if (paragraphIndex < 0) {
        return {
          success: false,
          error: "This document has no paragraph that can receive content.",
        };
      }
      const sourceDocument = agent.getDocument();
      let paragraphText = outline.at(-1)?.preview ?? "";
      let paragraphsAdded = 0;
      for (const paragraph of paragraphs) {
        if (paragraphsAdded > 0 || paragraphText.length > 0) {
          agent = agent.insertParagraphBreak({
            paragraphIndex,
            offset: paragraphText.length,
          });
          paragraphIndex += 1;
          paragraphText = "";
        }
        for (const run of paragraph.runs) {
          if (run.text.length === 0) continue;
          agent = agent.insertText(
            { paragraphIndex, offset: paragraphText.length },
            run.text,
            {
              formatting: {
                bold: false,
                boldCs: false,
                italic: false,
                italicCs: false,
                underline: { style: "none" },
                strike: false,
                doubleStrike: false,
                vertAlign: "baseline",
                smallCaps: false,
                allCaps: false,
                hidden: false,
                highlight: "none",
                ...run.marks,
              },
            },
          );
          paragraphText += run.text;
        }
        if (paragraph.styleId) {
          agent = agent.applyStyle(paragraphIndex, paragraph.styleId);
        }
        paragraphsAdded += 1;
      }
      const nextDocument = agent.getDocument();
      // docx-editor 1.9.0 clones agent mutations through JSON, which turns
      // package Maps and the original binary into plain objects. Restore the
      // immutable package metadata before serialization so headers, footers,
      // media, and the original OOXML package remain valid.
      nextDocument.originalBuffer = sourceDocument.originalBuffer;
      nextDocument.package.headers = sourceDocument.package.headers;
      nextDocument.package.footers = sourceDocument.package.footers;
      nextDocument.package.relationships = sourceDocument.package.relationships;
      nextDocument.package.media = sourceDocument.package.media;
      nextDocument.package.properties = sourceDocument.package.properties;
      const buffer = await agent.toBuffer();
      return {
        success: true,
        data: {
          paragraphsAdded,
          message: `Appended ${paragraphsAdded} real document paragraphs.`,
        },
        buffer,
      };
    },
    [executeToolCall],
  );

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
          const result = await executeDocumentTool(call.tool, call.arguments);
          let revision: string | undefined;
          if (
            mutatingDocumentTools.has(call.tool) &&
            (result.success || result.mutated)
          ) {
            if (result.buffer) {
              const current = loadedRef.current;
              if (!current) throw new Error("The document editor is not ready.");
              const saved = await saveDocument(
                workspace.id,
                path,
                result.buffer,
                current.revision,
              );
              await loadDurableDocument({ ...saved, buffer: result.buffer });
            } else {
              dirtyRef.current = true;
              await performSave();
            }
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
  }, [
    executeDocumentTool,
    loadDurableDocument,
    path,
    performSave,
    session.state.documentToolCalls,
    workspace.id,
  ]);

  const sendDocumentMessage = async (
    message: string,
    preferences?: AssistantRunPreferences,
    submission?: ComposerSubmission,
  ) => {
    await flush();
    const current = loadedRef.current;
    if (!current) return;
    await session.sendMessage(messageForComposerSubmission(message, submission), {
      context: {
        kind: "document",
        path,
        expectedRevision: current.revision,
      },
      preferences,
    });
  };

  if (query.isError) {
    return <div className="m-auto text-sm text-destructive">{query.error.message}</div>;
  }
  if (query.isPending || !loaded) {
    return (
      <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" /> Opening document…
      </div>
    );
  }
  return (
    <div className="relative flex size-full min-w-0">
      <section className="relative min-w-0 flex-1 overflow-hidden bg-muted/35">
        <DocxEditor
          ref={editorRef}
          author="Heydesk user"
          className="size-full"
          colorMode="light"
          documentBuffer={loaded.buffer}
          fontFamilies={documentFontFamilies}
          initialZoom={0.9}
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
          renderLogo={() => (
            <MicrosoftWord
              aria-hidden="true"
              className="size-5"
            />
          )}
          renderTitleBarRight={() => (
            <div className="flex items-center gap-1">
              <SaveIndicator isDocumentRun={session.isRunning} status={status} />
              {!railOpen && (
                <Button
                  aria-label="Open document assistant"
                  onClick={() => setRailOpen(true)}
                  size="icon-sm"
                  title="Open document assistant"
                  variant="ghost"
                >
                  <PanelRightOpenIcon />
                </Button>
              )}
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
        composerContext="document"
        disabled={status === "conflict"}
        minimalHeader
        mobileOpen={mobileRailOpen}
        onMobileOpenChange={setMobileRailOpen}
        onOpenChange={setRailOpen}
        onOpenPage={onOpenPage}
        onSend={sendDocumentMessage}
        onWidthChange={setRailWidth}
        open={railOpen}
        persistent
        width={railWidth}
        workspace={workspace}
      />
    </div>
  );
}

function parseDocumentBatchOperations(
  value: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!Array.isArray(value.operations)) {
    throw new Error("Document batch operations are missing.");
  }
  return value.operations.map((operation) => {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      throw new Error("A document batch operation is invalid.");
    }
    return operation as Record<string, unknown>;
  });
}

function executeDocumentBatch(
  tool: "apply_formatting" | "set_paragraph_style",
  operations: Record<string, unknown>[],
  executeToolCall: (
    tool: string,
    argumentsValue: Record<string, unknown>,
  ) => { success: boolean; data?: unknown; error?: string },
): DocumentToolResult {
  let completed = 0;
  for (const operation of operations) {
    const result = executeToolCall(tool, operation);
    if (!result.success) {
      return {
        success: false,
        error:
          result.error ??
          `Document batch stopped after ${completed} successful operations.`,
        mutated: completed > 0,
      };
    }
    completed += 1;
  }
  return {
    success: true,
    data: {
      operationsApplied: completed,
      message: `Applied ${completed} document operations in one save.`,
    },
    mutated: completed > 0,
  };
}

function parseAppendParagraphs(
  argumentsValue: Record<string, unknown>,
): AppendParagraph[] {
  if (!Array.isArray(argumentsValue.paragraphs)) {
    throw new Error("append_paragraphs needs a paragraphs array.");
  }
  return argumentsValue.paragraphs.map((paragraph, paragraphIndex) => {
    if (!isRecord(paragraph) || !Array.isArray(paragraph.runs)) {
      throw new Error(`Paragraph ${paragraphIndex + 1} needs a runs array.`);
    }
    const runs = paragraph.runs.map((run, runIndex) => {
      if (!isRecord(run) || typeof run.text !== "string") {
        throw new Error(
          `Run ${runIndex + 1} in paragraph ${paragraphIndex + 1} needs text.`,
        );
      }
      if (run.marks !== undefined && !isRecord(run.marks)) {
        throw new Error(
          `Run ${runIndex + 1} in paragraph ${paragraphIndex + 1} has invalid formatting.`,
        );
      }
      return {
        text: run.text,
        ...(run.marks ? { marks: run.marks as TextFormatting } : {}),
      };
    });
    return {
      runs,
      ...(typeof paragraph.styleId === "string"
        ? { styleId: paragraph.styleId }
        : {}),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function SaveIndicator({
  isDocumentRun,
  status,
}: {
  isDocumentRun: boolean;
  status: SaveStatus;
}) {
  const saving = isDocumentRun || status === "saving";
  const label = documentSaveLabel(status, isDocumentRun);

  return (
    <span
      aria-live="polite"
      className="ml-1 inline-flex min-w-16 items-center justify-end gap-1.5 text-xs text-muted-foreground"
      title={label}
    >
      {saving ? (
        <LoaderCircleIcon className="size-3.5 animate-spin text-primary" />
      ) : status === "saved" ? (
        <CheckIcon className="size-3.5 animate-in zoom-in-75 text-primary duration-200" />
      ) : status === "conflict" || status === "error" ? (
        <AlertCircle className="size-3.5 text-destructive" />
      ) : (
        <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

function documentSaveLabel(
  status: SaveStatus,
  isDocumentRun: boolean,
): string {
  if (isDocumentRun) return "Codex is editing this document";
  if (status === "saving") return "Saving…";
  if (status === "unsaved") return "Unsaved";
  if (status === "conflict") return "Conflict";
  if (status === "error") return "Save failed";
  return "Saved";
}
