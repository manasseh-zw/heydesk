import { describe, expect, it } from "vitest";

import { startAssistantRunSchema } from "../assistant.schemas";

describe("assistant run input", () => {
  it("accepts a bounded prompt", () => {
    expect(
      startAssistantRunSchema.safeParse({
        runId: "run-1",
        message: "a".repeat(20_000),
      }).success,
    ).toBe(true);
  });

  it("rejects prompts beyond the demo-safe limit", () => {
    expect(
      startAssistantRunSchema.safeParse({
        runId: "run-1",
        message: "a".repeat(20_001),
      }).success,
    ).toBe(false);
  });
});
