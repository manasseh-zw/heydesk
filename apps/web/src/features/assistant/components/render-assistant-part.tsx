import type { MessagePart } from "@tanstack/ai";
import { BotIcon, CheckCircle2Icon, WrenchIcon } from "lucide-react";

import { Markdown } from "@/components/ai/markdown";
import { MessageText } from "@/components/ai/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai/reasoning";
import {
  Tool,
  ToolArgument,
  ToolBlock,
  ToolContent,
  ToolIcon,
  ToolLabel,
  ToolName,
  ToolTrigger,
} from "@/components/ai/tool";

type RenderAssistantPartProps = {
  part: MessagePart;
  outgoing?: boolean;
};

export function RenderAssistantPart({
  part,
  outgoing,
}: RenderAssistantPartProps) {
  switch (part.type) {
    case "text":
      return (
        <MessageText variant={outgoing ? "bubble" : "plain"}>
          {outgoing ? part.content : <Markdown>{part.content}</Markdown>}
        </MessageText>
      );
    case "thinking":
      return (
        <Reasoning>
          <ReasoningTrigger>Reasoning summary</ReasoningTrigger>
          <ReasoningContent>
            <Markdown>{part.content}</Markdown>
          </ReasoningContent>
        </Reasoning>
      );
    case "tool-call":
      return (
        <Tool state={mapToolState(part.state)}>
          <ToolTrigger>
            <ToolIcon>
              <WrenchIcon />
            </ToolIcon>
            <ToolName>{friendlyToolName(part.name)}</ToolName>
            <ToolLabel>{toolLabel(part.state)}</ToolLabel>
          </ToolTrigger>
          <ToolContent>
            <ToolArgument
              state={
                part.state === "input-streaming" ? "streaming" : "complete"
              }
              value={part.arguments}
            />
          </ToolContent>
        </Tool>
      );
    case "tool-result":
      return (
        <Tool state={part.state === "error" ? "error" : "success"}>
          <ToolTrigger>
            <ToolIcon>
              {part.state === "error" ? <BotIcon /> : <CheckCircle2Icon />}
            </ToolIcon>
            <ToolName>Result</ToolName>
          </ToolTrigger>
          <ToolContent>
            <ToolBlock>
              {typeof part.content === "string"
                ? part.content
                : JSON.stringify(part.content, null, 2)}
            </ToolBlock>
          </ToolContent>
        </Tool>
      );
    default:
      return null;
  }
}

function mapToolState(
  state: Extract<MessagePart, { type: "tool-call" }>["state"],
) {
  if (state === "error") return "error" as const;
  if (state === "complete") return "success" as const;
  if (state === "approval-requested") return "approval" as const;
  return "running" as const;
}

function friendlyToolName(name: string): string {
  return name.replace(/^heydesk\./, "").replaceAll("-", " ");
}

function toolLabel(
  state: Extract<MessagePart, { type: "tool-call" }>["state"],
): string {
  if (state === "complete") return "Completed";
  if (state === "approval-requested") return "Needs review";
  if (state === "error") return "Failed";
  return "Working";
}
