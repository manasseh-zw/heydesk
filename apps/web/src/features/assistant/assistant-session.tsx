import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MessagePart, UIMessage } from "@tanstack/ai";
import { useChat } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { pageKeys } from "@/features/page/page.queries";
import { documentKeys } from "@/features/document/document.queries";
import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import { assistantKeys } from "./assistant.queries";
import {
  getAssistantReadiness,
  getAssistantSnapshot,
  respondToAssistantInteraction,
} from "./assistant.service";
import type {
  AssistantClientState,
  AssistantInteraction,
  AssistantReadiness,
  AssistantRun,
  AssistantRunContext,
  AssistantRunPreferences,
  AssistantScope,
} from "./assistant.types";
import { createHeydeskConnection } from "./heydesk-connection";

const emptyState: AssistantClientState = {
  activeRun: null,
  interactions: [],
  plan: [],
  activityProgress: {},
  fileDiffs: [],
  artifacts: [],
  documentToolCalls: [],
};

type AssistantSessionValue = {
  scope: AssistantScope;
  messages: ReturnType<typeof useChat>["messages"];
  state: AssistantClientState;
  readiness?: AssistantReadiness;
  error?: Error;
  isRunning: boolean;
  waitingForFirstAssistantPart: boolean;
  sendMessage: (
    text: string,
    options?: {
      context?: AssistantRunContext;
      preferences?: AssistantRunPreferences;
    },
  ) => Promise<void>;
  stop: () => void;
  respond: (
    interaction: AssistantInteraction,
    response: { approved?: boolean; answers?: Record<string, string[]> },
  ) => Promise<void>;
};

const AssistantSessionContext = createContext<AssistantSessionValue | null>(null);

