import { useEffect, useMemo, useRef } from "react";
import { useChat } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { HomeComposer } from "@/features/workspace/components/home-composer";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import { assistantKeys } from "../assistant.queries";
import {
  getAssistantReadiness,
  getAssistantSnapshot,
  respondToAssistantInteraction,
  startAssistantLogin,
} from "../assistant.service";
import type {
  AssistantClientState,
  AssistantInteraction,
  AssistantRun,
} from "../assistant.types";
import { createHeydeskConnection } from "../heydesk-connection";
import { AssistantInteractionCard } from "./assistant-interaction";
import { RenderAssistantPart } from "./render-assistant-part";

type AssistantHomeProps = {
  workspace: WorkspaceSummary;
};

const emptyState: AssistantClientState = {
  activeRun: null,
  interactions: [],
  plan: [],
  fileDiffs: [],
  artifacts: [],
};

export function AssistantHome({ workspace }: AssistantHomeProps) {
  const queryClient = useQueryClient();
  const connection = useMemo(
    () => createHeydeskConnection(workspace.id),
    [workspace.id],
  );
  const restoredRef = useRef(false);
  const snapshotQuery = useQuery({
    queryKey: assistantKeys.workspace(workspace.id),
    queryFn: () => getAssistantSnapshot(workspace.id),
  });
  const readinessQuery = useQuery({
    queryKey: assistantKeys.readiness(),
    queryFn: getAssistantReadiness,
    refetchInterval: (query) =>
      query.state.data?.status === "ready" ? false : 3_000,
  });
  const clientStateQuery = useQuery({
    queryKey: assistantKeys.state(workspace.id),
    queryFn: async () => emptyState,
    initialData: emptyState,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const updateState = (
    updater: (state: AssistantClientState) => AssistantClientState,
  ) => {
    queryClient.setQueryData<AssistantClientState>(
      assistantKeys.state(workspace.id),
      (current) => updater(current ?? emptyState),
    );
  };

  const chat = useChat({
    connection,
    id: `heydesk:${workspace.id}`,
    threadId: workspace.id,
    live: true,
    initialMessages: [],
    onCustomEvent(name, value) {
      updateState((state) => reduceCustomEvent(state, name, value));
    },
  });

  useEffect(() => {
    const snapshot = snapshotQuery.data;
    if (!snapshot || restoredRef.current) return;
    restoredRef.current = true;
    if (chat.messages.length === 0 && snapshot.messages.length > 0) {
      chat.setMessages(snapshot.messages);
    }
    updateState((state) => ({ ...state, activeRun: snapshot.activeRun }));
  }, [chat, snapshotQuery.data]);

  const state = clientStateQuery.data;
  const isRunning =
    chat.sessionGenerating || chat.isLoading || !!state.activeRun;
  const hasMessages = chat.messages.length > 0;
  const readiness = readinessQuery.data;
  const canSend = readiness?.status === "ready";

  const respond = async (
    interaction: AssistantInteraction,
    response: { approved?: boolean; answers?: Record<string, string[]> },
  ) => {
    try {
      await respondToAssistantInteraction(workspace.id, interaction, response);
    } catch (error) {
      updateState((current) => ({
        ...current,
        error: {
          code: "INTERACTION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Heydesk could not send that response.",
        },
      }));
    }
  };

  if (!hasMessages) {
    return (
      <div className="flex size-full items-center justify-center p-8">
        <div className="flex w-full flex-col items-center">
          <HomeComposer
            disabled={!canSend}
            isRunning={isRunning}
            onStop={chat.stop}
            onSubmit={chat.sendMessage}
          />
          <ReadinessNotice readiness={readiness} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex size-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="px-6 py-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {chat.messages.map((message) => (
              <Message
                key={message.id}
                type={message.role === "user" ? "outgoing" : "incoming"}
              >
                <MessageContent>
                  {message.parts.map((part, index) => (
                    <RenderAssistantPart
                      key={`${message.id}:${index}`}
                      outgoing={message.role === "user"}
                      part={part}
                    />
                  ))}
                </MessageContent>
              </Message>
            ))}

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
                onRespond={(response) => void respond(interaction, response)}
              />
            ))}

            {(chat.error || state.error) && (
              <Exception>
                <ExceptionHeader>
                  <ExceptionType>AssistantError</ExceptionType>
                  <ExceptionMessage>
                    {chat.error?.message ?? state.error?.message}
                  </ExceptionMessage>
                </ExceptionHeader>
              </Exception>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-background p-2 shadow-sm data-[at-bottom=true]:hidden" />
      </Conversation>

      <div className="shrink-0 bg-background/95 px-6 pb-6 pt-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <HomeComposer
            compact
            disabled={!canSend}
            isRunning={isRunning}
            onStop={chat.stop}
            onSubmit={chat.sendMessage}
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

function reduceCustomEvent(
  state: AssistantClientState,
  name: string,
  value: unknown,
): AssistantClientState {
  if (name === "heydesk:readiness")
    return { ...state, readiness: value as AssistantClientState["readiness"] };
  if (name === "heydesk:plan")
    return {
      ...state,
      plan: Array.isArray(value) ? (value as AssistantClientState["plan"]) : [],
    };
  if (name === "heydesk:file-diff")
    return { ...state, fileDiffs: Array.isArray(value) ? value : [] };
  if (name === "heydesk:artifact-committed")
    return { ...state, artifacts: [...state.artifacts, value] };
  if (name === "heydesk:interaction-requested") {
    const interaction = value as AssistantInteraction;
    return {
      ...state,
      interactions: [
        ...state.interactions.filter((item) => item.id !== interaction.id),
        interaction,
      ],
    };
  }
  if (name === "heydesk:interaction-resolved") {
    const id = recordString(value, "interactionId");
    return {
      ...state,
      interactions: state.interactions.filter((item) => item.id !== id),
    };
  }
  if (name === "heydesk:run-snapshot") {
    const record = asRecord(value);
    const run = (record.activeRun ??
      ("workspaceId" in record && "userText" in record
        ? record
        : null)) as AssistantRun | null;
    const status = recordString(record, "status");
    if (
      status === "completed" ||
      status === "failed" ||
      status === "interrupted"
    )
      return { ...state, activeRun: null };
    return { ...state, activeRun: run ?? state.activeRun };
  }
  return state;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function recordString(value: unknown, key: string): string | undefined {
  const candidate = asRecord(value)[key];
  return typeof candidate === "string" ? candidate : undefined;
}
