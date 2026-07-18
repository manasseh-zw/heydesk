export type PageSummary = {
  path: string;
  name: string;
  title: string;
  excerpt: string;
  updatedAt: string;
  size: number;
};

export type Page = PageSummary & {
  content: string;
  revision: string;
  syntax: "markdown" | "mdx";
  editorMode: "rich" | "source";
};

export type PageWriteOrigin = "user" | "quick-edit";

export type QuickEditCommand =
  | "improve"
  | "shorten"
  | "summarize"
  | "fix-grammar"
  | "custom";

export type QuickEditResult = {
  id: string;
  replacementMarkdown: string;
  model: string;
  effort: "low";
  serviceTier: "fast" | "default";
};

export class PageRevisionConflictError extends Error {
  constructor(readonly current: Page) {
    super("This page changed on disk.");
  }
}
