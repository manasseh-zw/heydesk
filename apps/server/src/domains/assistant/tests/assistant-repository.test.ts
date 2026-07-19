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
    expect(await repository.getThread()).toEqual({ id: "codex-thread-1" });

    const run: AssistantRun = {
      id: "run-1",
      workspaceId: "workspace-1",
      threadId: "codex-thread-1",
      status: "running",
      scope: { kind: "workspace" },
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

  it("isolates document threads, histories, and snapshots by path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "heydesk-repository-"));
    await mkdir(join(workspace, ".heydesk"));
    const first = new AssistantRepository("workspace-1", workspace, {
      kind: "document",
      path: "documents/First.docx",
    });
    const second = new AssistantRepository("workspace-1", workspace, {
      kind: "document",
      path: "documents/Second.docx",
    });
    await first.saveThread("thread-first", "document-tools-v1");
    await second.saveThread("thread-second", "document-tools-v1");

    const firstRun = completedDocumentRun(
      "run-first",
      "thread-first",
      "documents/First.docx",
    );
    const secondRun = completedDocumentRun(
      "run-second",
      "thread-second",
      "documents/Second.docx",
    );
    await first.createRun(firstRun);
    await second.createRun(secondRun);
    await first.appendEvent(firstRun.id, {
      type: "message.completed",
      messageId: "message-first",
      text: "First history",
    });
    await second.appendEvent(secondRun.id, {
      type: "message.completed",
      messageId: "message-second",
      text: "Second history",
    });

    await expect(first.getThread()).resolves.toEqual({
      id: "thread-first",
      toolContractVersion: "document-tools-v1",
    });
    await expect(second.getThread()).resolves.toEqual({
      id: "thread-second",
      toolContractVersion: "document-tools-v1",
    });
    await expect(first.getSnapshot()).resolves.toMatchObject({
      scope: { kind: "document", path: "documents/First.docx" },
      recentRuns: [{ id: "run-first" }],
      events: [{ event: { text: "First history" } }],
    });
    await expect(second.getSnapshot()).resolves.toMatchObject({
      scope: { kind: "document", path: "documents/Second.docx" },
      recentRuns: [{ id: "run-second" }],
      events: [{ event: { text: "Second history" } }],
    });
  });
});

function completedDocumentRun(
  id: string,
  threadId: string,
  path: string,
): AssistantRun {
  return {
    id,
    workspaceId: "workspace-1",
    threadId,
    status: "completed",
    scope: { kind: "document", path },
    context: {
      kind: "document",
      path,
      expectedRevision: "0".repeat(64),
    },
    userText: "Revise this document",
    createdAt: "2026-07-18T00:00:00.000Z",
    completedAt: "2026-07-18T00:00:01.000Z",
  };
}
