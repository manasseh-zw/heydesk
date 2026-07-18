import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";
import { Markdown } from "@tiptap/markdown";
import type { Editor } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  BoldIcon,
  CheckIcon,
  ChevronRightIcon,
  Code2Icon,
  Heading1Icon,
  Heading2Icon,
  HighlighterIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  PanelRightOpenIcon,
  QuoteIcon,
  Redo2Icon,
  RotateCcwIcon,
  SparklesIcon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@heydesk/ui/components/button";
import { Textarea } from "@heydesk/ui/components/textarea";

import { AssistantRail } from "@/features/assistant/components/assistant-rail";
import { useAssistantSession } from "@/features/assistant/assistant-session";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import { pageKeys, pageQueryOptions } from "../page.queries";
import {
  getPageIfChanged,
  quickEditPage,
  savePage,
} from "../page.service";
import {
  clearPageQuickEditSuggestion,
  PageQuickEditSuggestion,
  showPageQuickEditSuggestion,
} from "../page-quick-edit-suggestion";
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
  onOpenPage: (path: string) => void;
  onRegisterFlush?: (flush: (() => Promise<void>) | null) => void;
};

export function PageView({
  path,
  workspace,
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
      onOpenPage={onOpenPage}
      onRegisterFlush={onRegisterFlush}
      workspace={workspace}
    />
  );
}

