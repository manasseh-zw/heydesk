export type AssistantReadiness =
  | { status: "starting" }
  | { status: "codex-missing"; message: string }
  | { status: "unauthenticated"; message: string }
  | { status: "model-unavailable"; model: string; message: string }
  | { status: "ready"; model: string; account?: { email?: string } }
  | { status: "error"; recoverable: boolean; message: string };

export type AssistantRunStatus =
  | "starting"
  | "running"
  | "waiting-for-user"
  | "completed"
  | "failed"
  | "interrupted";

export type AssistantRun = {
  id: string;
  workspaceId: string;
  threadId: string;
  turnId?: string;
  status: AssistantRunStatus;
  userText: string;
  scope: AssistantScope;
  context?: AssistantRunContext;
  preferences?: AssistantRunPreferences;
  createdAt: string;
  completedAt?: string;
};

export type AssistantScope =
  | { kind: "workspace" }
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

export type AssistantPlanStep = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
};

export type AssistantActivity = {
  id: string;
  runId: string;
  kind:
    | "command"
    | "file-change"
    | "mcp"
    | "dynamic-tool"
    | "web-search"
    | "sub-agent"
    | "other";
  title: string;
  status: "running" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
};

export type AssistantFileChange = {
  path: string;
  kind: "add" | "update" | "delete" | "move" | "unknown";
  diff?: string;
};

export type AssistantInteraction = {
  id: string;
  runId: string;
  kind: "command-approval" | "file-approval" | "permissions" | "user-input";
  title: string;
  description?: string;
  options?: Array<{ id: string; label: string }>;
  questions?: Array<{
    id: string;
    question: string;
    options?: Array<{ label: string; description?: string }>;
  }>;
  expiresAt: string;
};

export type AssistantArtifact = {
  id: string;
  runId: string;
  path: string;
  kind: "page" | "document";
};

export type AssistantDocumentToolCall = {
  callId: string;
  runId: string;
  tool: string;
  arguments: Record<string, unknown>;
  expiresAt: string;
};

export type AssistantError = {
  code: string;
  message: string;
  recoverable: boolean;
};

export type AssistantEvent =
  | { type: "readiness.changed"; readiness: AssistantReadiness }
  | { type: "run.started"; run: AssistantRun }
  | { type: "run.status"; runId: string; status: AssistantRunStatus }
  | { type: "message.started"; messageId: string }
  | { type: "message.delta"; messageId: string; delta: string }
  | { type: "message.completed"; messageId: string; text: string }
  | { type: "reasoning.started"; messageId: string }
  | { type: "reasoning.summary"; messageId: string; delta: string }
  | { type: "reasoning.completed"; messageId: string }
  | { type: "plan.updated"; steps: AssistantPlanStep[] }
  | { type: "activity.started"; activity: AssistantActivity }
  | { type: "activity.progress"; activityId: string; delta: string }
  | { type: "activity.completed"; activity: AssistantActivity }
  | { type: "draft.diff.updated"; files: AssistantFileChange[] }
  | { type: "interaction.requested"; interaction: AssistantInteraction }
  | { type: "interaction.resolved"; interactionId: string }
  | { type: "document-tool.requested"; call: AssistantDocumentToolCall }
  | { type: "document-tool.resolved"; callId: string }
  | { type: "artifact.committed"; artifact: AssistantArtifact }
  | { type: "run.completed"; run: AssistantRun }
  | { type: "run.failed"; runId: string; error: AssistantError };

export type SequencedAssistantEvent = {
  sequence: number;
  runId: string;
  workspaceId: string;
  createdAt: string;
  event: AssistantEvent;
};

export type AssistantSnapshot = {
  workspaceId: string;
  scope: AssistantScope;
  activeRun: AssistantRun | null;
  recentRuns: AssistantRun[];
  events: SequencedAssistantEvent[];
  lastSequence: number;
};
