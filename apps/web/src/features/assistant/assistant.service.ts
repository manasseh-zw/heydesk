import { env } from "@heydesk/env/web";
import type { UIMessage } from "@tanstack/ai";

import type {
  AssistantConversationSnapshot,
  AssistantInteraction,
  AssistantReadiness,
  AssistantSnapshot,
} from "./assistant.types";

export async function getAssistantReadiness(): Promise<AssistantReadiness> {
  return request("/api/assistant/readiness");
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

function snapshotToMessages(snapshot: AssistantSnapshot): UIMessage[] {
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
    const textById = new Map<string, string>();
    const thinkingById = new Map<string, string>();
    for (const { event } of events) {
      if (
        event.type === "message.delta" &&
        typeof event.messageId === "string"
      ) {
        textById.set(
          event.messageId,
          `${textById.get(event.messageId) ?? ""}${typeof event.delta === "string" ? event.delta : ""}`,
        );
      }
      if (
        event.type === "message.completed" &&
        typeof event.messageId === "string"
      ) {
        const text = typeof event.text === "string" ? event.text : "";
        if (!textById.has(event.messageId)) textById.set(event.messageId, text);
      }
      if (
        event.type === "reasoning.summary" &&
        typeof event.messageId === "string"
      ) {
        thinkingById.set(
          event.messageId,
          `${thinkingById.get(event.messageId) ?? ""}${typeof event.delta === "string" ? event.delta : ""}`,
        );
      }
    }
    const parts: UIMessage["parts"] = [
      ...[...thinkingById.values()]
        .filter(Boolean)
        .map((content) => ({ type: "thinking" as const, content })),
      ...[...textById.values()]
        .filter(Boolean)
        .map((content) => ({ type: "text" as const, content })),
    ];
    if (parts.length > 0) {
      messages.push({
        id: `${run.id}:assistant`,
        role: "assistant",
        createdAt: new Date(run.completedAt ?? run.createdAt),
        parts,
      });
    }
  }
  return messages;
}
