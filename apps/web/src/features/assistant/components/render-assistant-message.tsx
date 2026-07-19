import type { MessagePart } from "@tanstack/ai";
import { useEffect, useRef, useState } from "react";
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
  AgentRunText,
  AgentRunTitle,
} from "@/components/ai/agent-run";
import { Chip } from "@/components/ai/chip";
import { Markdown } from "@/components/ai/markdown";
import { Status } from "@/components/ai/status";
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

  if (!parts.some((part) => part.type === "tool-call")) {
    return parts.map((part, index) => (
      <RenderAssistantPart
        isStreaming={isStreaming && index === parts.length - 1}
        key={index}
        part={part}
      />
    ));
  }

  return (
    <AssistantAgentRun
      activityProgress={activityProgress}
      isStreaming={isStreaming}
      parts={parts}
    />
  );
}

type ToolCallPart = Extract<MessagePart, { type: "tool-call" }>;
type ToolResultPart = Extract<MessagePart, { type: "tool-result" }>;

function AssistantAgentRun({
  activityProgress,
  isStreaming,
  parts,
}: {
  activityProgress: Record<string, string>;
  isStreaming: boolean;
  parts: MessagePart[];
}) {
  const calls = parts.filter(
    (part): part is ToolCallPart => part.type === "tool-call",
  );
  const results = new Map(
    parts
      .filter((part): part is ToolResultPart => part.type === "tool-result")
      .map((part) => [part.toolCallId, part]),
  );
  const failed =
    calls.some((part) => part.state === "error") ||
    [...results.values()].some((part) => part.state === "error");
  const hasPendingCall = calls.some(
    (part) =>
      part.state !== "complete" &&
      part.state !== "error" &&
      part.state !== "approval-requested",
  );
  const running = !failed && (isStreaming || hasPendingCall);
  const state = failed ? "failed" : running ? "running" : "completed";
  const visibleSteps = parts.filter(isVisibleRunStep);
  const elapsed = useElapsedSeconds(running);
  const title = agentRunTitle(calls, state);

  return (
    <AgentRun defaultOpen state={state}>
      <AgentRunHeader>
        <AgentRunTitle>{title}</AgentRunTitle>
        <Status
          pulse={running}
          size="sm"
          state={failed ? "error" : running ? "inflight" : "active"}
        >
          {failed ? "Failed" : running ? "Running" : "Completed"}
        </Status>
        <AgentRunMeta>
          <span className="tabular-nums">
            {visibleSteps.length} {visibleSteps.length === 1 ? "step" : "steps"}
          </span>
          {elapsed !== null && (
            <>
              <span>·</span>
              <span className="tabular-nums">{elapsed.toFixed(1)}s</span>
            </>
          )}
        </AgentRunMeta>
      </AgentRunHeader>
      <AgentRunContent>
        {parts.map((part, index) => {
          if (part.type === "tool-result") return null;
          if (part.type === "text" && part.content) {
            return (
              <AgentRunStep key={`text-${index}`}>
                <AgentRunText>
                  <Markdown>{part.content}</Markdown>
                </AgentRunText>
              </AgentRunStep>
            );
          }
          if (part.type === "thinking" && part.content) {
            return (
              <AgentRunStep key={`thinking-${index}`}>
                <RenderAssistantPart
                  isStreaming={isStreaming && index === parts.length - 1}
                  part={part}
                />
              </AgentRunStep>
            );
          }
          if (part.type !== "tool-call") return null;
          return (
            <AgentRunStep key={part.id}>
              <AgentAction
                call={part}
                progress={activityProgress[part.id]}
                result={results.get(part.id)}
              />
            </AgentRunStep>
          );
        })}
      </AgentRunContent>
    </AgentRun>
  );
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

function isVisibleRunStep(part: MessagePart): boolean {
  if (part.type === "tool-call") return true;
  if (part.type === "text" || part.type === "thinking") return Boolean(part.content);
  return false;
}

function useElapsedSeconds(running: boolean): number | null {
  const startedAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (!running) {
      if (startedAtRef.current !== null) {
        setElapsed((performance.now() - startedAtRef.current) / 1_000);
      }
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = performance.now();
    const update = () => {
      if (startedAtRef.current !== null) {
        setElapsed((performance.now() - startedAtRef.current) / 1_000);
      }
    };
    update();
    const interval = window.setInterval(update, 100);
    return () => window.clearInterval(interval);
  }, [running]);

  return elapsed;
}

function agentRunTitle(
  calls: ToolCallPart[],
  state: "running" | "completed" | "failed",
): string {
  const names = calls.map((call) => call.name.toLowerCase());
  const documentEdit = names.some((name) =>
    ["suggest_change", "apply_formatting", "set_paragraph_style", "append_paragraphs"].some(
      (tool) => name.includes(tool),
    ),
  );
  const documentRead = names.some(
    (name) => name.includes("document") || name.includes("find_text"),
  );
  if (state === "failed") return "Document work failed";
  if (documentEdit) return state === "running" ? "Editing document" : "Edited document";
  if (documentRead) return state === "running" ? "Reviewing document" : "Reviewed document";
  return state === "running" ? "Working in workspace" : "Completed workspace work";
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
