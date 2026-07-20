import { describe, expect, it } from "vitest";

import {
  composerCommandRequiresInput,
  messageForComposerSubmission,
} from "../workspace-assistant-routing";

describe("workspace assistant composer intent", () => {
  it("makes a selected document action explicit without creating it locally", () => {
    expect(
      messageForComposerSubmission("an essay outline about microplastics", {
        commandId: "create-document",
      }),
    ).toBe(
      "Create a Word document for this request.\n\nan essay outline about microplastics",
    );
  });

  it("leaves ordinary natural-language requests for Codex to interpret", () => {
    expect(
      messageForComposerSubmission(
        "Create a Word document with an essay outline about microplastics.",
      ),
    ).toBe(
      "Create a Word document with an essay outline about microplastics.",
    );
  });

  it("supports command-only actions without adding empty spacing", () => {
    expect(
      messageForComposerSubmission("", { commandId: "summarize-workspace" }),
    ).toBe("Summarize this workspace.");
  });

  it("only waits for user context when creating a new artifact", () => {
    expect(composerCommandRequiresInput("create-page")).toBe(true);
    expect(composerCommandRequiresInput("create-document")).toBe(true);
    expect(composerCommandRequiresInput("summarize-page")).toBe(false);
    expect(composerCommandRequiresInput("improve-document")).toBe(false);
  });
});
