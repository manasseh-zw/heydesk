import { describe, expect, it } from "vitest";

import { resolvePageEditorMode } from "../page-editor-mode";

describe("page editor mode", () => {
  it.each([
    ["ordinary Markdown", "# Notes\n\nA paragraph with **emphasis**.\n"],
    ["raw HTML", "# Notes\n\n<u>Render this markup</u>\n"],
    ["frontmatter", "---\ntitle: Notes\n---\n\n# Notes\n"],
    ["comments", "# Notes\n\n<!-- render this comment -->\n"],
    ["task lists", "# Tasks\n\n- [ ] Render this checkbox\n"],
    ["footnotes", "A claim[^1].\n\n[^1]: Supporting note.\n"],
    [
      "reference links",
      "Read the [guide][docs].\n\n[docs]: https://example.com\n",
    ],
    ["images", "![Diagram](./diagram.png)\n"],
    ["tables", "| Name | Value |\n| --- | --- |\n| One | Two |\n"],
  ])("opens %s directly in TipTap", (_name, content) => {
    expect(
      resolvePageEditorMode({
        syntax: "markdown",
        content,
      }),
    ).toBe("rich");
  });

  it("keeps MDX in the source editor", () => {
    expect(
      resolvePageEditorMode({
        syntax: "mdx",
        content: "<Callout>Keep me</Callout>",
      }),
    ).toBe("source");
  });
});
