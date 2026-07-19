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
  scope: AssistantScope;
  context?: AssistantRunContext;
  preferences?: AssistantRunPreferences;
  createdAt: string;
  completedAt?: string;
};

export type AssistantScope =
  | { kind: "workspace" }
  | { kind: "home"; sessionId: string }
  | { kind: "page"; path: string }
  | { kind: "document"; path: string };

export type AssistantRunContext =
  | { kind: "page"; path: string; expectedRevision: string }
  | { kind: "document"; path: string; expectedRevision: string };

export type AssistantRunPreferences = {
  model: string;
  effort: string;
  serviceTier?: string;
};

export type AssistantModel = {
  id: string;
  model: string;
  displayName: string;
  supportedReasoningEfforts: Array<{
    effort: string;
    description: string;
  }>;
  defaultReasoningEffort: string;
  serviceTiers: Array<{ id: string; name: string; description: string }>;
  defaultServiceTier?: string;
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

export type AssistantArtifact = {
  id: string;
  runId: string;
  path: string;
  kind: "page" | "document";
  afterMessageId?: string;
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
  scope: AssistantScope;
  activeRun: AssistantRun | null;
  recentRuns: AssistantRun[];
  events: CanonicalEvent[];
  lastSequence: number;
};

export type AssistantDocumentToolCall = {
  callId: string;
  runId: string;
  tool: string;
  arguments: Record<string, unknown>;
  expiresAt: string;
};

export type AssistantDocumentHandoff = {
  sourceRunId: string;
  path: string;
  name: string;
  revision: string;
};

export type AssistantClientState = {
  readiness?: AssistantReadiness;
  activeRun: AssistantRun | null;
  interactions: AssistantInteraction[];
  plan: AssistantPlanStep[];
  activityProgress: Record<string, string>;
  fileDiffs: unknown[];
  artifacts: AssistantArtifact[];
  documentToolCalls: AssistantDocumentToolCall[];
  documentHandoff?: AssistantDocumentHandoff;
  error?: { code?: string; message: string };
};

export type AssistantConversationSnapshot = AssistantSnapshot & {
  messages: UIMessage[];
};
