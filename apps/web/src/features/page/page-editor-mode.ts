import { Editor } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

import type { Page } from "./page.types";

export function resolvePageEditorMode(
  page: Pick<Page, "content" | "syntax">,
): "rich" | "source" {
  if (page.syntax === "mdx") return "source";

  let editor: Editor | undefined;
  try {
    editor = new Editor({
      element: null,
      extensions: [StarterKit, Markdown, Highlight],
      content: page.content,
      contentType: "markdown",
    });
    return normalizeMarkdown(editor.getMarkdown()) ===
      normalizeMarkdown(page.content)
      ? "rich"
      : "source";
  } catch {
    return "source";
  } finally {
    editor?.destroy();
  }
}

function normalizeMarkdown(value: string): string {
  return value.replaceAll("\r\n", "\n").trimEnd();
}
