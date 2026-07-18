import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AssistantRepository } from "../assistant.repository";
import type { AssistantRun } from "../assistant.types";

describe("assistant repository", () => {
  it("persists threads, runs, events, and snapshots in the workspace database", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "heydesk-repository-"));
    await mkdir(join(workspace, ".heydesk"));
    const repository = new AssistantRepository("workspace-1", workspace);
    await repository.saveThread("codex-thread-1");
    expect(await repository.getThreadId()).toBe("codex-thread-1");

    const run: AssistantRun = {
      id: "run-1",
      workspaceId: "workspace-1",
      threadId: "codex-thread-1",
      status: "running",
      userText: "Draft a note",
      createdAt: "2026-07-18T00:00:00.000Z",
    };
    await repository.createRun(run);
    const event = await repository.appendEvent(run.id, {
      type: "message.delta",
      messageId: "message-1",
      delta: "Hello",
    });
    expect(event.sequence).toBeGreaterThan(0);

    const snapshot = await repository.getSnapshot();
    expect(snapshot.activeRun?.id).toBe(run.id);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.event).toEqual(
      expect.objectContaining({ type: "message.delta", delta: "Hello" }),
    );
  });
});
