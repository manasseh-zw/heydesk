import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";

import {
  projectAssistantEvent,
  projectSnapshot,
} from "./assistant-agui-projector";
import {
  assistantInteractionResponseSchema,
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
import type { SequencedAssistantEvent } from "./assistant.types";
import { WorkspaceNotFoundError } from "../workspace/workspace.service";

export function createAssistantRoutes(service: AssistantService): Hono {
  const assistantRoutes = new Hono();

  assistantRoutes.get("/assistant/readiness", async (c) =>
    c.json(await service.getReadiness()),
  );

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
      return c.json(await service.getSnapshot(c.req.param("workspaceId")));
    } catch (error) {
      return mapAssistantError(c, error);
    }
  });

  assistantRoutes.get(
    "/workspaces/:workspaceId/assistant/events",
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
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

        const unsubscribe = service.subscribe(workspaceId, enqueue);
        try {
          const snapshot = await service.getSnapshot(workspaceId);
          const replay = await service.getEvents(workspaceId, afterSequence);
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
