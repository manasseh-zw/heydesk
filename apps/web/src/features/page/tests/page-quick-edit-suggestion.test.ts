import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { EditorState } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import {
  createPageQuickEditSuggestionPlugin,
  getPageQuickEditSuggestionRange,
  PageQuickEditSuggestion,
  withPageQuickEditSuggestion,
  withoutPageQuickEditSuggestion,
} from "../page-quick-edit-suggestion";

describe("page quick-edit suggestion", () => {
  it("keeps its lime preview out of serialized Markdown", () => {
    const editor = new Editor({
      element: null,
      extensions: [StarterKit, Markdown, PageQuickEditSuggestion],
      content: "# Notes\n\nA clearer sentence.",
      contentType: "markdown",
    });
    const markdown = editor.getMarkdown();
    let state = EditorState.create({
      doc: editor.state.doc,
      plugins: [createPageQuickEditSuggestionPlugin()],
    });

    state = state.apply(
      withPageQuickEditSuggestion(state.tr, { from: 10, to: 24 }),
    );

    expect(getPageQuickEditSuggestionRange(state)).toEqual({
      from: 10,
      to: 24,
    });
    expect(state.doc.eq(editor.state.doc)).toBe(true);
    expect(editor.getMarkdown()).toBe(markdown);

    state = state.apply(withoutPageQuickEditSuggestion(state.tr));
    expect(getPageQuickEditSuggestionRange(state)).toBeNull();
    expect(editor.getMarkdown()).toBe(markdown);
    editor.destroy();
  });
});
