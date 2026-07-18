import type { UIMessage } from "@tanstack/ai";

export type AssistantReadiness =
  | { status: "starting" }
  | { status: "codex-missing"; message: string }
  | { status: "unauthenticated"; message: string }
  | { status: "model-unavailable"; model: string; message: string }
  | { status: "ready"; model: string; account?: { email?: string } }
  | { status: "error"; recoverable: boolean; message: string };

export type AssistantRun = {
  id: string;
  workspaceId: string;
  threadId: string;
  turnId?: string;
  status:
    | "starting"
    | "running"
    | "waiting-for-user"
    | "completed"
    | "failed"
    | "interrupted";
  userText: string;
  createdAt: string;
  completedAt?: string;
};

export type AssistantInteraction = {
  id: string;
  runId: string;
  kind: "command-approval" | "file-approval" | "permissions" | "user-input";
  title: string;
  description?: string;
  questions?: Array<{
    id: string;
    question: string;
    options?: Array<{ label: string; description?: string }>;
  }>;
  expiresAt: string;
};

export type AssistantPlanStep = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
};

export type CanonicalEvent = {
  sequence: number;
  runId: string;
  workspaceId: string;
  createdAt: string;
  event: Record<string, unknown> & { type: string };
};

export type AssistantSnapshot = {
  workspaceId: string;
  activeRun: AssistantRun | null;
  recentRuns: AssistantRun[];
  events: CanonicalEvent[];
  lastSequence: number;
};

export type AssistantClientState = {
  readiness?: AssistantReadiness;
  activeRun: AssistantRun | null;
  interactions: AssistantInteraction[];
  plan: AssistantPlanStep[];
  fileDiffs: unknown[];
  artifacts: unknown[];
  error?: { code?: string; message: string };
};

export type AssistantConversationSnapshot = AssistantSnapshot & {
  messages: UIMessage[];
};
