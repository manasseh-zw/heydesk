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
