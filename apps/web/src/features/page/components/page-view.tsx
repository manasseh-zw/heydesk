import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  BoldIcon,
  CheckIcon,
  Code2Icon,
  Heading1Icon,
  Heading2Icon,
  HighlighterIcon,
  ItalicIcon,
  ListCollapseIcon,
  ListIcon,
  ListMinusIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  PanelRightOpenIcon,
  QuoteIcon,
  Redo2Icon,
  RotateCcwIcon,
  SendHorizontalIcon,
  SparklesIcon,
  SpellCheck2Icon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@heydesk/ui/components/button";
import { Input } from "@heydesk/ui/components/input";
import { Textarea } from "@heydesk/ui/components/textarea";

import { CodexIcon, MicrosoftWord } from "@/components/icons";
import { AssistantRail } from "@/features/assistant/components/assistant-rail";
import { useAssistantSession } from "@/features/assistant/assistant-session";
import type { AssistantRunPreferences } from "@/features/assistant/assistant.types";
import { documentKeys } from "@/features/document/document.queries";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import {
  messageForComposerSubmission,
  type ComposerSubmission,
} from "@/features/workspace/workspace-assistant-routing";
import { pageKeys, pageQueryOptions } from "../page.queries";
import {
  convertPageToDocument,
  getPageIfChanged,
  quickEditPage,
  savePage,
} from "../page.service";
import {
  clearPageQuickEditSuggestion,
  PageQuickEditSuggestion,
  showPageQuickEditSuggestion,
} from "../page-quick-edit-suggestion";
import { resolvePageEditorMode } from "../page-editor-mode";
import { getPageMarkdownExtensions } from "../page-markdown";
import {
  PageRevisionConflictError,
  type Page,
  type QuickEditCommand,
} from "../page.types";

type SaveState = "saved" | "unsaved" | "saving" | "conflict";

type QuickEditPreview = {
  command: QuickEditCommand;
  instruction?: string;
  originalContent: string;
  replacementMarkdown: string;
  selection: { from: number; to: number };
};

type PageViewProps = {
  path: string;
  workspace: WorkspaceSummary;
  onOpenDocument: (path: string) => void;
  onOpenPage: (path: string) => void;
  onRegisterFlush?: (flush: (() => Promise<void>) | null) => void;
};

