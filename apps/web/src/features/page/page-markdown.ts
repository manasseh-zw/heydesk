import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

export function getPageMarkdownExtensions() {
  return [
    StarterKit.configure({
      link: {
        autolink: true,
        openOnClick: true,
        HTMLAttributes: {
          class:
            "cursor-pointer font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 transition-colors hover:text-primary",
        },
      },
    }),
    Markdown,
    Highlight,
  ];
}
