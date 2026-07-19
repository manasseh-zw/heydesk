import { describe, expect, it } from "vitest";

import { resolvePageEditorMode } from "../page-editor-mode";

describe("page editor mode", () => {
  it("uses the rich editor when TipTap preserves the Markdown", () => {
    expect(
      resolvePageEditorMode({
        syntax: "markdown",
        content: "# Notes\n\nA paragraph with **emphasis**.\n",
      }),
    ).toBe("rich");
  });

  it("keeps TipTap-authored highlights in the rich editor", () => {
    expect(
      resolvePageEditorMode({
        syntax: "markdown",
        content: "# Notes\n\nA ==highlighted== phrase.\n",
      }),
    ).toBe("rich");
  });

  it("falls back to source when rich parsing would lose syntax", () => {
    expect(
      resolvePageEditorMode({
        syntax: "markdown",
        content: "# Notes\n\n<!-- preserve this comment -->\n",
      }),
    ).toBe("source");
  });

  it("keeps MDX in the lossless source editor", () => {
    expect(
      resolvePageEditorMode({
        syntax: "mdx",
        content: "<Callout>Keep me</Callout>",
      }),
    ).toBe("source");
  });
});