export function PageView({
  path,
  workspace,
  onOpenDocument,
  onOpenPage,
  onRegisterFlush,
}: PageViewProps) {
  const query = useQuery(pageQueryOptions(workspace.id, path));

  if (query.isPending) {
    return (
      <div className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" />
        Opening page
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="m-auto max-w-sm text-center">
        <AlertCircleIcon className="mx-auto size-5 text-destructive" />
        <p className="mt-3 text-sm">{query.error.message}</p>
        <Button
          className="mt-4"
          onClick={() => void query.refetch()}
          size="sm"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <LoadedPageView
      page={query.data}
      key={path}
      onOpenDocument={onOpenDocument}
      onOpenPage={onOpenPage}
      onRegisterFlush={onRegisterFlush}
      workspace={workspace}
    />
  );
}

function LoadedPageView({
  page,
  workspace,
  onOpenDocument,
  onOpenPage,
  onRegisterFlush,
}: {
  page: Page;
  workspace: WorkspaceSummary;
  onOpenDocument: (path: string) => void;
  onOpenPage: (path: string) => void;
  onRegisterFlush?: (flush: (() => Promise<void>) | null) => void;
}) {
  const queryClient = useQueryClient();
  const session = useAssistantSession();
  const [content, setContent] = useState(page.content);
  const [revision, setRevision] = useState(page.revision);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<Page | null>(null);
  const [diskError, setDiskError] = useState<string>();
  const [railOpen, setRailOpen] = useState(true);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [railWidth, setRailWidth] = useState(420);
  const [quickEditLoading, setQuickEditLoading] = useState(false);
  const [quickEditError, setQuickEditError] = useState<string>();
  const [conversionError, setConversionError] = useState<string>();
  const [convertingToWord, setConvertingToWord] = useState(false);
  const [quickEditPreview, setQuickEditPreview] =
    useState<QuickEditPreview | null>(null);
  const [sourceSelection, setSourceSelection] = useState({ from: 0, to: 0 });
  const contentRef = useRef(content);
  const revisionRef = useRef(revision);
  const saveStateRef = useRef(saveState);
  const suppressEditorUpdateRef = useRef(false);
  const editorBaselineRef = useRef<string | null>(null);
  const previousRunIdRef = useRef<string | undefined>(undefined);
  const abortQuickEditRef = useRef<AbortController | undefined>(undefined);
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null);
  const [editorMode, setEditorMode] = useState(() =>
    resolvePageEditorMode(page),
  );

  const setCurrentContent = useCallback((next: string, state: SaveState) => {
    contentRef.current = next;
    saveStateRef.current = state;
    setContent(next);
    setSaveState(state);
  }, []);

  const editor = useEditor({
    extensions: [...getPageMarkdownExtensions(), PageQuickEditSuggestion],
    content: editorMode === "rich" ? page.content : "",
    contentType: "markdown",
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[calc(100svh-10rem)] outline-none " +
          "[&_h1]:mb-7 [&_h1]:mt-2 [&_h1]:font-brand [&_h1]:text-4xl [&_h1]:font-normal [&_h1]:leading-tight [&_h1]:tracking-tight " +
          "[&_h2]:mb-4 [&_h2]:mt-10 [&_h2]:font-brand [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:leading-tight " +
          "[&_h3]:mb-3 [&_h3]:mt-7 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:my-3 [&_p]:leading-7 " +
          "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-7 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-7 " +
          "[&_li_p]:my-0 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-muted-foreground " +
          "[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "aria-label": "Page content",
        role: "textbox",
      },
    },
    immediatelyRender: false,
    onCreate({ editor: createdEditor }) {
      editorBaselineRef.current = createdEditor.getMarkdown();
    },
    onUpdate({ editor: nextEditor }) {
      if (suppressEditorUpdateRef.current) return;
      const next = nextEditor.getMarkdown();
      if (editorBaselineRef.current === null) {
        editorBaselineRef.current = next;
        return;
      }
      if (next === editorBaselineRef.current) return;
      editorBaselineRef.current = next;
      setCurrentContent(next, "unsaved");
    },
  });

  const isPageRun =
    session.state.activeRun?.context?.kind === "page" &&
    session.state.activeRun.context.path === page.path;
  const editorLocked = isPageRun || quickEditLoading || !!quickEditPreview;

  useEffect(() => {
    editor?.setEditable(!editorLocked);
  }, [editor, editorLocked]);

  const loadPage = useCallback(
    (next: Page, syncEditor = true) => {
      suppressEditorUpdateRef.current = true;
      const nextEditorMode = syncEditor
        ? resolvePageEditorMode(next)
        : editorMode;
      if (syncEditor) setEditorMode(nextEditorMode);
      if (syncEditor && editor && nextEditorMode === "rich") {
        clearPageQuickEditSuggestion(editor);
        editor.commands.setContent(next.content, {
          contentType: "markdown",
          emitUpdate: false,
        });
        editorBaselineRef.current = editor.getMarkdown();
      }
      suppressEditorUpdateRef.current = false;
      revisionRef.current = next.revision;
      setRevision(next.revision);
      setConflict(null);
      setCurrentContent(next.content, "saved");
      queryClient.setQueryData(pageKeys.detail(workspace.id, page.path), next);
    },
    [
      page.path,
      editor,
      editorMode,
      queryClient,
      setCurrentContent,
      workspace.id,
    ],
  );

  const saveNow = useCallback(
    async (
      origin: "user" | "quick-edit" = "user",
      expectedRevision = revisionRef.current,
    ): Promise<Page> => {
      if (saveStateRef.current === "saved" && origin === "user") {
        return (
          queryClient.getQueryData<Page>(
            pageKeys.detail(workspace.id, page.path),
          ) ?? page
        );
      }
      saveStateRef.current = "saving";
      setSaveState("saving");
      try {
        const updated = await savePage(
          workspace.id,
          page.path,
          contentRef.current,
          expectedRevision,
          origin,
        );
        loadPage(updated, false);
        await queryClient.invalidateQueries({
          queryKey: pageKeys.all(workspace.id),
        });
        return updated;
      } catch (error) {
        if (error instanceof PageRevisionConflictError) {
          setConflict(error.current);
          saveStateRef.current = "conflict";
          setSaveState("conflict");
        } else {
          saveStateRef.current = "unsaved";
          setSaveState("unsaved");
        }
        throw error;
      }
    },
    [loadPage, page, queryClient, workspace.id],
  );

  useEffect(() => {
    if (saveState !== "unsaved" || quickEditPreview || isPageRun) return;
    const timer = window.setTimeout(() => void saveNow().catch(() => {}), 750);
    return () => window.clearTimeout(timer);
  }, [isPageRun, quickEditPreview, saveNow, saveState]);

  const reconcileDisk = useCallback(async () => {
    try {
      const next = await getPageIfChanged(
        workspace.id,
        page.path,
        revisionRef.current,
      );
      setDiskError(undefined);
      if (!next) return;
      if (saveStateRef.current === "saved" || isPageRun) {
        loadPage(next);
      } else {
        setConflict(next);
        saveStateRef.current = "conflict";
        setSaveState("conflict");
      }
    } catch (error) {
      setDiskError(
        error instanceof Error ? error.message : "This page is unavailable.",
      );
    }
  }, [isPageRun, loadPage, page.path, workspace.id]);

  useEffect(() => {
    const interval = window.setInterval(() => void reconcileDisk(), 5_000);
    return () => window.clearInterval(interval);
  }, [reconcileDisk]);

  useEffect(() => {
    if (!isPageRun || session.state.fileDiffs.length === 0) return;
    void reconcileDisk();
  }, [isPageRun, reconcileDisk, session.state.fileDiffs]);

  useEffect(() => {
    const matchingCommit = session.state.artifacts.some(
      (item) => item.path === page.path,
    );
    if (matchingCommit) void reconcileDisk();
  }, [page.path, reconcileDisk, session.state.artifacts]);

  useEffect(() => {
    const activeRunId = isPageRun ? session.state.activeRun?.id : undefined;
    if (previousRunIdRef.current && !activeRunId) void reconcileDisk();
    previousRunIdRef.current = activeRunId;
  }, [isPageRun, reconcileDisk, session.state.activeRun?.id]);

  useEffect(
    () => () => {
      abortQuickEditRef.current?.abort();
      if (saveStateRef.current === "unsaved") void saveNow().catch(() => {});
    },
    [saveNow],
  );

  useEffect(() => {
    if (!onRegisterFlush) return;
    onRegisterFlush(async () => {
      if (saveStateRef.current === "unsaved") await saveNow();
    });
    return () => onRegisterFlush(null);
  }, [onRegisterFlush, saveNow]);

  const selection = () => {
    if (editorMode === "source") return sourceSelection;
    if (!editor) return { from: 0, to: 0 };
    return { from: editor.state.selection.from, to: editor.state.selection.to };
  };

  const runQuickEdit = async (
    command: QuickEditCommand,
    instruction?: string,
    captured?: QuickEditPreview,
  ) => {
    if (session.isRunning) return;
    await saveNow().catch(() => undefined);
    const range = captured?.selection ?? selection();
    const originalContent = captured?.originalContent ?? contentRef.current;
    const selected =
      editorMode === "rich" && editor
        ? editor.state.doc.textBetween(range.from, range.to, "\n")
        : originalContent.slice(range.from, range.to);
    if (!selected.trim()) return;
    const controller = new AbortController();
    abortQuickEditRef.current = controller;
    setQuickEditError(undefined);
    setQuickEditLoading(true);
    try {
      const result = await quickEditPage(
        workspace.id,
        {
          path: page.path,
          expectedRevision: revisionRef.current,
          selectionMarkdown: selected,
          command,
          instruction,
        },
        controller.signal,
      );
      let next: string;
      if (editor && editorMode === "rich") {
        const previousDocument = editor.state.doc;
        suppressEditorUpdateRef.current = true;
        editor.commands.insertContentAt(range, result.replacementMarkdown, {
          contentType: "markdown",
          updateSelection: true,
        });
        const changedFrom = previousDocument.content.findDiffStart(
          editor.state.doc.content,
        );
        const changedTo = previousDocument.content.findDiffEnd(
          editor.state.doc.content,
        );
        if (changedFrom !== null && changedTo) {
          const suggestionRange = {
            from: changedFrom,
            to: changedTo.b,
          };
          showPageQuickEditSuggestion(editor, suggestionRange);
          editor.commands.setTextSelection(suggestionRange);
        }
        next = editor.getMarkdown();
        editorBaselineRef.current = next;
        suppressEditorUpdateRef.current = false;
      } else {
        next =
          originalContent.slice(0, range.from) +
          result.replacementMarkdown +
          originalContent.slice(range.to);
        const replacementRange = {
          from: range.from,
          to: range.from + result.replacementMarkdown.length,
        };
        setSourceSelection(replacementRange);
        window.requestAnimationFrame(() => {
          sourceEditorRef.current?.focus();
          sourceEditorRef.current?.setSelectionRange(
            replacementRange.from,
            replacementRange.to,
          );
        });
      }
      setCurrentContent(next, "unsaved");
      setQuickEditPreview({
        command,
        instruction,
        originalContent,
        replacementMarkdown: result.replacementMarkdown,
        selection: range,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setQuickEditError(
          error instanceof Error
            ? error.message
            : "Heydesk could not rewrite this selection.",
        );
      }
    } finally {
      setQuickEditLoading(false);
      abortQuickEditRef.current = undefined;
    }
  };

  const discardQuickEdit = () => {
    if (!quickEditPreview) return;
    setCurrentContent(quickEditPreview.originalContent, "saved");
    if (editor && editorMode === "rich") {
      suppressEditorUpdateRef.current = true;
      clearPageQuickEditSuggestion(editor);
      editor.commands.setContent(quickEditPreview.originalContent, {
        contentType: "markdown",
        emitUpdate: false,
      });
      editorBaselineRef.current = editor.getMarkdown();
      suppressEditorUpdateRef.current = false;
    } else {
      setSourceSelection(quickEditPreview.selection);
    }
    setQuickEditError(undefined);
    setQuickEditPreview(null);
  };

  const applyQuickEdit = async () => {
    setQuickEditError(undefined);
    try {
      await saveNow("quick-edit");
      if (editor) clearPageQuickEditSuggestion(editor);
      sourceEditorRef.current?.blur();
      setQuickEditPreview(null);
    } catch (error) {
      setQuickEditError(
        error instanceof Error
          ? error.message
          : "Heydesk could not save this suggestion.",
      );
    }
  };

  const retryQuickEdit = () => {
    if (!quickEditPreview) return;
    const preview = quickEditPreview;
    discardQuickEdit();
    void runQuickEdit(preview.command, preview.instruction, preview);
  };

  const sendPageMessage = async (
    message: string,
    preferences?: AssistantRunPreferences,
    submission?: ComposerSubmission,
  ) => {
    const saved = await saveNow();
    await session.sendMessage(messageForComposerSubmission(message, submission), {
      context: {
        kind: "page",
        path: page.path,
        expectedRevision: saved.revision,
      },
      preferences,
    });
  };

  const openAsWord = async () => {
    setConversionError(undefined);
    setConvertingToWord(true);
    try {
      const saved = await saveNow();
      const document = await convertPageToDocument(workspace.id, {
        path: page.path,
        expectedRevision: saved.revision,
      });
      await queryClient.invalidateQueries({
        queryKey: documentKeys.all(workspace.id),
      });
      onOpenDocument(document.path);
    } catch (error) {
      setConversionError(
        error instanceof Error
          ? error.message
          : "Heydesk could not open this page as a Word document.",
      );
    } finally {
      setConvertingToWord(false);
    }
  };

  const changeSource = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentContent(event.target.value, "unsaved");
    setSourceSelection({
      from: event.target.selectionStart,
      to: event.target.selectionEnd,
    });
  };
  const selectSource = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    setSourceSelection({
      from: event.currentTarget.selectionStart,
      to: event.currentTarget.selectionEnd,
    });
  };

  return (
    <div className="relative flex size-full min-w-0">
      <section
        className={`relative min-w-0 flex-1 overflow-y-auto bg-background ${isPageRun ? "ring-1 ring-inset ring-primary/20" : ""}`}
        data-edit-origin={
          isPageRun ? `codex:${session.state.activeRun?.id}` : "user"
        }
      >
        {editorMode === "rich" && editor ? (
          <EditorToolbar
            convertingToWord={convertingToWord}
            disabled={editorLocked}
            editor={editor}
            isPageRun={isPageRun}
            onOpenAsWord={() => void openAsWord()}
            onOpenMobileAssistant={() => setMobileRailOpen(true)}
            saveState={saveState}
          />
        ) : (
          <SourceToolbar
            isPageRun={isPageRun}
            onOpenMobileAssistant={() => setMobileRailOpen(true)}
            saveState={saveState}
          />
        )}

        {conversionError && (
          <div
            aria-live="polite"
            className="mx-auto mt-4 flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
          >
            <span>{conversionError}</span>
            <Button
              onClick={() => setConversionError(undefined)}
              size="sm"
              variant="ghost"
            >
              Dismiss
            </Button>
          </div>
        )}

        {conflict && (
          <div className="mx-auto mt-6 flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
            <span>This page changed on disk while you were editing.</span>
            <div className="flex shrink-0 gap-2">
              <Button
                onClick={() => loadPage(conflict)}
                size="sm"
                variant="outline"
              >
                Reload disk version
              </Button>
              <Button
                onClick={() => {
                  revisionRef.current = conflict.revision;
                  setRevision(conflict.revision);
                  setConflict(null);
                  saveStateRef.current = "unsaved";
                  setSaveState("unsaved");
                  void saveNow("user", conflict.revision);
                }}
                size="sm"
              >
                Overwrite with my draft
              </Button>
            </div>
          </div>
        )}
        {diskError && (
          <div className="mx-auto mt-6 flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <span>{diskError}</span>
            <Button
              onClick={() => void reconcileDisk()}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl px-8 py-10">
          {editorMode === "rich" && editor ? (
            <>
              <BubbleMenu
                editor={editor}
                shouldShow={({ editor: currentEditor }) =>
                  quickEditLoading ||
                  !!quickEditPreview ||
                  (!currentEditor.state.selection.empty && !editorLocked)
                }
              >
                <QuickEditMenu
                  error={quickEditError}
                  editor={editor}
                  loading={quickEditLoading}
                  onApply={() => void applyQuickEdit()}
                  onCancel={() => abortQuickEditRef.current?.abort()}
                  onDiscard={discardQuickEdit}
                  onOpenAi={() => setQuickEditError(undefined)}
                  onSelect={(command, instruction) =>
                    void runQuickEdit(command, instruction)
                  }
                  onTryAgain={retryQuickEdit}
                  preview={!!quickEditPreview}
                />
              </BubbleMenu>
              <EditorContent editor={editor} />
            </>
          ) : (
            <>
              {sourceSelection.from !== sourceSelection.to && (
                <div className="mb-3 flex justify-end">
                  <QuickEditMenu
                    disabled={session.isRunning}
                    error={quickEditError}
                    loading={quickEditLoading}
                    onApply={() => void applyQuickEdit()}
                    onCancel={() => abortQuickEditRef.current?.abort()}
                    onDiscard={discardQuickEdit}
                    onOpenAi={() => setQuickEditError(undefined)}
                    onSelect={(command, instruction) =>
                      void runQuickEdit(command, instruction)
                    }
                    onTryAgain={retryQuickEdit}
                    preview={!!quickEditPreview}
                  />
                </div>
              )}
              <Textarea
                className="min-h-[calc(100svh-11rem)] resize-none rounded-none border-0 bg-transparent font-mono text-sm leading-7 shadow-none selection:bg-primary/25 focus-visible:ring-0"
                disabled={isPageRun || quickEditLoading}
                onChange={changeSource}
                onSelect={selectSource}
                readOnly={!!quickEditPreview}
                ref={sourceEditorRef}
                spellCheck={false}
                value={content}
              />
            </>
          )}
        </div>
      </section>

      {!railOpen && (
        <Button
          aria-label="Open page assistant"
          className="absolute right-0 top-1 z-30 hidden h-10 w-8 rounded-l-lg rounded-r-none border-r-0 bg-background shadow-sm lg:inline-flex"
          onClick={() => setRailOpen(true)}
          size="icon"
          title="Open page assistant"
          variant="outline"
        >
          <PanelRightOpenIcon />
        </Button>
      )}

      <AssistantRail
        disabled={!!quickEditPreview || quickEditLoading}
        minimalHeader
        mobileOpen={mobileRailOpen}
        onMobileOpenChange={setMobileRailOpen}
        onOpenChange={setRailOpen}
        onOpenPage={onOpenPage}
        onSend={sendPageMessage}
        onWidthChange={setRailWidth}
        open={railOpen}
        width={railWidth}
        workspace={workspace}
      />
    </div>
  );
}

function QuickEditMenu({
  disabled = false,
  error,
  editor,
  loading,
  onApply,
  onCancel,
  onDiscard,
  onOpenAi,
  onSelect,
  onTryAgain,
  preview,
}: {
  disabled?: boolean;
  error?: string;
  editor?: Editor;
  loading: boolean;
  onApply: () => void;
  onCancel: () => void;
  onDiscard: () => void;
  onOpenAi: () => void;
  onSelect: (command: QuickEditCommand, instruction?: string) => void;
  onTryAgain: () => void;
  preview: boolean;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [instruction, setInstruction] = useState("");

  if (loading) {
    return (
      <div className="flex w-72 items-center gap-3 rounded-xl border bg-background px-3 py-2.5 shadow-lg">
        <LoaderCircleIcon className="size-4 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Thinking…</p>
          <p className="truncate text-xs text-muted-foreground">
            Rewriting the selected text
          </p>
        </div>
        <Button
          aria-label="Cancel quick edit"
          onClick={onCancel}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="w-64 overflow-hidden rounded-xl border bg-background p-1 shadow-lg">
        <div className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-muted-foreground">
          <SparklesIcon className="size-3.5 text-primary" />
          Suggested edit
        </div>
        {error && (
          <p className="mx-1 mb-1 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
        <QuickEditAction
          icon={CheckIcon}
          label="Accept"
          onClick={() => {
            setAiOpen(false);
            onApply();
          }}
        />
        <QuickEditAction
          icon={XIcon}
          label="Discard"
          onClick={() => {
            setAiOpen(false);
            onDiscard();
          }}
        />
        <QuickEditAction
          icon={RotateCcwIcon}
          label="Try again"
          onClick={onTryAgain}
        />
      </div>
    );
  }

  if (aiOpen) {
    const submitInstruction = () => {
      const nextInstruction = instruction.trim();
      if (!nextInstruction) return;
      onSelect("custom", nextInstruction);
    };

    return (
      <div className="w-80 overflow-hidden rounded-xl border bg-background shadow-lg">
        <div className="flex h-11 items-center gap-2 border-b px-2">
          <CodexIcon className="ml-1 size-4 shrink-0" />
          <Input
            autoFocus
            className="h-9 flex-1 rounded-none border-0 bg-transparent px-1 shadow-none focus-visible:border-transparent focus-visible:ring-0"
            disabled={disabled}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitInstruction();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setAiOpen(false);
              }
            }}
            placeholder="Ask Codex anything…"
            value={instruction}
          />
          <Button
            aria-label="Rewrite with this instruction"
            disabled={disabled || !instruction.trim()}
            onClick={submitInstruction}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <SendHorizontalIcon />
          </Button>
        </div>
        {error && (
          <p className="border-b px-3 py-2 text-xs text-destructive">{error}</p>
        )}
        <div className="p-1">
          <QuickEditAction
            disabled={disabled}
            icon={WandSparklesIcon}
            label="Improve writing"
            onClick={() => onSelect("improve")}
          />
          <QuickEditAction
            disabled={disabled}
            icon={ListMinusIcon}
            label="Make shorter"
            onClick={() => onSelect("shorten")}
          />
          <QuickEditAction
            disabled={disabled}
            icon={ListCollapseIcon}
            label="Summarize"
            onClick={() => onSelect("summarize")}
          />
          <QuickEditAction
            disabled={disabled}
            icon={SpellCheck2Icon}
            label="Fix spelling & grammar"
            onClick={() => onSelect("fix-grammar")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-xl border bg-background p-1 shadow-md">
      <Button
        disabled={disabled}
        onClick={() => {
          onOpenAi();
          setAiOpen(true);
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <CodexIcon className="size-4" />
        Ask Codex
      </Button>
      {editor && (
        <>
          <span className="mx-1 h-5 w-px bg-border" />
          <RichSelectionToolbar editor={editor} />
        </>
      )}
    </div>
  );
}

function RichSelectionToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
    }),
  });
  const actions = [
    {
      active: state.bold,
      icon: BoldIcon,
      label: "Bold",
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      active: state.italic,
      icon: ItalicIcon,
      label: "Italic",
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      active: state.underline,
      icon: UnderlineIcon,
      label: "Underline",
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      active: state.strike,
      icon: StrikethroughIcon,
      label: "Strikethrough",
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      active: state.code,
      icon: Code2Icon,
      label: "Inline code",
      run: () => editor.chain().focus().toggleCode().run(),
    },
  ];

  return actions.map(({ active, icon: Icon, label, run }) => (
    <Button
      aria-label={label}
      className={active ? "bg-accent text-accent-foreground" : undefined}
      key={label}
      onClick={run}
      onMouseDown={(event) => event.preventDefault()}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      <Icon />
    </Button>
  ));
}

