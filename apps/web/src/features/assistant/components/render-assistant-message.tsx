import type { MessagePart } from "@tanstack/ai";
import { useEffect, useState } from "react";
import {
  FilePenLineIcon,
  FolderSearch2Icon,
  GlobeIcon,
  PlugIcon,
  TerminalIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";

import {
  Action,
  ActionContent,
  ActionIcon,
  ActionLabel,
  ActionTrigger,
} from "@/components/ai/action";
import { Chip } from "@/components/ai/chip";
import { ThinkingIndicator } from "@heydesk/ui/components/thinking-indicator";
import {
  parseActivityArguments,
  presentAssistantActivity,
} from "../assistant-activity-presentation";
import { RenderAssistantPart } from "./render-assistant-part";

type RenderAssistantMessageProps = {
  activityProgress?: Record<string, string>;
  isStreaming?: boolean;
  outgoing?: boolean;
  parts: MessagePart[];
};

export function RenderAssistantMessage({
  activityProgress = {},
  isStreaming = false,
  outgoing = false,
  parts,
}: RenderAssistantMessageProps) {
  if (outgoing) {
    return parts.map((part, index) => (
      <RenderAssistantPart key={index} outgoing part={part} />
    ));
  }

  return (
    <AssistantTimeline
      activityProgress={activityProgress}
      isStreaming={isStreaming}
      parts={parts}
    />
  );
}

type ToolCallPart = Extract<MessagePart, { type: "tool-call" }>;
type ToolResultPart = Extract<MessagePart, { type: "tool-result" }>;

function AssistantTimeline({
  activityProgress,
  isStreaming,
  parts,
}: {
  activityProgress: Record<string, string>;
  isStreaming: boolean;
  parts: MessagePart[];
}) {
  const results = new Map(
    parts
      .filter((part): part is ToolResultPart => part.type === "tool-result")
      .map((part) => [part.toolCallId, part]),
  );
  const showWorking = useShowWorkingIndicator(parts, isStreaming);

  return (
    <div className="flex min-w-0 flex-col gap-2.5" data-slot="assistant-timeline">
      {parts.map((part, index) => {
        if (part.type === "tool-result") return null;
        if (part.type === "text" || part.type === "thinking") {
          return (
            <RenderAssistantPart
              isStreaming={isStreaming && index === parts.length - 1}
              key={`${part.type}-${index}`}
              part={part}
            />
          );
        }
        if (part.type !== "tool-call") return null;
        return (
          <AgentAction
            call={part}
            key={part.id}
            progress={activityProgress[part.id]}
            result={results.get(part.id)}
          />
        );
      })}
      {showWorking && <ThinkingIndicator className="px-0 py-1" />}
    </div>
  );
}

// A run can remain busy for several seconds between streamed deltas. Waiting a
// beat avoids flashing the indicator between ordinary tokens while ensuring a
// quiet tool or reasoning interval never looks like the response has finished.
function useShowWorkingIndicator(parts: MessagePart[], isStreaming: boolean) {
  const [show, setShow] = useState(false);
  const activityKey = parts
    .map((part) => {
      if (part.type === "text" || part.type === "thinking") {
        return `${part.type}:${part.content.length}`;
      }
      if (part.type === "tool-call") return `call:${part.id}:${part.state}`;
      if (part.type === "tool-result") return `result:${part.toolCallId}:${part.state}`;
      return part.type;
    })
    .join("|");

  useEffect(() => {
    if (!isStreaming) {
      setShow(false);
      return;
    }
    setShow(false);
    const timeout = window.setTimeout(() => setShow(true), 450);
    return () => window.clearTimeout(timeout);
  }, [activityKey, isStreaming]);

  return show;
}

function AgentAction({
  call,
  progress,
  result,
}: {
  call: ToolCallPart;
  progress?: string;
  result?: ToolResultPart;
}) {
  const failed = call.state === "error" || result?.state === "error";
  const presentation = presentAssistantActivity(call.name, call.arguments);
  return (
    <Action defaultOpen={false}>
      <ActionTrigger>
        <ActionIcon>{toolIcon(call.name, failed)}</ActionIcon>
        <ActionLabel>{presentation.label}</ActionLabel>
        {presentation.target && <Chip size="sm">{presentation.target}</Chip>}
      </ActionTrigger>
      <ActionContent>
        {presentation.shellCommand ? (
          <p className="text-xs">
            {failed
              ? result?.error ?? "This workspace action could not be completed."
              : progress
                ? "Codex reviewed the requested workspace context."
                : "Workspace review completed."}
          </p>
        ) : (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-elevated p-3 font-mono text-xs">
            {formatActionDetails(call.arguments, result, progress)}
          </pre>
        )}
      </ActionContent>
    </Action>
  );
}

function toolIcon(name: string, failed: boolean) {
  if (failed) return <XCircleIcon />;
  const normalized = name.toLowerCase();
  if (
    normalized.includes("change") ||
    normalized.includes("format") ||
    normalized.includes("style") ||
    normalized.includes("append") ||
    normalized.includes("file") ||
    normalized.includes("patch")
  )
    return <FilePenLineIcon />;
  if (normalized.includes("search") && normalized.includes("web"))
    return <GlobeIcon />;
  if (
    normalized.includes("search") ||
    normalized.includes("find") ||
    normalized.includes("read")
  )
    return <FolderSearch2Icon />;
  if (normalized.includes("command") || normalized.includes("exec"))
    return <TerminalIcon />;
  if (normalized.includes("mcp")) return <PlugIcon />;
  return <WrenchIcon />;
}

function formatActionDetails(
  argumentsValue: string,
  result?: ToolResultPart,
  progress?: string,
): string {
  const sections: string[] = [];
  const argumentsRecord = parseActivityArguments(argumentsValue);
  if (Object.keys(argumentsRecord).length > 0) {
    sections.push(JSON.stringify(argumentsRecord, null, 2));
  } else if (argumentsValue) {
    sections.push(argumentsValue);
  }
  if (progress) sections.push(progress);
  if (result) {
    const content =
      typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content, null, 2);
    sections.push(result.error ?? content);
  }
  return sections.join("\n\n") || "No additional details.";
}
