import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CodexAppServer } from "../../../infrastructure/codex/codex-app-server";
import { afterEach, describe, expect, it } from "vitest";

import { DocumentService } from "../../document/document.service";
import { AssistantService } from "../assistant.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("document-scoped assistant runs", () => {
  it("creates an isolated read-only thread with the versioned document tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "heydesk-document-run-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".heydesk"));
    const workspaces = {
      getById: async () => ({
        id: "workspace-1",
        name: "Workspace",
        path: root,
        lastOpenedAt: new Date(0).toISOString(),
      }),
    };
    const documents = new DocumentService(workspaces);
    const document = await documents.create("workspace-1", "Proposal");
    const codex = new FakeCodex();
    const service = new AssistantService(
      codex as unknown as CodexAppServer,
      workspaces,
      { ephemeralThreads: true },
    );

    const run = await service.startRun(
      "workspace-1",
      "run-document",
      "Improve the opening paragraph.",
      {
        scope: { kind: "document", path: document.path },
        context: {
          kind: "document",
          path: document.path,
          expectedRevision: document.revision,
        },
      },
    );

    expect(run.scope).toEqual({ kind: "document", path: "Proposal.docx" });
    const thread = codex.requests.find(({ method }) => method === "thread/start");
    expect(thread?.params).toMatchObject({
      cwd: root,
      approvalPolicy: "never",
      sandbox: "read-only",
      model: "gpt-5.6-luna",
    });
    expect(
      (thread?.params as { developerInstructions: string })
        .developerInstructions,
    ).toContain("Each suggestion must target exactly one paragraph");
    const namespaces = (
      thread?.params as {
        dynamicTools: Array<{
          name: string;
          tools: Array<{ name: string }>;
        }>;
      }
    ).dynamicTools;
    expect(namespaces).toHaveLength(1);
    expect(namespaces[0]?.name).toBe("document");
    const tools = namespaces[0]?.tools.map(({ name }) => name);
    expect(tools).toEqual([
      "read_document",
      "read_selection",
      "read_page",
      "read_pages",
      "find_text",
      "read_comments",
      "read_changes",
      "add_comment",
      "suggest_change",
      "apply_formatting",
      "set_paragraph_style",
      "scroll",
    ]);
    const turn = codex.requests.find(({ method }) => method === "turn/start");
    expect(turn?.params).toMatchObject({
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly" },
      model: "gpt-5.6-luna",
      effort: "medium",
    });
    await expect(
      service.getSnapshot("workspace-1", {
        kind: "document",
        path: document.path,
      }),
    ).resolves.toMatchObject({
      scope: { kind: "document", path: document.path },
      activeRun: { id: "run-document" },
    });
    await expect(service.getSnapshot("workspace-1")).resolves.toMatchObject({
      scope: { kind: "workspace" },
      activeRun: null,
      events: [],
    });
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
            serviceTiers: [],
          },
        ],
        nextCursor: null,
      };
    }
    if (method === "thread/start") {
      return { thread: { id: "thread-document" }, model: "gpt-5.6-luna" };
    }
    if (method === "turn/start") return { turn: { id: "turn-document" } };
    return {};
  }
}
