import { Fragment } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  LoaderCircleIcon,
} from "lucide-react";

import { Button } from "@heydesk/ui/components/button";
import { ThinkingIndicator } from "@heydesk/ui/components/thinking-indicator";

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
import { LogoMark } from "@/components/logo";
import {
  HomeComposer,
  type ComposerContext,
} from "@/features/workspace/components/home-composer";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import type { ComposerSubmission } from "@/features/workspace/workspace-assistant-routing";
import type { AssistantRunPreferences } from "../assistant.types";
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
  onSend?: (
    message: string,
    preferences?: AssistantRunPreferences,
    submission?: ComposerSubmission,
  ) => Promise<void>;
  compactSurface?: boolean;
  composerContext?: ComposerContext;
  disabled?: boolean;
};

export function AssistantHome({
  workspace,
  onOpenPage,
  onSend,
  compactSurface = false,
  composerContext = "workspace",
  disabled = false,
}: AssistantHomeProps) {
  const session = useAssistantSession();
  const state = session.state;
  const isRunning = session.isRunning;
  const hasMessages = session.messages.length > 0;
  const readiness = session.readiness;
  const canSend = readiness?.status === "ready" && !disabled;
  const waitingForFirstAssistantPart = session.waitingForFirstAssistantPart;
  const sendMessage =
    onSend ??
    ((message: string, preferences?: AssistantRunPreferences) =>
      session.sendMessage(message, { preferences }));

  if (!hasMessages) {
    if (compactSurface && composerContext !== "workspace") {
      return (
        <div className="flex size-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <div className="-translate-y-8 flex flex-col items-center text-center">
              <div className="flex items-center gap-1.5">
                <LogoMark className="size-5 shrink-0 text-logo-mark" />
                <span className="font-brand text-lg font-light tracking-tight">
                  Heydesk
                </span>
              </div>
              <p className="mt-2 max-w-64 text-sm leading-5 text-foreground/70">
                {composerContext === "page"
                  ? "Have Codex edit and improve this page."
                  : "Have Codex improve this document."}
              </p>
            </div>
          </div>

          <div className="relative z-10 shrink-0 bg-background/90 px-3 pt-3 pb-3 backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-background/95 before:to-transparent">
            <HomeComposer
              compact
              context={composerContext}
              disabled={!canSend}
              isRunning={isRunning}
              onStop={session.stop}
              onSubmit={sendMessage}
            />
            <ReadinessNotice readiness={readiness} compact />
          </div>
        </div>
      );
    }

    return (
      <div
        className={`flex size-full items-center justify-center ${compactSurface ? "p-4" : "p-8"}`}
      >
        <div className="flex w-full flex-col items-center">
          <HomeComposer
            compact={compactSurface}
            context={composerContext}
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
                      activityProgress={state.activityProgress}
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
                  <ThinkingIndicator className="px-0" />
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

      <div
        className={`relative z-10 shrink-0 border-t border-border/40 bg-background/90 pt-3 backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-background/95 before:to-transparent ${compactSurface ? "px-3 pb-3" : "px-6 pb-5"}`}
      >
        <div className="mx-auto max-w-3xl">
          <HomeComposer
            compact
            context={composerContext}
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
