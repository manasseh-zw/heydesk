import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";

import {
  projectAssistantEvent,
  projectSnapshot,
} from "./assistant-agui-projector";
import {
  assistantInteractionResponseSchema,
  documentToolResponseSchema,
  loginIdSchema,
  startAssistantRunSchema,
} from "./assistant.schemas";
import {
  AssistantConflictError,
  AssistantNotFoundError,
  type AssistantService,
  AssistantUnavailableError,
  assistantService,
} from "./assistant.service";
import type { AssistantScope, SequencedAssistantEvent } from "./assistant.types";
import { WorkspaceNotFoundError } from "../workspace/workspace.service";

export function createAssistantRoutes(service: AssistantService): Hono {
  const assistantRoutes = new Hono();

  assistantRoutes.get("/assistant/readiness", async (c) =>
    c.json(await service.getReadiness()),
  );

  assistantRoutes.get("/assistant/models", async (c) => {
    try {
      return c.json(await service.getModels());
    } catch (error) {
      return mapAssistantError(c, error);
    }
  });

  assistantRoutes.post("/assistant/auth/login", async (c) =>
    c.json(await service.startLogin(), 201),
  );

  assistantRoutes.post("/assistant/auth/login/:loginId/cancel", async (c) => {
    const params = loginIdSchema.safeParse(c.req.param());
    if (!params.success)
      return c.json({ error: "Invalid login session." }, 400);
    await service.cancelLogin(params.data.loginId);
    return c.json({ ok: true });
  });

  assistantRoutes.get("/workspaces/:workspaceId/assistant", async (c) => {
    try {
      return c.json(
        await service.getSnapshot(
          c.req.param("workspaceId"),
          scopeFromQuery(
            c.req.query("scope"),
            c.req.query("path"),
            c.req.query("sessionId"),
          ),
        ),
      );
    } catch (error) {
      return mapAssistantError(c, error);
    }
  });

  assistantRoutes.get(
    "/workspaces/:workspaceId/assistant/events",
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      const scope = scopeFromQuery(
        c.req.query("scope"),
        c.req.query("path"),
        c.req.query("sessionId"),
      );
      const afterSequence = Math.max(
        parseEventId(c.req.header("Last-Event-ID")),
        parseEventId(c.req.query("after")),
      );

      return streamSSE(c, async (stream) => {
        let writeChain = Promise.resolve();
        let lastSentSequence = afterSequence;
        let bootstrapping = true;
        const buffered: SequencedAssistantEvent[] = [];
        const enqueue = (event: SequencedAssistantEvent) => {
          if (event.sequence <= lastSentSequence) return;
          if (bootstrapping) {
            buffered.push(event);
            return;
          }
          lastSentSequence = event.sequence;
          writeChain = writeChain.then(async () => {
            const chunks = projectAssistantEvent(event.event);
            for (const [index, chunk] of chunks.entries()) {
              await stream.writeSSE({
                id: `${event.sequence}:${index}`,
                data: JSON.stringify(chunk),
              });
            }
          });
        };

        const unsubscribe = service.subscribe(workspaceId, enqueue, scope);
        try {
          const snapshot = await service.getSnapshot(workspaceId, scope);
          const replay = await service.getEvents(workspaceId, afterSequence, scope);
          if (
            afterSequence > 0 &&
            replay.length > 0 &&
            replay[0]!.sequence > afterSequence + 1
          ) {
            await stream.writeSSE({
              id: `${snapshot.lastSequence}:0`,
              data: JSON.stringify(projectSnapshot(snapshot)),
            });
            lastSentSequence = snapshot.lastSequence;
          } else if (afterSequence === 0 && snapshot.events.length > 0) {
            await stream.writeSSE({
              id: `${snapshot.lastSequence}:0`,
              data: JSON.stringify(projectSnapshot(snapshot)),
            });
            lastSentSequence = snapshot.lastSequence;
          }
          bootstrapping = false;
          if (afterSequence > 0) {
            for (const event of replay) enqueue(event);
          }
          for (const event of buffered) enqueue(event);
          await writeChain;

          const heartbeat = setInterval(() => {
            writeChain = writeChain.then(() =>
              stream.writeSSE({ event: "heartbeat", data: "{}" }),
            );
          }, 15_000);

          await new Promise<void>((resolve) => {
            stream.onAbort(resolve);
          });
          clearInterval(heartbeat);
          await writeChain.catch(() => undefined);
        } catch (error) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              message:
                error instanceof Error
                  ? error.message
                  : "Assistant stream failed.",
            }),
          });
        } finally {
          unsubscribe();
        }
      });
    },
  );

  assistantRoutes.post("/workspaces/:workspaceId/assistant/runs", async (c) => {
    const input = startAssistantRunSchema.safeParse(await readJson(c.req.raw));
    if (!input.success)
      return c.json(
        { error: input.error.issues[0]?.message ?? "Invalid run." },
        400,
      );
    try {
      return c.json(
        await service.startRun(
          c.req.param("workspaceId"),
          input.data.runId,
          input.data.message,
          {
            ...(input.data.context ? { context: input.data.context } : {}),
            ...(input.data.preferences
              ? { preferences: input.data.preferences }
              : {}),
            ...(input.data.scope ? { scope: input.data.scope } : {}),
          },
        ),
        201,
      );
    } catch (error) {
      return mapAssistantError(c, error);
    }
  });

  assistantRoutes.post(
    "/workspaces/:workspaceId/assistant/runs/:runId/interrupt",
    async (c) => {
      try {
        await service.interruptRun(
          c.req.param("workspaceId"),
          c.req.param("runId"),
        );
        return c.json({ ok: true });
      } catch (error) {
        return mapAssistantError(c, error);
      }
    },
  );

  assistantRoutes.post(
    "/workspaces/:workspaceId/assistant/tool-calls/:callId/claim",
    async (c) => {
      try {
        await service.claimDocumentTool(
          c.req.param("workspaceId"),
          c.req.param("callId"),
        );
        return c.json({ ok: true });
      } catch (error) {
        return mapAssistantError(c, error);
      }
    },
  );

  assistantRoutes.post(
    "/workspaces/:workspaceId/assistant/tool-calls/:callId/respond",
    async (c) => {
      const input = documentToolResponseSchema.safeParse(await readJson(c.req.raw));
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "Invalid document action result." }, 400);
      }
      try {
        await service.respondToDocumentTool(
          c.req.param("workspaceId"),
          c.req.param("callId"),
          input.data,
        );
        return c.json({ ok: true });
      } catch (error) {
        return mapAssistantError(c, error);
      }
    },
  );

  assistantRoutes.post(
    "/workspaces/:workspaceId/assistant/interactions/:interactionId/respond",
    async (c) => {
      const input = assistantInteractionResponseSchema.safeParse(
        await readJson(c.req.raw),
      );
      if (!input.success) {
        return c.json(
          { error: input.error.issues[0]?.message ?? "Invalid response." },
          400,
        );
      }
      try {
        await service.respondToInteraction(
          c.req.param("workspaceId"),
          c.req.param("interactionId"),
          input.data,
        );
        return c.json({ ok: true });
      } catch (error) {
        return mapAssistantError(c, error);
      }
    },
  );

  return assistantRoutes;
}

function scopeFromQuery(
  scope?: string,
  path?: string,
  sessionId?: string,
): AssistantScope {
  if (!scope || scope === "workspace") return { kind: "workspace" };
  if (scope === "home" && sessionId && isUuid(sessionId)) {
    return { kind: "home", sessionId };
  }
  if (
    (scope === "page" || scope === "document") &&
    path &&
    !path.startsWith("/") &&
    !path.split("/").includes("..")
  ) {
    return scope === "page" ? { kind: "page", path } : { kind: "document", path };
  }
  throw new AssistantConflictError("That assistant scope is not valid.");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export const assistantRoutes = createAssistantRoutes(assistantService);

function parseEventId(value?: string): number {
  if (!value) return 0;
  const sequence = Number.parseInt(value.split(":")[0] ?? "0", 10);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function mapAssistantError(c: Context, error: unknown) {
  if (error instanceof AssistantUnavailableError) {
    return c.json({ error: error.message, readiness: error.readiness }, 503);
  }
  if (error instanceof AssistantConflictError)
    return c.json({ error: error.message }, 409);
  if (
    error instanceof AssistantNotFoundError ||
    error instanceof WorkspaceNotFoundError
  ) {
    return c.json({ error: error.message }, 404);
  }
  throw error;
}
