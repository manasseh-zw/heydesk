import { describe, expect, it } from "vitest";

import type { AssistantSnapshot } from "../assistant.types";
import { snapshotToMessages } from "../assistant.service";

describe("snapshotToMessages", () => {
  it("restores persisted workspace activity in chronological order", () => {
    const snapshot: AssistantSnapshot = {
      workspaceId: "workspace-1",
      activeRun: null,
      recentRuns: [
        {
          id: "run-1",
          workspaceId: "workspace-1",
          threadId: "thread-1",
          status: "completed",
          userText: "Create a page",
          createdAt: "2026-07-18T00:00:00.000Z",
          completedAt: "2026-07-18T00:00:01.000Z",
        },
      ],
      events: [
        event(1, {
          type: "message.started",
          messageId: "message-before",
        }),
        event(2, {
          type: "message.delta",
          messageId: "message-before",
          delta: "I’ll create the page.",
        }),
        event(3, {
          type: "activity.started",
          activity: {
            id: "activity-1",
            runId: "run-1",
            kind: "file-change",
            title: "File change",
            status: "running",
            input: { path: "Plan.md" },
          },
        }),
        event(4, {
          type: "activity.completed",
          activity: {
            id: "activity-1",
            runId: "run-1",
            kind: "file-change",
            title: "File change",
            status: "completed",
            input: { path: "Plan.md" },
            output: { status: "completed" },
          },
        }),
        event(5, {
          type: "message.started",
          messageId: "message-after",
        }),
        event(6, {
          type: "message.delta",
          messageId: "message-after",
          delta: "Created Plan.md.",
        }),
      ],
      lastSequence: 6,
    };

    const messages = snapshotToMessages(snapshot);

    expect(messages).toHaveLength(2);
    expect(messages[1]?.parts.map((part) => part.type)).toEqual([
      "text",
      "tool-call",
      "tool-result",
      "text",
    ]);
    expect(messages[1]?.parts[1]).toMatchObject({
      type: "tool-call",
      id: "activity-1",
      name: "heydesk.file-change",
      state: "complete",
    });
  });
});

function event(
  sequence: number,
  value: Record<string, unknown> & { type: string },
): AssistantSnapshot["events"][number] {
  return {
    sequence,
    runId: "run-1",
    workspaceId: "workspace-1",
    createdAt: `2026-07-18T00:00:0${sequence}.000Z`,
    event: value,
  };
}
