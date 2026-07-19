import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { getPageMarkdownExtensions } from "../page-markdown";

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
        extensions: getPageMarkdownExtensions(),
        content: source,
        contentType: "markdown",
      });

      expect(editor.getMarkdown()).toBe(source);
      editor.destroy();
    });
  }

  it("renders Markdown links as recognizable external links", () => {
    const editor = new Editor({
      element: null,
      extensions: getPageMarkdownExtensions(),
      content: "Read the [source](https://example.com).",
      contentType: "markdown",
    });

    const link = editor.extensionManager.extensions.find(
      (extension) => extension.name === "link",
    );
    const linkMark = editor.getJSON().content?.[0]?.content?.[1]?.marks?.[0];

    expect(linkMark).toMatchObject({
      type: "link",
      attrs: {
        href: "https://example.com",
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      },
    });
    expect(link?.options.HTMLAttributes.class).toContain("underline-offset-4");
    editor.destroy();
  });
});
