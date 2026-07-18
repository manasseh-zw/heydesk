import { env } from "@heydesk/env/web";
import type { UIMessage } from "@tanstack/ai";

import type {
  AssistantConversationSnapshot,
  AssistantInteraction,
  AssistantModel,
  AssistantReadiness,
  AssistantSnapshot,
} from "./assistant.types";

export async function getAssistantReadiness(): Promise<AssistantReadiness> {
  return request("/api/assistant/readiness");
}

export async function getAssistantModels(): Promise<AssistantModel[]> {
  return request("/api/assistant/models");
}

export async function startAssistantLogin(): Promise<{
  loginId: string;
  authUrl: string;
}> {
  return request("/api/assistant/auth/login", { method: "POST" });
}

export async function getAssistantSnapshot(
  workspaceId: string,
): Promise<AssistantConversationSnapshot> {
  const snapshot = await request<AssistantSnapshot>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/assistant`,
  );
  return { ...snapshot, messages: snapshotToMessages(snapshot) };
}

export async function respondToAssistantInteraction(
  workspaceId: string,
  interaction: AssistantInteraction,
  response: { approved?: boolean; answers?: Record<string, string[]> },
): Promise<void> {
  await request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/assistant/interactions/${encodeURIComponent(interaction.id)}/respond`,
    { method: "POST", body: JSON.stringify(response) },
  );
}

export function assistantApiUrl(path: string): string {
  return `${env.VITE_SERVER_URL}${path}`;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(assistantApiUrl(path), {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : "Heydesk could not complete that assistant request.";
    throw new Error(message);
  }
  return result as T;
}

export function snapshotToMessages(snapshot: AssistantSnapshot): UIMessage[] {
  const messages: UIMessage[] = [];
  const runs = [...snapshot.recentRuns].reverse();
  for (const run of runs) {
    messages.push({
      id: `${run.id}:user`,
      role: "user",
      createdAt: new Date(run.createdAt),
      parts: [{ type: "text", content: run.userText }],
    });
    const events = snapshot.events.filter((event) => event.runId === run.id);
    const parts: UIMessage["parts"] = [];
    const textById = new Map<
      string,
      Extract<UIMessage["parts"][number], { type: "text" }>
    >();
    const thinkingById = new Map<
      string,
      Extract<UIMessage["parts"][number], { type: "thinking" }>
    >();
    const toolsById = new Map<
      string,
      Extract<UIMessage["parts"][number], { type: "tool-call" }>
    >();

    const ensureText = (messageId: string) => {
      let part = textById.get(messageId);
      if (!part) {
        part = { type: "text", content: "" };
        textById.set(messageId, part);
        parts.push(part);
      }
      return part;
    };
    const ensureThinking = (messageId: string) => {
      let part = thinkingById.get(messageId);
      if (!part) {
        part = { type: "thinking", content: "" };
        thinkingById.set(messageId, part);
        parts.push(part);
      }
      return part;
    };

    for (const { event } of events) {
      if (
        event.type === "message.started" &&
        typeof event.messageId === "string"
      ) {
        ensureText(event.messageId);
      }
      if (
        event.type === "message.delta" &&
        typeof event.messageId === "string"
      ) {
        const part = ensureText(event.messageId);
        part.content += typeof event.delta === "string" ? event.delta : "";
      }
      if (
        event.type === "message.completed" &&
        typeof event.messageId === "string"
      ) {
        const text = typeof event.text === "string" ? event.text : "";
        const part = ensureText(event.messageId);
        if (!part.content) part.content = text;
      }
      if (
        event.type === "reasoning.started" &&
        typeof event.messageId === "string"
      ) {
        ensureThinking(event.messageId);
      }
      if (
        event.type === "reasoning.summary" &&
        typeof event.messageId === "string"
      ) {
        const part = ensureThinking(event.messageId);
        part.content += typeof event.delta === "string" ? event.delta : "";
      }
      if (event.type === "activity.started") {
        const activity = asRecord(event.activity);
        const id = recordString(activity, "id");
        if (!id) continue;
        const kind = recordString(activity, "kind") ?? "other";
        const input = activity.input ?? {
          title: recordString(activity, "title"),
        };
        const part = {
          type: "tool-call" as const,
          id,
          name: `heydesk.${kind}`,
          arguments: JSON.stringify(input),
          input,
          state: "input-complete" as const,
        };
        toolsById.set(id, part);
        parts.push(part);
      }
      if (event.type === "activity.completed") {
        const activity = asRecord(event.activity);
        const id = recordString(activity, "id");
        if (!id) continue;
        const kind = recordString(activity, "kind") ?? "other";
        const status = recordString(activity, "status");
        const failed = status === "failed";
        let tool = toolsById.get(id);
        if (!tool) {
          const input = activity.input ?? {
            title: recordString(activity, "title"),
          };
          tool = {
            type: "tool-call",
            id,
            name: `heydesk.${kind}`,
            arguments: JSON.stringify(input),
            input,
            state: failed ? "error" : "complete",
          };
          toolsById.set(id, tool);
          parts.push(tool);
        } else {
          tool.state = failed ? "error" : "complete";
        }
        parts.push({
          type: "tool-result",
          toolCallId: id,
          content: JSON.stringify(activity.output ?? { status }),
          state: failed ? "error" : "complete",
          ...(failed ? { error: "This workspace action failed." } : {}),
        });
      }
    }
    const visibleParts = parts.filter(
      (part) =>
        (part.type !== "text" && part.type !== "thinking") || !!part.content,
    );
    if (visibleParts.length > 0) {
      messages.push({
        id: `${run.id}:assistant`,
        role: "assistant",
        createdAt: new Date(run.completedAt ?? run.createdAt),
        parts: visibleParts,
      });
    }
  }
  return messages;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function recordString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}
