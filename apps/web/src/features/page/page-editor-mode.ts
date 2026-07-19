import type { Page } from "./page.types";

export function resolvePageEditorMode(
  page: Pick<Page, "content" | "syntax">,
): "rich" | "source" {
  return page.syntax === "mdx" ? "source" : "rich";
}
