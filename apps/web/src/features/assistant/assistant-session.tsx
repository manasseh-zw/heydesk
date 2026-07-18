import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useChat } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { pageKeys } from "@/features/page/page.queries";
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
} from "./assistant.types";
import { createHeydeskConnection } from "./heydesk-connection";

const emptyState: AssistantClientState = {
  activeRun: null,
  interactions: [],
  plan: [],
  fileDiffs: [],
  artifacts: [],
};

type AssistantSessionValue = {
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
}: {
  children: ReactNode;
  workspace: WorkspaceSummary;
}) {
  const queryClient = useQueryClient();
  const restoredRef = useRef(false);
  const latestMessageIdRef = useRef<string | undefined>(undefined);
  const nextRunOptionsRef = useRef<{
    context?: AssistantRunContext;
    preferences?: AssistantRunPreferences;
  }>({});
  const connection = useMemo(
    () =>
      createHeydeskConnection(workspace.id, () => {
        const value = nextRunOptionsRef.current;
        nextRunOptionsRef.current = {};
        return value;
      }),
    [workspace.id],
  );
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

  useEffect(() => {
    restoredRef.current = false;
  }, [workspace.id]);

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
      updateState((state) =>
        reduceCustomEvent(state, name, value, latestMessageIdRef.current),
      );
      if (name === "heydesk:artifact-committed") {
        void queryClient.invalidateQueries({
          queryKey: pageKeys.all(workspace.id),
        });
      }
    },
  });
  latestMessageIdRef.current = chat.messages.at(-1)?.id;

  useEffect(() => {
    const snapshot = snapshotQuery.data;
    if (!snapshot || restoredRef.current) return;
    restoredRef.current = true;
    if (chat.messages.length === 0 && snapshot.messages.length > 0) {
      chat.setMessages(snapshot.messages);
    }
    updateState((state) => restoreClientState(state, snapshot));
  }, [chat, snapshotQuery.data]);

  const state = clientStateQuery.data;
  const isRunning =
    chat.sessionGenerating || chat.isLoading || Boolean(state.activeRun);
  const waitingForFirstAssistantPart =
    isRunning && chat.messages.at(-1)?.role === "user";

  const value: AssistantSessionValue = {
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
    stop: chat.stop,
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
    if (event.type === "artifact.committed") {
      restored = upsertArtifact(restored, event.artifact, `${runId}:assistant`);
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
