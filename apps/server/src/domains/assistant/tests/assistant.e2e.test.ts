import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CodexAppServer } from "../../../infrastructure/codex/codex-app-server";
import { createAssistantRoutes } from "../assistant.routes";
import { AssistantService } from "../assistant.service";
import type { AssistantSnapshot } from "../assistant.types";
import type { WorkspaceSummary } from "../../workspace/workspace.types";

const SHOULD_RUN = process.env.RUN_ASSISTANT_E2E === "1";
const EXPECTED_MODEL = process.env.CODEX_MODEL ?? "gpt-5.6-luna";
const EXPECTED_REPLY = "HEYDESK_CODEX_E2E_OK";

describe.skipIf(!SHOULD_RUN)("assistant backend end-to-end", () => {
  let app: Hono;
  let client: CodexAppServer;
  let workspacePath: string;
  let workspace: WorkspaceSummary;

  beforeAll(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "heydesk-assistant-e2e-"));
    await mkdir(join(workspacePath, ".heydesk"));
    workspace = {
      id: randomUUID(),
      name: "Assistant end-to-end test",
      path: workspacePath,
      lastOpenedAt: new Date().toISOString(),
    };

    client = new CodexAppServer();
    const service = new AssistantService(
      client,
      {
        getById: async (workspaceId) => {
          if (workspaceId !== workspace.id)
            throw new Error("Unknown workspace.");
          return workspace;
        },
      },
      {
        ephemeralThreads: true,
      },
    );
    app = new Hono().route("/api", createAssistantRoutes(service));
  });

  afterAll(async () => {
    await client?.stop();
    if (workspacePath)
      await rm(workspacePath, { recursive: true, force: true });
  });

  it("runs an authenticated text turn through HTTP, Codex, and SQLite", async () => {
    const readinessResponse = await app.request("/api/assistant/readiness");
    expect(readinessResponse.status).toBe(200);
    await expect(readinessResponse.json()).resolves.toMatchObject({
      status: "ready",
      model: EXPECTED_MODEL,
    });

    const runId = randomUUID();
    const runResponse = await app.request(
      `/api/workspaces/${workspace.id}/assistant/runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          message:
            `Do not inspect or modify files and do not use tools. ` +
            `Reply with exactly: ${EXPECTED_REPLY}`,
        }),
      },
    );
    expect(runResponse.status).toBe(201);

    const snapshot = await waitForCompletedSnapshot(app, workspace.id, runId);
    expect(snapshot.activeRun).toBeNull();
    expect(snapshot.recentRuns[0]).toMatchObject({
      id: runId,
      status: "completed",
    });
    expect(
      snapshot.events.some(
        ({ event }) =>
          event.type === "message.completed" &&
          event.text.trim() === EXPECTED_REPLY,
      ),
    ).toBe(true);
    expect(
      snapshot.events.some(
        ({ event }) => event.type === "run.completed" && event.run.id === runId,
      ),
    ).toBe(true);
    await expect(
      stat(join(workspacePath, ".heydesk", "heydesk.sqlite")),
    ).resolves.toMatchObject({});
  });
});

async function waitForCompletedSnapshot(
  app: Hono,
  workspaceId: string,
  runId: string,
): Promise<AssistantSnapshot> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const response = await app.request(
      `/api/workspaces/${workspaceId}/assistant`,
    );
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as AssistantSnapshot;
    const run = snapshot.recentRuns.find((candidate) => candidate.id === runId);
    if (run?.status === "completed") return snapshot;
    if (run?.status === "failed" || run?.status === "interrupted") {
      throw new Error(`Assistant end-to-end run ended with ${run.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Assistant end-to-end run did not complete within 90 seconds.",
  );
}
