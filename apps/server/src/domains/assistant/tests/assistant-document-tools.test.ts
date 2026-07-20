import { describe, expect, it } from "vitest";

import { validateDocumentToolArguments } from "../assistant.service";

describe("document tool argument validation", () => {
  it("rejects tracked changes that span multiple paragraphs", () => {
    const result = validateDocumentToolArguments("suggest_change", {
      paraId: "A1B2C3",
      search: "Opening paragraph",
      replaceWith: "First paragraph\n\nSecond paragraph",
    });

    expect(result).toEqual({
      success: false,
      error: "Tracked document changes must stay within one paragraph.",
    });
  });

  it("accepts bounded single-paragraph tracked changes", () => {
    expect(
      validateDocumentToolArguments("suggest_change", {
        paraId: "A1B2C3",
        search: "rough draft",
        replaceWith: "polished draft",
      }),
    ).toMatchObject({ success: true });
  });

  it("routes new content through the structural paragraph tool", () => {
    expect(
      validateDocumentToolArguments("suggest_change", {
        paraId: "A1B2C3",
        search: "",
        replaceWith: "New paragraph",
      }),
    ).toEqual({
      success: false,
      error:
        "Tracked changes must identify existing text. Use append_paragraphs for new content.",
    });
    expect(
      validateDocumentToolArguments("append_paragraphs", {
        paragraphs: [
          {
            styleId: "Heading1",
            runs: [
              { text: "Claim:", marks: { bold: true } },
              { text: " Add the main point." },
            ],
          },
        ],
      }),
    ).toMatchObject({ success: true });
  });

  it("bounds structural document operations", () => {
    expect(
      validateDocumentToolArguments("append_paragraphs", {
        paragraphs: [{ runs: [{ text: "" }] }],
      }),
    ).toMatchObject({ success: false });
    expect(
      validateDocumentToolArguments("append_paragraphs", {
        paragraphs: [{ runs: [{ text: "x".repeat(8_001) }] }],
      }),
    ).toMatchObject({ success: false });
  });

  it("accepts safe formatting and paragraph-style operations", () => {
    expect(
      validateDocumentToolArguments("apply_formatting", {
        paraId: "A1B2C3",
        search: "Important",
        marks: { bold: true, color: { rgb: "88CC00" } },
      }),
    ).toMatchObject({ success: true });
    expect(
      validateDocumentToolArguments("set_paragraph_style", {
        paraId: "A1B2C3",
        styleId: "Heading1",
      }),
    ).toMatchObject({ success: true });
    expect(
      validateDocumentToolArguments("apply_formatting_batch", {
        operations: [
          { paraId: "A1B2C3", marks: { bold: false } },
          { paraId: "D4E5F6", marks: { italic: true } },
        ],
      }),
    ).toMatchObject({ success: true });
    expect(
      validateDocumentToolArguments("set_paragraph_styles", {
        operations: [
          { paraId: "A1B2C3", styleId: "Heading1" },
          { paraId: "D4E5F6", styleId: "Normal" },
        ],
      }),
    ).toMatchObject({ success: true });
  });

  it("bounds batch formatting operations", () => {
    expect(
      validateDocumentToolArguments("apply_formatting_batch", {
        operations: [],
      }),
    ).toMatchObject({ success: false });
    expect(
      validateDocumentToolArguments("set_paragraph_styles", {
        operations: Array.from({ length: 101 }, (_, index) => ({
          paraId: String(index),
          styleId: "Normal",
        })),
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects malformed formatting values before they reach the editor", () => {
    expect(
      validateDocumentToolArguments("apply_formatting", {
        paraId: "A1B2C3",
        marks: { color: { rgb: "lime" } },
      }),
    ).toMatchObject({ success: false });
    expect(
      validateDocumentToolArguments("apply_formatting", {
        paraId: "A1B2C3",
        marks: {},
      }),
    ).toMatchObject({ success: false });
  });
});
