import type { MessagePart } from "@tanstack/ai";
import { useEffect, useState } from "react";

import { Markdown } from "@/components/ai/markdown";
import { MessageText } from "@/components/ai/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai/reasoning";
type RenderAssistantPartProps = {
  part: MessagePart;
  outgoing?: boolean;
  isStreaming?: boolean;
};

export function RenderAssistantPart({
  part,
  outgoing,
  isStreaming = false,
}: RenderAssistantPartProps) {
  switch (part.type) {
    case "text":
      return (
        <MessageText variant={outgoing ? "bubble" : "plain"}>
          {outgoing ? part.content : <Markdown>{part.content}</Markdown>}
        </MessageText>
      );
    case "thinking":
      return part.content.trim() ? (
        <AssistantReasoning
          content={part.content}
          isStreaming={isStreaming}
        />
      ) : null;
    default:
      return null;
  }
}

function AssistantReasoning({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(isStreaming);
  useEffect(() => setOpen(isStreaming), [isStreaming]);

  return (
    <Reasoning onOpenChange={setOpen} open={open}>
      <ReasoningTrigger>
        {isStreaming ? "Summarizing reasoning" : "Reasoning summary"}
      </ReasoningTrigger>
      <ReasoningContent>
        <Markdown>{content}</Markdown>
      </ReasoningContent>
    </Reasoning>
  );
}