export function AssistantSessionProvider({
  children,
  workspace,
  scope = { kind: "workspace" },
}: {
  children: ReactNode;
  workspace: WorkspaceSummary;
  scope?: AssistantScope;
}) {
  const queryClient = useQueryClient();
  const restoredRef = useRef(false);
  const replayAfterSequenceRef = useRef<number | undefined>(undefined);
  const [hydratedScopeId, setHydratedScopeId] = useState<string | null>(null);
  const latestMessageIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<UIMessage[]>([]);
  const setMessagesRef = useRef<((messages: UIMessage[]) => void) | null>(null);
  const observedRunMessageIdsRef = useRef(new Set<string>());
  const nextRunOptionsRef = useRef<{
    context?: AssistantRunContext;
    preferences?: AssistantRunPreferences;
  }>({});
  const scopeId = assistantScopeId(scope);
  const snapshotQuery = useQuery({
    queryKey: assistantKeys.scope(workspace.id, scopeId),
    queryFn: () => getAssistantSnapshot(workspace.id, scope),
    refetchOnMount: "always",
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const connection = useMemo(
    () =>
      createHeydeskConnection(
        workspace.id,
        () => {
          const value = nextRunOptionsRef.current;
          nextRunOptionsRef.current = {};
          return value;
        },
        scope,
        () => replayAfterSequenceRef.current,
      ),
    [scopeId, workspace.id],
  );
  const readinessQuery = useQuery({
    queryKey: assistantKeys.readiness(),
    queryFn: getAssistantReadiness,
    refetchInterval: (query) =>
      query.state.data?.status === "ready" ? false : 3_000,
  });
  const clientStateQuery = useQuery({
    queryKey: assistantKeys.state(workspace.id, scopeId),
    queryFn: async () => emptyState,
    initialData: emptyState,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    restoredRef.current = false;
    replayAfterSequenceRef.current = undefined;
    observedRunMessageIdsRef.current.clear();
    setHydratedScopeId(null);
  }, [scopeId, workspace.id]);

  const updateState = (
    updater: (state: AssistantClientState) => AssistantClientState,
  ) => {
    queryClient.setQueryData<AssistantClientState>(
      assistantKeys.state(workspace.id, scopeId),
      (current) => updater(current ?? emptyState),
    );
  };

  const chat = useChat({
    connection,
    id: `heydesk:${workspace.id}:${scopeId}`,
    threadId: `${workspace.id}:${scopeId}`,
    queue: "drop",
    live: hydratedScopeId === scopeId,
    initialMessages: [],
    onCustomEvent(name, value) {
      const runMessage = userMessageFromRunSnapshot(value);
      if (name === "heydesk:run-snapshot" && runMessage) {
        const current = messagesRef.current;
        const latest = current.at(-1);
        const alreadyObserved = observedRunMessageIdsRef.current.has(
          runMessage.id,
        );
        const matchesCurrentMessage =
          current.some((message) => message.id === runMessage.id) ||
          (latest?.role === "user" &&
            messageText(latest) === messageText(runMessage));
        if (!alreadyObserved && !matchesCurrentMessage) {
          const next = [...current, runMessage];
          messagesRef.current = next;
          setMessagesRef.current?.(next);
        }
        observedRunMessageIdsRef.current.add(runMessage.id);
      }
      updateState((state) =>
        reduceCustomEvent(state, name, value, latestMessageIdRef.current),
      );
      if (name === "heydesk:artifact-committed") {
        void queryClient.invalidateQueries({
          queryKey: pageKeys.all(workspace.id),
        });
        void queryClient.invalidateQueries({
          queryKey: documentKeys.all(workspace.id),
        });
      }
      if (name === "heydesk:page-created") {
        void queryClient.invalidateQueries({
          queryKey: pageKeys.all(workspace.id),
        });
      }
      if (name === "heydesk:document-created") {
        void queryClient.invalidateQueries({
          queryKey: documentKeys.all(workspace.id),
        });
      }
      if (name === "heydesk:content-committed") {
        const content = asRecord(value);
        const path = recordString(content, "path");
        const kind = recordString(content, "kind");
        if (path && kind === "page") {
          void queryClient.invalidateQueries({
            queryKey: pageKeys.detail(workspace.id, path),
          });
          void queryClient.invalidateQueries({
            queryKey: pageKeys.all(workspace.id),
          });
        }
        if (path && kind === "document") {
          void queryClient.invalidateQueries({
            queryKey: documentKeys.detail(workspace.id, path),
          });
          void queryClient.invalidateQueries({
            queryKey: documentKeys.all(workspace.id),
          });
        }
      }
    },
  });
  messagesRef.current = chat.messages;
  setMessagesRef.current = chat.setMessages;
  latestMessageIdRef.current = chat.messages.at(-1)?.id;

  useEffect(() => {
    const snapshot = snapshotQuery.data;
    if (!snapshot || snapshotQuery.isFetching || restoredRef.current) return;
    restoredRef.current = true;
    chat.setMessages(snapshot.messages);
    updateState((state) => restoreClientState(state, snapshot));
    replayAfterSequenceRef.current = snapshot.lastSequence;
    setHydratedScopeId(scopeId);
  }, [chat, scopeId, snapshotQuery.data, snapshotQuery.isFetching]);

  const state = clientStateQuery.data;
  const isRunning =
    chat.sessionGenerating || chat.isLoading || Boolean(state.activeRun);
  const latestMessage = chat.messages.at(-1);
  const waitingForFirstAssistantPart =
    isRunning &&
    (latestMessage?.role === "user" ||
      (latestMessage?.role === "assistant" &&
        !latestMessage.parts.some(isVisibleAssistantPart)));

  const value: AssistantSessionValue = {
    scope,
    messages: chat.messages,
    state,
    readiness: readinessQuery.data,
    error: chat.error,
    isRunning,
    waitingForFirstAssistantPart,
    async sendMessage(text, options = {}) {
      nextRunOptionsRef.current = options;
      try {
        await chat.sendMessage(text);
      } catch (error) {
        nextRunOptionsRef.current = {};
        throw error;
      }
    },
    stop() {
      chat.stop();
      void connection.interruptActiveRun().catch((error) => {
        updateState((current) => ({
          ...current,
          error: {
            code: "INTERRUPT_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Heydesk could not stop that run.",
          },
        }));
      });
    },
    async respond(interaction, response) {
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
    },
  };

  return (
    <AssistantSessionContext.Provider value={value}>
      {children}
    </AssistantSessionContext.Provider>
  );
}

function isVisibleAssistantPart(part: MessagePart): boolean {
  if (part.type === "text" || part.type === "thinking") {
    return Boolean(part.content.trim());
  }
  return true;
}

function userMessageFromRunSnapshot(value: unknown): UIMessage | null {
  const record = asRecord(value);
  const run = asRecord(record.activeRun ?? record);
  const id = recordString(run, "id");
  const userText = recordString(run, "userText")?.trim();
  if (!id || !userText) return null;
  const createdAt = recordString(run, "createdAt");
  return {
    id: `${id}:user`,
    role: "user",
    createdAt: createdAt ? new Date(createdAt) : new Date(),
    parts: [{ type: "text", content: userText }],
  };
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("\n")
    .trim();
}

function assistantScopeId(scope: AssistantScope): string {
  if (scope.kind === "home") return `home:${scope.sessionId}`;
  if (scope.kind === "page" || scope.kind === "document") {
    return `${scope.kind}:${scope.path}`;
  }
  return "workspace";
}

export function useAssistantSession(): AssistantSessionValue {
  const value = useContext(AssistantSessionContext);
  if (!value) {
    throw new Error("AssistantSessionProvider is missing.");
  }
  return value;
}

function reduceCustomEvent(
  state: AssistantClientState,
  name: string,
  value: unknown,
  latestMessageId?: string,
): AssistantClientState {
  if (name === "heydesk:readiness")
    return { ...state, readiness: value as AssistantClientState["readiness"] };
  if (name === "heydesk:plan")
    return {
      ...state,
      plan: Array.isArray(value) ? (value as AssistantClientState["plan"]) : [],
    };
  if (name === "heydesk:activity-progress") {
    const progress = asRecord(value);
    const activityId = recordString(progress, "activityId");
    const delta = recordString(progress, "delta");
    if (!activityId || !delta) return state;
    return {
      ...state,
      activityProgress: {
        ...state.activityProgress,
        [activityId]: `${state.activityProgress[activityId] ?? ""}${delta}`.slice(
          -12_000,
        ),
      },
    };
  }
  if (name === "heydesk:file-diff")
    return { ...state, fileDiffs: Array.isArray(value) ? value : [] };
  if (name === "heydesk:artifact-committed")
    return upsertArtifact(state, value, latestMessageId);
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
  if (name === "heydesk:document-tool-call") {
    const call = value as AssistantClientState["documentToolCalls"][number];
    return {
      ...state,
      documentToolCalls: [
        ...state.documentToolCalls.filter((item) => item.callId !== call.callId),
        call,
      ],
    };
  }
  if (name === "heydesk:document-tool-resolved") {
    const callId = recordString(value, "callId");
    return {
      ...state,
      documentToolCalls: state.documentToolCalls.filter(
        (item) => item.callId !== callId,
      ),
    };
  }
  if (name === "heydesk:document-created") {
    const handoff = asRecord(value);
    if (
      typeof handoff.sourceRunId !== "string" ||
      typeof handoff.path !== "string" ||
      typeof handoff.name !== "string" ||
      typeof handoff.revision !== "string"
    ) {
      return state;
    }
    return {
      ...state,
      documentHandoff:
        handoff as AssistantClientState["documentHandoff"],
    };
  }
  if (name === "heydesk:page-created") {
    const handoff = asRecord(value);
    if (
      typeof handoff.sourceRunId !== "string" ||
      typeof handoff.path !== "string" ||
      typeof handoff.title !== "string" ||
      typeof handoff.revision !== "string"
    ) {
      return state;
    }
    return {
      ...state,
      pageHandoff: handoff as AssistantClientState["pageHandoff"],
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
    ) {
      return { ...state, activeRun: null };
    }
    return { ...state, activeRun: run ?? state.activeRun };
  }
  return state;
}

function restoreClientState(
  state: AssistantClientState,
  snapshot: Awaited<ReturnType<typeof getAssistantSnapshot>>,
): AssistantClientState {
  let restored = { ...state, activeRun: snapshot.activeRun };
  for (const { event, runId } of snapshot.events) {
    if (event.type === "activity.progress") {
      const activityId =
        typeof event.activityId === "string" ? event.activityId : undefined;
      const delta = typeof event.delta === "string" ? event.delta : undefined;
      if (activityId && delta) {
        restored = {
          ...restored,
          activityProgress: {
            ...restored.activityProgress,
            [activityId]: `${restored.activityProgress[activityId] ?? ""}${delta}`.slice(
              -12_000,
            ),
          },
        };
      }
    }
    if (event.type === "artifact.committed") {
      restored = upsertArtifact(restored, event.artifact, `${runId}:assistant`);
    }
    if (event.type === "document-tool.requested") {
      const call = event.call as AssistantClientState["documentToolCalls"][number];
      restored = {
        ...restored,
        documentToolCalls: [
          ...restored.documentToolCalls.filter(
            (item) => item.callId !== call.callId,
          ),
          call,
        ],
      };
    }
    if (event.type === "document-tool.resolved") {
      const callId = typeof event.callId === "string" ? event.callId : undefined;
      restored = {
        ...restored,
        documentToolCalls: restored.documentToolCalls.filter(
          (item) => item.callId !== callId,
        ),
      };
    }
  }
  return restored;
}

function upsertArtifact(
  state: AssistantClientState,
  value: unknown,
  afterMessageId?: string,
): AssistantClientState {
  const artifact = asRecord(value);
  if (
    typeof artifact.id !== "string" ||
    typeof artifact.runId !== "string" ||
    typeof artifact.path !== "string" ||
    artifact.path.startsWith("/") ||
    artifact.path.split("/").some((segment) => segment === "..") ||
    (artifact.kind !== "page" && artifact.kind !== "document")
  ) {
    return state;
  }
  const previous = state.artifacts.find((item) => item.id === artifact.id);
  const next = {
    ...(artifact as AssistantClientState["artifacts"][number]),
    afterMessageId: afterMessageId ?? previous?.afterMessageId,
  };
  return {
    ...state,
    artifacts: [
      ...state.artifacts.filter((item) => item.id !== next.id),
      next,
    ],
  };
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
