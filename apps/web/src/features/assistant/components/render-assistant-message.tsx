import type { MessagePart } from "@tanstack/ai";
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
import {
  AgentRun,
  AgentRunContent,
  AgentRunHeader,
  AgentRunMeta,
  AgentRunStep,
  AgentRunTitle,
} from "@/components/ai/agent-run";
import { Chip } from "@/components/ai/chip";
import { Status } from "@/components/ai/status";
import { RenderAssistantPart } from "./render-assistant-part";

type RenderAssistantMessageProps = {
  isStreaming?: boolean;
  outgoing?: boolean;
  parts: MessagePart[];
};

export function RenderAssistantMessage({
  isStreaming = false,
  outgoing = false,
  parts,
}: RenderAssistantMessageProps) {
  if (outgoing) {
    return parts.map((part, index) => (
      <RenderAssistantPart key={index} outgoing part={part} />
    ));
  }

  const actionParts = parts.filter(isActionPart);
  let renderedAgentRun = false;

  return parts.map((part, index) => {
    if (isActionPart(part)) {
      if (renderedAgentRun) return null;
      renderedAgentRun = true;
      return <AssistantAgentRun key="agent-run" parts={actionParts} />;
    }
    return (
      <RenderAssistantPart
        isStreaming={isStreaming && index === parts.length - 1}
        key={index}
        part={part}
      />
    );
  });
}

type ActionPart = Extract<MessagePart, { type: "tool-call" | "tool-result" }>;

function AssistantAgentRun({ parts }: { parts: ActionPart[] }) {
  const calls = parts.filter(
    (part): part is Extract<MessagePart, { type: "tool-call" }> =>
      part.type === "tool-call",
  );
  const results = new Map(
    parts
      .filter(
        (part): part is Extract<MessagePart, { type: "tool-result" }> =>
          part.type === "tool-result",
      )
      .map((part) => [part.toolCallId, part]),
  );
  const failed =
    calls.some((part) => part.state === "error") ||
    [...results.values()].some((part) => part.state === "error");
  const running = calls.some(
    (part) =>
      part.state !== "complete" &&
      part.state !== "error" &&
      part.state !== "approval-requested",
  );
  const state = failed ? "failed" : running ? "running" : "completed";

  return (
    <AgentRun defaultOpen={running} state={state}>
      <AgentRunHeader>
        <AgentRunTitle>Workspace activity</AgentRunTitle>
        <AgentRunMeta>
          <span>
            {calls.length} {calls.length === 1 ? "action" : "actions"}
          </span>
          <Status
            pulse={running}
            size="sm"
            state={failed ? "error" : running ? "inflight" : "active"}
          >
            {failed ? "Failed" : running ? "Working" : "Completed"}
          </Status>
        </AgentRunMeta>
      </AgentRunHeader>
      <AgentRunContent>
        {calls.map((call) => (
          <AgentRunStep key={call.id}>
            <Action>
              <ActionTrigger>
                <ActionIcon>{toolIcon(call.name, failed)}</ActionIcon>
                <ActionLabel>{friendlyToolName(call.name)}</ActionLabel>
                {extractTarget(call.arguments) && (
                  <Chip size="sm">{extractTarget(call.arguments)}</Chip>
                )}
              </ActionTrigger>
              <ActionContent>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-elevated p-3 font-mono text-xs">
                  {formatActionDetails(call.arguments, results.get(call.id))}
                </pre>
              </ActionContent>
            </Action>
          </AgentRunStep>
        ))}
      </AgentRunContent>
    </AgentRun>
  );
}

function isActionPart(part: MessagePart): part is ActionPart {
  return part.type === "tool-call" || part.type === "tool-result";
}

function friendlyToolName(name: string): string {
  return name
    .replace(/^heydesk[.:]/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toolIcon(name: string, failed: boolean) {
  if (failed) return <XCircleIcon />;
  const normalized = name.toLowerCase();
  if (normalized.includes("file") || normalized.includes("patch"))
    return <FilePenLineIcon />;
  if (normalized.includes("search") && normalized.includes("web"))
    return <GlobeIcon />;
  if (normalized.includes("search") || normalized.includes("read"))
    return <FolderSearch2Icon />;
  if (normalized.includes("command") || normalized.includes("exec"))
    return <TerminalIcon />;
  if (normalized.includes("mcp")) return <PlugIcon />;
  return failed ? <XCircleIcon /> : <WrenchIcon />;
}

function extractTarget(argumentsValue: string): string | undefined {
  try {
    const value: unknown = JSON.parse(argumentsValue);
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    for (const key of ["path", "file", "target", "command", "query"]) {
      if (typeof record[key] === "string") return truncate(record[key], 48);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function formatActionDetails(
  argumentsValue: string,
  result?: Extract<MessagePart, { type: "tool-result" }>,
): string {
  const sections: string[] = [];
  if (argumentsValue) {
    try {
      sections.push(JSON.stringify(JSON.parse(argumentsValue), null, 2));
    } catch {
      sections.push(argumentsValue);
    }
  }
  if (result) {
    const content =
      typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content, null, 2);
    sections.push(result.error ?? content);
  }
  return sections.join("\n\n") || "No additional details.";
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
