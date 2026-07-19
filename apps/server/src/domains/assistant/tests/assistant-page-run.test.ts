import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CodexAppServer } from "../../../infrastructure/codex/codex-app-server";
import { PageService } from "../../page/page.service";
import { AssistantConflictError, AssistantService } from "../assistant.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("page-scoped assistant runs", () => {
  it("validates the revision and sends explicit context and preferences", async () => {
    const root = await mkdtemp(join(tmpdir(), "heydesk-page-run-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".heydesk"));
    await mkdir(join(root, "pages"));
    await writeFile(
      join(root, "pages", "Notes.md"),
      "# Notes\n\nOriginal.",
    );
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
      "pages/Notes.md",
    );
    const codex = new FakeCodex();
    const service = new AssistantService(
      codex as unknown as CodexAppServer,
      workspaces,
      { ephemeralThreads: true },
    );

    const run = await service.startRun(
      "workspace-1",
      "run-1",
      "Make the opening clearer.",
      {
        context: {
          kind: "page",
          path: "pages/Notes.md",
          expectedRevision: page.revision,
        },
        preferences: {
          model: "gpt-5.6-luna",
          effort: "low",
          serviceTier: "fast",
        },
      },
    );

    expect(run.userText).toBe("Make the opening clearer.");
    expect(run.context).toMatchObject({ path: "pages/Notes.md" });
    const turn = codex.requests.find((request) => request.method === "turn/start");
    expect(turn?.params).toMatchObject({
      model: "gpt-5.6-luna",
      effort: "low",
      serviceTier: "fast",
      approvalPolicy: "untrusted",
      sandboxPolicy: { networkAccess: false },
    });
    const input = (turn?.params as { input: Array<{ text: string }> }).input[0]?.text;
    expect(input).toContain(
      "The user is currently viewing pages/Notes.md.",
    );
    expect(input).toContain(page.revision);
    expect(input).toContain("Make the opening clearer.");

    await expect(
      service.startRun("workspace-1", "run-stale", "Edit it.", {
        context: {
          kind: "page",
          path: "pages/Notes.md",
          expectedRevision: "0".repeat(64),
        },
      }),
    ).rejects.toBeInstanceOf(AssistantConflictError);
  });
});

class FakeCodex extends EventEmitter {
  readonly requests: Array<{ method: string; params: unknown }> = [];

  async request(method: string, params?: unknown): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "account/read") {
      return { account: { type: "chatgpt" }, requiresOpenaiAuth: true };
    }
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
              { reasoningEffort: "medium", description: "Balanced" },
            ],
            defaultReasoningEffort: "medium",
            serviceTiers: [
              { id: "fast", name: "Fast", description: "Low latency" },
            ],
          },
        ],
        nextCursor: null,
      };
    }
    if (method === "thread/start") {
      return { thread: { id: "thread-1" }, model: "gpt-5.6-luna" };
    }
    if (method === "turn/start") return { turn: { id: "turn-1" } };
    return {};
  }
}
