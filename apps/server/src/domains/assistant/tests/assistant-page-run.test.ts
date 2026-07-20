import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CodexAppServer } from "../../../infrastructure/codex/codex-app-server";
import type { CodexServerRequestResponder } from "../../../infrastructure/codex/codex.types";
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
    expect(run.scope).toEqual({ kind: "page", path: "pages/Notes.md" });
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
      'The user currently has the page "Notes.md" open in the Heydesk page editor.',
    );
    expect(input).not.toContain("pages/Notes.md");
    expect(input).not.toContain(page.revision);
    expect(input).toContain("Make the opening clearer.");
    const thread = codex.requests.find(
      (request) => request.method === "thread/start",
    );
    expect(
      (thread?.params as { developerInstructions: string })
        .developerInstructions,
    ).toContain("Keep responses concise, natural");
    expect(
      (thread?.params as { developerInstructions: string })
        .developerInstructions,
    ).toContain('workspace-relative path is "pages/Notes.md"');
    expect(
      (thread?.params as { developerInstructions: string })
        .developerInstructions,
    ).toContain("Only modify this exact page");
    expect(
      (thread?.params as { developerInstructions: string })
        .developerInstructions,
    ).toContain("Do not add YAML frontmatter, raw HTML, MDX or JSX");
    expect(
      (thread?.params as { developerInstructions: string })
        .developerInstructions,
    ).toContain("You may read other workspace files only when the user explicitly requests workspace-aware work");

    codex.emit("notification", {
      method: "item/started",
      params: {
        threadId: "thread-1",
        item: {
          id: "file-change-1",
          type: "fileChange",
          changes: [{ path: "pages/Other.md", kind: "update" }],
        },
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    let resolution: unknown;
    codex.emit("request", {
      request: {
        id: 1,
        method: "item/fileChange/requestApproval",
        params: { threadId: "thread-1", itemId: "file-change-1" },
      },
      resolve(value) {
        resolution = value;
      },
      reject() {
        throw new Error("The out-of-scope page change should be declined.");
      },
    } satisfies CodexServerRequestResponder);
    await new Promise((resolve) => setImmediate(resolve));
    expect(resolution).toEqual({ decision: "decline" });

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