function QuickEditAction({
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: typeof CheckIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className="w-full justify-start font-normal"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Icon className="text-muted-foreground" />
      {label}
    </Button>
  );
}

function EditorToolbar({
  convertingToWord,
  disabled,
  editor,
  isPageRun,
  onOpenAsWord,
  onOpenMobileAssistant,
  saveState,
}: {
  convertingToWord: boolean;
  disabled: boolean;
  editor: Editor;
  isPageRun: boolean;
  onOpenAsWord: () => void;
  onOpenMobileAssistant: () => void;
  saveState: SaveState;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      paragraph: current.isActive("paragraph"),
      heading1: current.isActive("heading", { level: 1 }),
      heading2: current.isActive("heading", { level: 2 }),
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      highlight: current.isActive("highlight"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
      canUndo: current.can().chain().focus().undo().run(),
      canRedo: current.can().chain().focus().redo().run(),
    }),
  });
  const activeClass = (active: boolean) =>
    active ? "bg-accent text-accent-foreground" : "text-muted-foreground";

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-2 backdrop-blur">
      <div className="w-full overflow-x-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-nowrap items-center gap-1 px-6">
          <Button
            aria-label="Paragraph"
            className={activeClass(state.paragraph)}
            disabled={disabled}
            onClick={() => editor.chain().focus().setParagraph().run()}
            size="icon-sm"
            title="Paragraph"
            type="button"
            variant="ghost"
          >
            <span className="text-sm font-medium">P</span>
          </Button>
          <Button
            aria-label="Heading 1"
            className={activeClass(state.heading1)}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            size="icon-sm"
            title="Heading 1"
            type="button"
            variant="ghost"
          >
            <Heading1Icon />
          </Button>
          <Button
            aria-label="Heading 2"
            className={activeClass(state.heading2)}
            disabled={disabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            size="icon-sm"
            title="Heading 2"
            type="button"
            variant="ghost"
          >
            <Heading2Icon />
          </Button>
          <ToolbarSeparator />
          <Button
            aria-label="Bold"
            className={activeClass(state.bold)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
            size="icon-sm"
            title="Bold"
            type="button"
            variant="ghost"
          >
            <BoldIcon />
          </Button>
          <Button
            aria-label="Italic"
            className={activeClass(state.italic)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            size="icon-sm"
            title="Italic"
            type="button"
            variant="ghost"
          >
            <ItalicIcon />
          </Button>
          <Button
            aria-label="Underline"
            className={activeClass(state.underline)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            size="icon-sm"
            title="Underline"
            type="button"
            variant="ghost"
          >
            <UnderlineIcon />
          </Button>
          <Button
            aria-label="Strikethrough"
            className={activeClass(state.strike)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            size="icon-sm"
            title="Strikethrough"
            type="button"
            variant="ghost"
          >
            <StrikethroughIcon />
          </Button>
          <Button
            aria-label="Highlight"
            className={activeClass(state.highlight)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            size="icon-sm"
            title="Highlight"
            type="button"
            variant="ghost"
          >
            <HighlighterIcon />
          </Button>
          <ToolbarSeparator />
          <Button
            aria-label="Bullet list"
            className={activeClass(state.bulletList)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            size="icon-sm"
            title="Bullet list"
            type="button"
            variant="ghost"
          >
            <ListIcon />
          </Button>
          <Button
            aria-label="Numbered list"
            className={activeClass(state.orderedList)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            size="icon-sm"
            title="Numbered list"
            type="button"
            variant="ghost"
          >
            <ListOrderedIcon />
          </Button>
          <Button
            aria-label="Blockquote"
            className={activeClass(state.blockquote)}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            size="icon-sm"
            title="Blockquote"
            type="button"
            variant="ghost"
          >
            <QuoteIcon />
          </Button>
          <div className="w-6 shrink-0" />
          <Button
            aria-label="Undo"
            className="text-muted-foreground"
            disabled={disabled || !state.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
            size="icon-sm"
            title="Undo"
            type="button"
            variant="ghost"
          >
            <Undo2Icon />
          </Button>
          <Button
            aria-label="Redo"
            className="text-muted-foreground"
            disabled={disabled || !state.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
            size="icon-sm"
            title="Redo"
            type="button"
            variant="ghost"
          >
            <Redo2Icon />
          </Button>
          <SaveStatus isPageRun={isPageRun} state={saveState} />
          <Button
            aria-label="Open this page as a Word document"
            className="ml-2 gap-1 rounded-lg px-2 text-xs"
            disabled={disabled || convertingToWord}
            onClick={onOpenAsWord}
            size="sm"
            type="button"
            variant="outline"
          >
            {convertingToWord ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <MicrosoftWord className="size-4" />
            )}
            {convertingToWord ? "Converting…" : "DOCX"}
          </Button>
          <MobileAssistantOpenControl onOpen={onOpenMobileAssistant} />
        </div>
      </div>
    </div>
  );
}

function SourceToolbar({
  isPageRun,
  onOpenMobileAssistant,
  saveState,
}: {
  isPageRun: boolean;
  onOpenMobileAssistant: () => void;
  saveState: SaveState;
}) {
  return (
    <div className="sticky top-0 z-10 flex min-h-12 items-center border-b bg-background/95 px-5 backdrop-blur">
      <span className="rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground">
        Source
      </span>
      <div className="flex-1" />
      <SaveStatus isPageRun={isPageRun} state={saveState} />
      <MobileAssistantOpenControl onOpen={onOpenMobileAssistant} />
    </div>
  );
}

function MobileAssistantOpenControl({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      aria-label="Open page assistant"
      className="lg:hidden"
      onClick={onOpen}
      size="icon-sm"
      variant="ghost"
    >
      <PanelRightOpenIcon />
    </Button>
  );
}

function SaveStatus({
  isPageRun,
  state,
}: {
  isPageRun: boolean;
  state: SaveState;
}) {
  const saving = isPageRun || state === "saving";
  const label = saveLabel(state, isPageRun);

  return (
    <span
      aria-live="polite"
      className="ml-1 inline-flex min-w-16 items-center justify-end gap-1.5 text-xs text-muted-foreground"
      title={label}
    >
      {saving ? (
        <LoaderCircleIcon className="size-3.5 animate-spin text-primary" />
      ) : state === "saved" ? (
        <CheckIcon className="size-3.5 animate-in zoom-in-75 text-primary duration-200" />
      ) : state === "conflict" ? (
        <AlertCircleIcon className="size-3.5 text-destructive" />
      ) : (
        <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

function ToolbarSeparator() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function saveLabel(state: SaveState, isPageRun: boolean): string {
  if (isPageRun) return "Codex is editing this page";
  if (state === "saving") return "Saving…";
  if (state === "unsaved") return "Unsaved";
  if (state === "conflict") return "Conflict";
  return "Saved";
}
