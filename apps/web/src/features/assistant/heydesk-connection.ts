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

export type HeydeskConnection = SubscribeConnectionAdapter & {
  interruptActiveRun: () => Promise<void>;
};

export function createHeydeskConnection(
  workspaceId: string,
  getRunOptions: () => {
    context?: AssistantRunContext;
    preferences?: AssistantRunPreferences;
  } = () => ({}),
  scope: AssistantScope = { kind: "workspace" },
  getReplayAfterSequence: () => number | undefined = () => undefined,
): HeydeskConnection {
  let activeRunId: string | null = null;

  return {
    subscribe(abortSignal) {
      return createEventStream(
        workspaceId,
        scope,
        abortSignal,
        getReplayAfterSequence(),
      );
    },
    async send(messages, _data, _abortSignal, runContext) {
      const runId = requireRunId(runContext);
      const message = extractNewestUserText(messages);
      activeRunId = runId;
      const options = getRunOptions();
      await request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/assistant/runs`,
        {
          method: "POST",
          body: JSON.stringify({
            runId,
            message,
            ...(scope.kind === "workspace" ? {} : { scope }),
            ...options,
          }),
        },
      );
    },
    async interruptActiveRun() {
      if (!activeRunId) return;
      const runId = activeRunId;
      await request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/assistant/runs/${encodeURIComponent(runId)}/interrupt`,
        { method: "POST" },
      );
    },
  };
}

async function* createEventStream(
  workspaceId: string,
  scope: AssistantScope,
  abortSignal?: AbortSignal,
  replayAfterSequence?: number,
): AsyncIterable<StreamChunk> {
  const scopeKey = assistantScopeKey(scope);
  const storageKey =
    scope.kind === "workspace"
      ? `heydesk:assistant:last-event:${workspaceId}`
      : `heydesk:assistant:last-event:${workspaceId}:${scopeKey}`;
  const lastEventId = sessionStorage.getItem(storageKey);
  const after =
    replayAfterSequence === undefined
      ? lastEventId?.split(":")[0]
      : String(replayAfterSequence);
  const search = new URLSearchParams();
  if (after && after !== "0") search.set("after", after);
  if (scope.kind !== "workspace") {
    search.set("scope", scope.kind);
  }
  if (scope.kind === "home") {
    search.set("sessionId", scope.sessionId);
  }
  if (scope.kind === "page" || scope.kind === "document") {
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

function assistantScopeKey(scope: AssistantScope): string {
  if (scope.kind === "home") return `home:${scope.sessionId}`;
  if (scope.kind === "page" || scope.kind === "document") {
    return `${scope.kind}:${scope.path}`;
  }
  return "workspace";
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
