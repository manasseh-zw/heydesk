import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CodexAppServer } from "../../../infrastructure/codex/codex-app-server";
import type { CodexNotification } from "../../../infrastructure/codex/codex.types";
import { PageQuickEditService } from "../page-quick-edit.service";
import { PageService } from "../page.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("PageQuickEditService", () => {
  it("uses an isolated Luna low-effort fast turn and returns structured output", async () => {
    const root = await mkdtemp(join(tmpdir(), "heydesk-quick-edit-test-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "Notes.md"), "# Notes\n\nThis is rather wordy.");
    const workspaces = {
      getById: async () => ({
        id: "workspace-1",
        name: "Workspace",
        path: root,
        lastOpenedAt: new Date(0).toISOString(),
      }),
    };
    const page = await new PageService(workspaces).read(
      "workspace-1",
      "Notes.md",
    );
    const codex = new FakeCodex();
    const service = new PageQuickEditService(
      codex as unknown as CodexAppServer,
      workspaces,
    );

    const result = await service.run("workspace-1", {
      path: "Notes.md",
      expectedRevision: page.revision,
      selectionMarkdown: "This is rather wordy.",
      command: "shorten",
    });

    expect(result).toMatchObject({
      replacementMarkdown: "This is concise.",
      model: "gpt-5.6-luna",
      effort: "low",
      serviceTier: "fast",
    });
    expect(codex.requests.find((request) => request.method === "thread/start")?.params)
      .toMatchObject({
        model: "gpt-5.6-luna",
        serviceTier: "fast",
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
      });
    expect(codex.requests.find((request) => request.method === "turn/start")?.params)
      .toMatchObject({
        model: "gpt-5.6-luna",
        effort: "low",
        serviceTier: "fast",
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false },
      });
  });
});

class FakeCodex extends EventEmitter {
  readonly requests: Array<{ method: string; params: unknown }> = [];
  private readonly listeners = new Map<
    string,
    (notification: CodexNotification) => void
  >();

  async request(method: string, params?: unknown): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "model/list") {
      return {
        data: [
          {
            id: "gpt-5.6-luna",
            model: "gpt-5.6-luna",
            displayName: "GPT-5.6 Luna",
            hidden: false,
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Fast" },
            ],
            defaultReasoningEffort: "medium",
            serviceTiers: [
              { id: "fast", name: "Fast", description: "Low latency" },
            ],
            defaultServiceTier: "default",
          },
        ],
        nextCursor: null,
      };
    }
    if (method === "thread/start") {
      return { thread: { id: "quick-thread" }, model: "gpt-5.6-luna" };
    }
    if (method === "turn/start") {
      queueMicrotask(() => {
        const listener = this.listeners.get("quick-thread");
        listener?.({
          method: "item/agentMessage/delta",
          params: {
            threadId: "quick-thread",
            delta: JSON.stringify({ replacementMarkdown: "This is concise." }),
          },
        });
        listener?.({
          method: "turn/completed",
          params: {
            threadId: "quick-thread",
            turn: { id: "quick-turn", status: "completed" },
          },
        });
      });
      return { turn: { id: "quick-turn" } };
    }
    return {};
  }

  subscribeToThread(
    threadId: string,
    listener: (notification: CodexNotification) => void,
  ): () => void {
    this.listeners.set(threadId, listener);
    return () => this.listeners.delete(threadId);
  }
}
