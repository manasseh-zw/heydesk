import { describe, expect, it } from "vitest";

import { projectAssistantEvent } from "../assistant-agui-projector";
import type { AssistantRun } from "../assistant.types";

const run: AssistantRun = {
  id: "run-1",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  status: "running",
  scope: { kind: "workspace" },
  userText: "Create a brief",
  createdAt: "2026-07-18T00:00:00.000Z",
};

describe("assistant AG-UI projector", () => {
  it("projects run and message lifecycles", () => {
    expect(
      projectAssistantEvent({ type: "run.started", run }).map(
        (event) => event.type,
      ),
    ).toEqual(["RUN_STARTED", "CUSTOM"]);
    expect(
      projectAssistantEvent({
        type: "message.delta",
        messageId: "message-1",
        delta: "Hello",
      }),
    ).toEqual([
      expect.objectContaining({
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "message-1",
        delta: "Hello",
      }),
    ]);
  });

  it("keeps Heydesk-specific state namespaced", () => {
    expect(projectAssistantEvent({ type: "plan.updated", steps: [] })).toEqual([
      expect.objectContaining({
        type: "CUSTOM",
        name: "heydesk:plan",
        value: [],
      }),
    ]);
  });

  it("projects tool calls without losing their Heydesk kind", () => {
    const events = projectAssistantEvent({
      type: "activity.started",
      activity: {
        id: "tool-1",
        runId: run.id,
        kind: "file-change",
        title: "Update Product.md",
        status: "running",
        input: { path: "Product.md" },
      },
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "TOOL_CALL_START",
        toolCallId: "tool-1",
        toolName: "heydesk.file-change",
      }),
      expect.objectContaining({ type: "TOOL_CALL_ARGS", toolCallId: "tool-1" }),
    ]);
  });
});
