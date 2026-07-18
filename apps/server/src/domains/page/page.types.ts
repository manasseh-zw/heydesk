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