function LoadedPageView({
  page,
  workspace,
  onOpenPage,
  onRegisterFlush,
}: {
  page: Page;
  workspace: WorkspaceSummary;
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
  const [railWidth, setRailWidth] = useState(380);
  const [quickEditLoading, setQuickEditLoading] = useState(false);
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

  const setCurrentContent = useCallback((next: string, state: SaveState) => {
    contentRef.current = next;
    saveStateRef.current = state;
    setContent(next);
    setSaveState(state);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Highlight,
      PageQuickEditSuggestion,
    ],
    content: page.content,
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
      if (syncEditor && editor && next.editorMode === "rich") {
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
      queryClient.setQueryData(
        pageKeys.detail(workspace.id, page.path),
        next,
      );
    },
    [page.path, editor, queryClient, setCurrentContent, workspace.id],
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
    if (page.editorMode === "source") return sourceSelection;
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
      page.editorMode === "rich" && editor
        ? editor.state.doc.textBetween(range.from, range.to, "\n")
        : originalContent.slice(range.from, range.to);
    if (!selected.trim()) return;
    const controller = new AbortController();
    abortQuickEditRef.current = controller;
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
      if (editor && page.editorMode === "rich") {
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
          showPageQuickEditSuggestion(editor, {
            from: changedFrom,
            to: changedTo.b,
          });
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
    } finally {
      setQuickEditLoading(false);
      abortQuickEditRef.current = undefined;
    }
  };

  const discardQuickEdit = () => {
    if (!quickEditPreview) return;
    setCurrentContent(quickEditPreview.originalContent, "saved");
    if (editor && page.editorMode === "rich") {
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
    setQuickEditPreview(null);
  };

  const applyQuickEdit = async () => {
    await saveNow("quick-edit");
    if (editor) clearPageQuickEditSuggestion(editor);
    sourceEditorRef.current?.blur();
    setQuickEditPreview(null);
  };

  const sendPageMessage = async (message: string) => {
    const saved = await saveNow();
    await session.sendMessage(message, {
      context: {
        kind: "page",
        path: page.path,
        expectedRevision: saved.revision,
      },
    });
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
    <div className="flex size-full min-w-0">
      <section
        className={`relative min-w-0 flex-1 overflow-y-auto bg-background ${isPageRun ? "ring-1 ring-inset ring-primary/20" : ""}`}
        data-edit-origin={isPageRun ? `codex:${session.state.activeRun?.id}` : "user"}
      >
        <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b bg-background/90 px-5 text-xs text-muted-foreground backdrop-blur">
          <span>{saveLabel(saveState, isPageRun)}</span>
          <div className="flex items-center gap-1">
            {page.editorMode === "source" && (
              <span className="mr-2 rounded-full bg-muted px-2 py-1">Source</span>
            )}
            {!railOpen && (
              <Button
                aria-label="Open assistant"
                onClick={() => setRailOpen(true)}
                size="icon-sm"
                variant="ghost"
              >
                <PanelRightOpenIcon />
              </Button>
            )}
            <Button
              aria-label="Open page assistant"
              className="lg:hidden"
              onClick={() => setMobileRailOpen(true)}
              size="icon-sm"
              variant="ghost"
            >
              <PanelRightOpenIcon />
            </Button>
          </div>
        </div>

        {conflict && (
          <div className="mx-auto mt-6 flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
            <span>This page changed on disk while you were editing.</span>
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => loadPage(conflict)} size="sm" variant="outline">
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
            <Button onClick={() => void reconcileDisk()} size="sm" variant="outline">
              Try again
            </Button>
          </div>
        )}

        {page.editorMode === "rich" && editor && (
          <EditorToolbar disabled={editorLocked} editor={editor} />
        )}

        <div className="mx-auto w-full max-w-3xl px-8 py-10">
          {page.editorMode === "rich" && editor ? (
            <>
              <BubbleMenu
                editor={editor}
                shouldShow={({ editor: currentEditor }) =>
                  !currentEditor.state.selection.empty && !editorLocked
                }
              >
                <QuickEditMenu
                  editor={editor}
                  loading={quickEditLoading}
                  onSelect={(command, instruction) =>
                    void runQuickEdit(command, instruction)
                  }
                />
              </BubbleMenu>
              <EditorContent editor={editor} />
            </>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <QuickEditMenu
                  disabled={sourceSelection.from === sourceSelection.to}
                  loading={quickEditLoading}
                  onSelect={(command, instruction) =>
                    void runQuickEdit(command, instruction)
                  }
                />
              </div>
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

        {(quickEditLoading || quickEditPreview) && (
          <div className="sticky bottom-5 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border bg-background/95 px-2 py-2 shadow-lg backdrop-blur">
            {quickEditLoading ? (
              <>
                <LoaderCircleIcon className="ml-2 size-4 animate-spin text-primary" />
                <span className="px-2 text-sm">Rewriting selection</span>
                <Button
                  aria-label="Cancel quick edit"
                  onClick={() => abortQuickEditRef.current?.abort()}
                  size="icon-sm"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </>
            ) : quickEditPreview ? (
              <>
                <span className="rounded-full bg-primary/15 px-3 py-1 text-sm text-primary-foreground dark:text-primary">
                  Suggested edit
                </span>
                <Button onClick={() => void applyQuickEdit()} size="sm">
                  <CheckIcon /> Accept
                </Button>
                <Button onClick={discardQuickEdit} size="sm" variant="outline">
                  <XIcon /> Discard
                </Button>
                <Button
                  onClick={() => {
                    const preview = quickEditPreview;
                    discardQuickEdit();
                    void runQuickEdit(
                      preview.command,
                      preview.instruction,
                      preview,
                    );
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <RotateCcwIcon /> Try again
                </Button>
              </>
            ) : null}
          </div>
        )}
      </section>

      <AssistantRail
        disabled={!!quickEditPreview || quickEditLoading}
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
  editor,
  loading,
  onSelect,
}: {
  disabled?: boolean;
  editor?: Editor;
  loading: boolean;
  onSelect: (command: QuickEditCommand, instruction?: string) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  return (
    <div className="relative flex items-center gap-1 rounded-xl border bg-background p-1 shadow-md">
      {editor && (
        <>
          <Button
            aria-label="Bold"
            className={editor.isActive("bold") ? "bg-accent" : undefined}
            onClick={() => editor.chain().focus().toggleBold().run()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <strong>B</strong>
          </Button>
          <Button
            aria-label="Italic"
            className={editor.isActive("italic") ? "bg-accent" : undefined}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <em>I</em>
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
        </>
      )}
      <SparklesIcon className="mx-1 size-4 text-primary" />
      {[
        ["improve", "Improve"],
        ["shorten", "Shorten"],
        ["summarize", "Summarize"],
        ["fix-grammar", "Fix grammar"],
      ].map(([command, label]) => (
        <Button
          disabled={disabled || loading}
          key={command}
          onClick={() => onSelect(command as QuickEditCommand)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {label}
        </Button>
      ))}
      <Button
        disabled={disabled || loading}
        onClick={() => setCustomOpen((open) => !open)}
        size="sm"
        type="button"
        variant="ghost"
      >
        Custom <ChevronRightIcon />
      </Button>
      {customOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border bg-background p-3 shadow-lg">
          <Textarea
            autoFocus
            className="min-h-20 rounded-lg bg-transparent"
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Describe the change…"
            value={instruction}
          />
          <Button
            className="mt-2 w-full"
            disabled={!instruction.trim()}
            onClick={() => {
              onSelect("custom", instruction.trim());
              setCustomOpen(false);
            }}
            size="sm"
          >
            Rewrite selection
          </Button>
        </div>
      )}
    </div>
  );
}

function EditorToolbar({
  disabled,
  editor,
}: {
  disabled: boolean;
  editor: Editor;
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
      code: current.isActive("code"),
      highlight: current.isActive("highlight"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
      codeBlock: current.isActive("codeBlock"),
      canUndo: current.can().chain().focus().undo().run(),
      canRedo: current.can().chain().focus().redo().run(),
    }),
  });
  const activeClass = (active: boolean) =>
    active ? "bg-accent text-accent-foreground" : "text-muted-foreground";

  return (
    <div className="sticky top-10 z-10 border-b bg-background/95 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1">
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
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
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
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
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
          aria-label="Inline code"
          className={activeClass(state.code)}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCode().run()}
          size="icon-sm"
          title="Inline code"
          type="button"
          variant="ghost"
        >
          <Code2Icon />
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
        <Button
          aria-label="Code block"
          className={activeClass(state.codeBlock)}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          size="icon-sm"
          title="Code block"
          type="button"
          variant="ghost"
        >
          <span className="font-mono text-xs">{"</>"}</span>
        </Button>
        <div className="flex-1" />
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
      </div>
    </div>
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
