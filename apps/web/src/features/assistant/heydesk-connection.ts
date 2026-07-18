import type { ModelMessage, StreamChunk, UIMessage } from "@tanstack/ai";
import type {
  RunAgentInputContext,
  SubscribeConnectionAdapter,
} from "@tanstack/ai-client";

import { assistantApiUrl, request } from "./assistant.service";
import type {
  AssistantRunContext,
  AssistantRunPreferences,
  AssistantScope,
} from "./assistant.types";

export type HeydeskConnection = SubscribeConnectionAdapter;

export function createHeydeskConnection(
  workspaceId: string,
  getRunOptions: () => {
    context?: AssistantRunContext;
    preferences?: AssistantRunPreferences;
  } = () => ({}),
  scope: AssistantScope = { kind: "workspace" },
): HeydeskConnection {
  let activeRunId: string | null = null;

  return {
    subscribe(abortSignal) {
      return createEventStream(workspaceId, scope, abortSignal);
    },
    async send(messages, _data, abortSignal, runContext) {
      const runId = requireRunId(runContext);
      const message = extractNewestUserText(messages);
      activeRunId = runId;
      const interrupt = () => {
        if (activeRunId !== runId) return;
        void request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/assistant/runs/${encodeURIComponent(runId)}/interrupt`,
          { method: "POST" },
        ).catch(() => undefined);
      };
      abortSignal?.addEventListener("abort", interrupt, { once: true });
      try {
        const options = getRunOptions();
        await request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/assistant/runs`,
          {
            method: "POST",
            body: JSON.stringify({
              runId,
              message,
              ...(scope.kind === "document" ? { scope } : {}),
              ...options,
            }),
            signal: abortSignal,
          },
        );
      } finally {
        if (abortSignal?.aborted) interrupt();
      }
    },
  };
}

async function* createEventStream(
  workspaceId: string,
  scope: AssistantScope,
  abortSignal?: AbortSignal,
): AsyncIterable<StreamChunk> {
  const scopeKey = scope.kind === "document" ? `document:${scope.path}` : "workspace";
  const storageKey =
    scope.kind === "document"
      ? `heydesk:assistant:last-event:${workspaceId}:${scopeKey}`
      : `heydesk:assistant:last-event:${workspaceId}`;
  const lastEventId = sessionStorage.getItem(storageKey);
  const after = lastEventId?.split(":")[0];
  const search = new URLSearchParams();
  if (after) search.set("after", after);
  if (scope.kind === "document") {
    search.set("scope", "document");
    search.set("path", scope.path);
  }
  const query = search.size > 0 ? `?${search}` : "";
  const url = assistantApiUrl(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/assistant/events${query}`,
  );
  const source = new EventSource(url);
  const queue: StreamChunk[] = [];
  let wake: (() => void) | null = null;
  let finished = false;

  const finish = () => {
    finished = true;
    source.close();
    wake?.();
  };
  abortSignal?.addEventListener("abort", finish, { once: true });
  source.onmessage = (event) => {
    try {
      const chunk = JSON.parse(event.data) as StreamChunk;
      if (event.lastEventId)
        sessionStorage.setItem(storageKey, event.lastEventId);
      queue.push(chunk);
      wake?.();
      wake = null;
    } catch {
      // Ignore malformed transport frames; the server will replay from the last valid ID.
    }
  };

  try {
    while (!finished) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      while (queue.length > 0) yield queue.shift()!;
    }
  } finally {
    source.close();
    abortSignal?.removeEventListener("abort", finish);
  }
}

function requireRunId(context?: RunAgentInputContext): string {
  if (!context?.runId) throw new Error("TanStack AI did not provide a run ID.");
  return context.runId;
}

function extractNewestUserText(
  messages: Array<UIMessage> | Array<ModelMessage>,
): string {
  const message = [...messages]
    .reverse()
    .find((candidate) => candidate.role === "user");
  if (!message) throw new Error("Heydesk needs a user message to start a run.");
  if ("parts" in message) {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.content)
      .join("\n")
      .trim();
    if (text) return text;
  } else if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  throw new Error("This Heydesk slice supports text messages only.");
}
