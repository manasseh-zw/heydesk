import { Fragment } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
} from "lucide-react";

import { Button } from "@heydesk/ui/components/button";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import {
  Exception,
  ExceptionHeader,
  ExceptionMessage,
  ExceptionType,
} from "@/components/ai/exception";
import { Message, MessageContent } from "@/components/ai/message";
import { Task, TaskIcon, TaskItem, TaskLabel } from "@/components/ai/task";
import { Loader } from "@/components/ai/loader";
import {
  Reasoning,
  ReasoningTrigger,
} from "@/components/ai/reasoning";
import { HomeComposer } from "@/features/workspace/components/home-composer";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import {
  getAssistantReadiness,
  startAssistantLogin,
} from "../assistant.service";
import { useAssistantSession } from "../assistant-session";
import { AssistantInteractionCard } from "./assistant-interaction";
import { CommittedArtifactPreview } from "./committed-artifact-preview";
import { RenderAssistantMessage } from "./render-assistant-message";

type AssistantHomeProps = {
  workspace: WorkspaceSummary;
  onOpenPage: (path: string) => void;
  onSend?: (message: string) => Promise<void>;
  compactSurface?: boolean;
  disabled?: boolean;
};

export function AssistantHome({
  workspace,
  onOpenPage,
  onSend,
  compactSurface = false,
  disabled = false,
}: AssistantHomeProps) {
  const session = useAssistantSession();
  const state = session.state;
  const isRunning = session.isRunning;
  const hasMessages = session.messages.length > 0;
  const readiness = session.readiness;
  const canSend = readiness?.status === "ready" && !disabled;
  const waitingForFirstAssistantPart = session.waitingForFirstAssistantPart;
  const sendMessage = onSend ?? session.sendMessage;

  if (!hasMessages) {
    return (
      <div
        className={`flex size-full items-center justify-center ${compactSurface ? "p-4" : "p-8"}`}
      >
        <div className="flex w-full flex-col items-center">
          <HomeComposer
            compact={compactSurface}
            disabled={!canSend}
            isRunning={isRunning}
            onStop={session.stop}
            onSubmit={sendMessage}
          />
          <ReadinessNotice readiness={readiness} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex size-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className={compactSurface ? "px-4 py-5" : "px-6 py-8"}>
          <div className={`mx-auto flex w-full flex-col ${compactSurface ? "gap-4" : "max-w-3xl gap-6"}`}>
            {session.messages.map((message, messageIndex) => (
              <Fragment key={message.id}>
                <Message
                  type={message.role === "user" ? "outgoing" : "incoming"}
                >
                  <MessageContent>
                    <RenderAssistantMessage
                      isStreaming={
                        isRunning &&
                        message.role === "assistant" &&
                        messageIndex === session.messages.length - 1
                      }
                      outgoing={message.role === "user"}
                      parts={message.parts}
                    />
                  </MessageContent>
                </Message>
                {state.artifacts
                  .filter((artifact) => artifact.afterMessageId === message.id)
                  .map((artifact) => (
                    <CommittedArtifactPreview
                      kind={artifact.kind}
                      key={artifact.id}
                      onOpenPage={onOpenPage}
                      path={artifact.path}
                      workspaceId={workspace.id}
                    />
                  ))}
              </Fragment>
            ))}

            {waitingForFirstAssistantPart && (
              <Message type="incoming">
                <MessageContent>
                  <Reasoning defaultOpen>
                    <ReasoningTrigger>
                      <Loader dots variant="shimmer">Thinking</Loader>
                    </ReasoningTrigger>
                  </Reasoning>
                </MessageContent>
              </Message>
            )}

            {state.plan.length > 0 && (
              <Task>
                {state.plan.map((step) => (
                  <TaskItem key={step.id}>
                    <TaskIcon>
                      {step.status === "completed" ? (
                        <CheckCircle2Icon className="size-4" />
                      ) : step.status === "in_progress" ? (
                        <LoaderCircleIcon className="size-4 animate-spin" />
                      ) : (
                        <CircleIcon className="size-3" />
                      )}
                    </TaskIcon>
                    <TaskLabel>{step.title}</TaskLabel>
                  </TaskItem>
                ))}
              </Task>
            )}

            {state.interactions.map((interaction) => (
              <AssistantInteractionCard
                interaction={interaction}
                key={interaction.id}
                onRespond={(response) =>
                  void session.respond(interaction, response)
                }
              />
            ))}

            {state.artifacts
              .filter(
                (artifact) =>
                  !artifact.afterMessageId ||
                  !session.messages.some(
                    (message) => message.id === artifact.afterMessageId,
                  ),
              )
              .map((artifact) => (
                <CommittedArtifactPreview
                  kind={artifact.kind}
                  key={artifact.id}
                  onOpenPage={onOpenPage}
                  path={artifact.path}
                  workspaceId={workspace.id}
                />
              ))}

            {(session.error || state.error) && (
              <Exception>
                <ExceptionHeader>
                  <ExceptionType>AssistantError</ExceptionType>
                  <ExceptionMessage>
                    {session.error?.message ?? state.error?.message}
                  </ExceptionMessage>
                </ExceptionHeader>
              </Exception>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-background p-2 shadow-sm data-[at-bottom=true]:hidden" />
      </Conversation>

      <div className={`shrink-0 bg-background/95 pt-3 backdrop-blur ${compactSurface ? "px-3 pb-3" : "px-6 pb-6"}`}>
        <div className="mx-auto max-w-3xl">
          <HomeComposer
            compact
            disabled={!canSend}
            isRunning={isRunning}
            onStop={session.stop}
            onSubmit={sendMessage}
          />
          <ReadinessNotice readiness={readiness} compact />
        </div>
      </div>
    </div>
  );
}

function ReadinessNotice({
  readiness,
  compact = false,
}: {
  readiness: Awaited<ReturnType<typeof getAssistantReadiness>> | undefined;
  compact?: boolean;
}) {
  if (!readiness || readiness.status === "ready") return null;
  const login = async () => {
    const result = await startAssistantLogin();
    window.open(result.authUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <div
      className={`${compact ? "mt-2" : "-mt-4"} flex items-center gap-2 text-sm text-muted-foreground`}
    >
      <AlertTriangleIcon className="size-4" />
      <span>
        {"message" in readiness ? readiness.message : "Codex is starting."}
      </span>
      {readiness.status === "unauthenticated" && (
        <Button onClick={() => void login()} size="sm" variant="outline">
          Sign in
        </Button>
      )}
    </div>
  );
}
