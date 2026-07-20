import type { StreamChunk } from "@tanstack/ai";
import { EventType } from "@ag-ui/core";

import type { AssistantEvent, AssistantRun } from "./assistant.types";

export function projectAssistantEvent(event: AssistantEvent): StreamChunk[] {
  switch (event.type) {
    case "run.started":
      return [
        {
          type: EventType.RUN_STARTED,
          threadId: event.run.threadId,
          runId: event.run.id,
          timestamp: Date.now(),
        },
        custom("heydesk:run-snapshot", event.run),
      ];
    case "message.started":
      return [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: event.messageId,
          role: "assistant",
        },
      ];
    case "message.delta":
      return [
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: event.messageId,
          delta: event.delta,
        },
      ];
    case "message.completed":
      return [{ type: EventType.TEXT_MESSAGE_END, messageId: event.messageId }];
    case "reasoning.started":
      return [
        {
          type: EventType.REASONING_MESSAGE_START,
          messageId: event.messageId,
          role: "reasoning",
        },
      ];
    case "reasoning.summary":
      return [
        {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: event.messageId,
          delta: event.delta,
        },
      ];
    case "reasoning.completed":
      return [
        { type: EventType.REASONING_MESSAGE_END, messageId: event.messageId },
      ];
    case "activity.started":
      return [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: event.activity.id,
          toolName: activityToolName(event.activity),
          toolCallName: activityToolName(event.activity),
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: event.activity.id,
          delta: JSON.stringify(
            event.activity.input ?? { title: event.activity.title },
          ),
        },
      ];
    case "activity.completed":
      return [
        { type: EventType.TOOL_CALL_END, toolCallId: event.activity.id },
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${event.activity.id}:result`,
          toolCallId: event.activity.id,
          content: JSON.stringify(
            event.activity.output ?? { status: event.activity.status },
          ),
          role: "tool",
        },
      ];
    case "run.completed":
      return [
        runFinished(event.run),
        custom("heydesk:run-snapshot", event.run),
      ];
    case "run.failed":
      return [
        {
          type: EventType.RUN_ERROR,
          message: event.error.message,
          code: event.error.code,
          runId: event.runId,
        } as StreamChunk,
        custom("heydesk:run-snapshot", {
          runId: event.runId,
          status: "failed",
        }),
      ];
    case "readiness.changed":
      return [custom("heydesk:readiness", event.readiness)];
    case "plan.updated":
      return [custom("heydesk:plan", event.steps)];
    case "activity.progress":
      return [custom("heydesk:activity-progress", event)];
    case "draft.diff.updated":
      return [custom("heydesk:file-diff", event.files)];
    case "interaction.requested":
      return [custom("heydesk:interaction-requested", event.interaction)];
    case "interaction.resolved":
      return [custom("heydesk:interaction-resolved", event)];
    case "document-tool.requested":
      return [custom("heydesk:document-tool-call", event.call)];
    case "document-tool.resolved":
      return [custom("heydesk:document-tool-resolved", event)];
    case "document.created":
      return [custom("heydesk:document-created", event.handoff)];
    case "page.created":
      return [custom("heydesk:page-created", event.handoff)];
    case "content.committed":
      return [custom("heydesk:content-committed", event.content)];
    case "artifact.committed":
      return [custom("heydesk:artifact-committed", event.artifact)];
    case "run.status":
      return [custom("heydesk:run-snapshot", event)];
  }
}

function activityToolName(
  activity: Extract<AssistantEvent, { type: "activity.started" }>['activity'],
): string {
  const input = asRecord(activity.input);
  const tool = stringValue(input.tool);
  const namespace = stringValue(input.namespace);
  if (tool) return `heydesk.${namespace ?? activity.kind}.${tool}`;
  return `heydesk.${activity.kind}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function projectSnapshot(snapshot: unknown): StreamChunk {
  return custom("heydesk:run-snapshot", snapshot);
}

function custom(name: string, value: unknown): StreamChunk {
  return { type: EventType.CUSTOM, name, value } as StreamChunk;
}

function runFinished(run: AssistantRun): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    threadId: run.threadId,
    runId: run.id,
    result: { status: run.status },
  };
}
