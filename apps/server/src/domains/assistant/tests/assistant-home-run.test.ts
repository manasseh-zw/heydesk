import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodexAppServer } from "../../../infrastructure/codex/codex-app-server";
import type { CodexServerRequestResponder } from "../../../infrastructure/codex/codex.types";
import { AssistantService } from "../assistant.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("Home assistant runs", () => {
  it("limits writes to Pages and declines command escalation", async () => {
    const root = await mkdtemp(join(tmpdir(), "heydesk-home-run-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".heydesk"));
    await mkdir(join(root, "pages"));
    await mkdir(join(root, "documents"));
    const workspaces = {
      getById: async () => ({
        id: "workspace-1",
        name: "Workspace",
        path: root,
        lastOpenedAt: new Date(0).toISOString(),
      }),
    };
    const codex = new FakeCodex();
    const service = new AssistantService(
      codex as unknown as CodexAppServer,
      workspaces,
    );

    await service.startRun("workspace-1", "run-home", "Create a page.", {
      scope: {
        kind: "home",
        sessionId: "019c88e4-8b7d-758f-81fd-6cc47c1d90b9",
      },
    });

    const turn = codex.requests.find((request) => request.method === "turn/start");
    expect(turn?.params).toMatchObject({
      approvalPolicy: "untrusted",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [join(root, "pages")],
        networkAccess: false,
      },
    });
    const thread = codex.requests.find(
      (request) => request.method === "thread/start",
    );
    expect(
      (thread?.params as { developerInstructions: string }).developerInstructions,
    ).toContain("Never create scripts, helper programs");

    let resolution: unknown;
    codex.emit("request", {
      request: {
        id: 1,
        method: "item/commandExecution/requestApproval",
        params: { threadId: "thread-home", itemId: "command-1" },
      },
      resolve(value) {
        resolution = value;
      },
      reject() {
        throw new Error("The request should be declined, not rejected.");
      },
    } satisfies CodexServerRequestResponder);
    await new Promise((resolve) => setImmediate(resolve));

    expect(resolution).toEqual({ decision: "decline" });
    const snapshot = await service.getSnapshot("workspace-1", {
      kind: "home",
      sessionId: "019c88e4-8b7d-758f-81fd-6cc47c1d90b9",
    });
    expect(
      snapshot.events.some(
        ({ event }) => event.type === "interaction.requested",
      ),
    ).toBe(false);
  });

  it("lets Codex create a document and continues the original request in its scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "heydesk-home-document-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".heydesk"));
    await mkdir(join(root, "pages"));
    await mkdir(join(root, "documents"));
    const workspaces = {
      getById: async () => ({
        id: "workspace-1",
        name: "Workspace",
        path: root,
        lastOpenedAt: new Date(0).toISOString(),
      }),
    };
    const codex = new FakeCodex();
    const service = new AssistantService(
      codex as unknown as CodexAppServer,
      workspaces,
    );
    const scope = {
      kind: "home" as const,
      sessionId: "019c88e4-8b7d-758f-81fd-6cc47c1d90b9",
    };
    const message = "Create a Word document with an essay outline on microplastics.";
    const handoffContext =
      "Create a student-friendly Word document containing an essay outline on the effects of microplastics. Include a working thesis, a logical section-by-section structure, supporting points, and research prompts.";

    await service.startRun("workspace-1", "run-home", message, { scope });
    const homeThread = codex.requests.find(
      (request) => request.method === "thread/start",
    );
    expect(homeThread?.params).toMatchObject({
      dynamicTools: [
        expect.objectContaining({
          name: "workspace",
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "create_document",
              inputSchema: expect.objectContaining({
                required: ["name", "context"],
              }),
            }),
          ]),
        }),
      ],
    });

    let toolResolution: unknown;
    codex.emit("request", {
      request: {
        id: 2,
        method: "item/tool/call",
        params: {
          threadId: "thread-home",
          namespace: "workspace",
          tool: "create_document",
          callId: "create-document-1",
          arguments: {
            name: "Microplastics Essay Outline",
            context: handoffContext,
          },
        },
      },
      resolve(value) {
        toolResolution = value;
      },
      reject() {
        throw new Error("The typed workspace tool should resolve.");
      },
    } satisfies CodexServerRequestResponder);
    await vi.waitFor(() => expect(toolResolution).toBeDefined());
    await expect(
      stat(join(root, "documents", "Microplastics Essay Outline.docx")),
    ).resolves.toBeDefined();

    const homeSnapshot = await service.getSnapshot("workspace-1", scope);
    expect(
      homeSnapshot.events.some(
        ({ event }) =>
          event.type === "document.created" &&
          event.handoff.path ===
            "documents/Microplastics Essay Outline.docx",
      ),
    ).toBe(true);

    codex.emit("notification", {
      method: "turn/completed",
      params: {
        threadId: "thread-home",
        turn: { id: "turn-home", status: "completed" },
      },
    });
    await vi.waitFor(() =>
      expect(
        codex.requests.filter((request) => request.method === "turn/start"),
      ).toHaveLength(2),
    );

    const documentTurns = codex.requests.filter(
      (request) => request.method === "turn/start",
    );
    expect(documentTurns[1]?.params).toMatchObject({
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly" },
    });
    const documentSnapshot = await service.getSnapshot("workspace-1", {
      kind: "document",
      path: "documents/Microplastics Essay Outline.docx",
    });
    expect(documentSnapshot.activeRun?.userText).toBe(handoffContext);
  });

  it("lets Codex create a page and continues the original request in its scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "heydesk-home-page-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".heydesk"));
    await mkdir(join(root, "pages"));
    await mkdir(join(root, "documents"));
    const workspaces = {
      getById: async () => ({
        id: "workspace-1",
        name: "Workspace",
        path: root,
        lastOpenedAt: new Date(0).toISOString(),
      }),
    };
    const codex = new FakeCodex();
    const service = new AssistantService(
      codex as unknown as CodexAppServer,
      workspaces,
    );
    const scope = {
      kind: "home" as const,
      sessionId: "019c88e4-8b7d-758f-81fd-6cc47c1d90b9",
    };
    const handoffContext =
      "Create a reusable marketing-site brief with audience, positioning, page structure, calls to action, and launch criteria.";

    await service.startRun("workspace-1", "run-home", "Create a marketing page.", {
      scope,
    });
    const homeThread = codex.requests.find(
      (request) => request.method === "thread/start",
    );
    expect(homeThread?.params).toMatchObject({
      dynamicTools: [
        expect.objectContaining({
          name: "workspace",
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "create_page",
              inputSchema: expect.objectContaining({
                required: ["name", "context"],
              }),
            }),
          ]),
        }),
      ],
    });

    let toolResolution: unknown;
    codex.emit("request", {
      request: {
        id: 3,
        method: "item/tool/call",
        params: {
          threadId: "thread-home",
          namespace: "workspace",
          tool: "create_page",
          callId: "create-page-1",
          arguments: {
            name: "Marketing Site Brief",
            context: handoffContext,
          },
        },
      },
      resolve(value) {
        toolResolution = value;
      },
      reject() {
        throw new Error("The typed workspace tool should resolve.");
      },
    } satisfies CodexServerRequestResponder);
    await vi.waitFor(() => expect(toolResolution).toBeDefined());
    await expect(
      stat(join(root, "pages", "Marketing Site Brief.md")),
    ).resolves.toBeDefined();

    const homeSnapshot = await service.getSnapshot("workspace-1", scope);
    expect(
      homeSnapshot.events.some(
        ({ event }) =>
          event.type === "page.created" &&
          event.handoff.path === "pages/Marketing Site Brief.md",
      ),
    ).toBe(true);

    codex.emit("notification", {
      method: "turn/completed",
      params: {
        threadId: "thread-home",
        turn: { id: "turn-home", status: "completed" },
      },
    });
    await vi.waitFor(() =>
      expect(
        codex.requests.filter((request) => request.method === "turn/start"),
      ).toHaveLength(2),
    );

    const pageSnapshot = await service.getSnapshot("workspace-1", {
      kind: "page",
      path: "pages/Marketing Site Brief.md",
    });
    expect(pageSnapshot.activeRun?.userText).toBe(handoffContext);
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
      const count = this.requests.filter(
        (request) => request.method === "thread/start",
      ).length;
      return {
        thread: { id: count === 1 ? "thread-home" : `thread-${count}` },
        model: "gpt-5.6-luna",
      };
    }
    if (method === "turn/start") {
      const count = this.requests.filter(
        (request) => request.method === "turn/start",
      ).length;
      return { turn: { id: count === 1 ? "turn-home" : `turn-${count}` } };
    }
    return {};
  }
}
