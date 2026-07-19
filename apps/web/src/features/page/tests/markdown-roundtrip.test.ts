import { Editor } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

const supportedMarkdown = [
  "# Title\n\nParagraph with **bold**, *italic*, and `code`.",
  "## List\n\n- One\n- Two\n\n1. First\n2. Second",
  "> Quoted text\n\n```ts\nconst value = 1\n```",
  "A [link](https://example.com).\n\n---\n\nDone.",
  "A paragraph with ==highlighted text==.",
];

describe("rich page Markdown round trips", () => {
  for (const source of supportedMarkdown) {
    it(`preserves ${source.split("\n", 1)[0]}`, () => {
      const editor = new Editor({
        element: null,
        extensions: [StarterKit, Markdown, Highlight],
        content: source,
        contentType: "markdown",
      });

      expect(editor.getMarkdown()).toBe(source);
      editor.destroy();
    });
  }
});
