export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export type JsonRpcId = string | number;

export type CodexNotification = {
  method: string;
  params?: unknown;
};

export type CodexServerRequest = CodexNotification & {
  id: JsonRpcId;
};

export type CodexServerRequestResponder = {
  request: CodexServerRequest;
  resolve: (result: unknown) => void;
  reject: (code: number, message: string, data?: unknown) => void;
};

export type CodexAccount = {
  type?: string;
  email?: string;
};

export type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  hidden: boolean;
  supportedReasoningEfforts: Array<{
    reasoningEffort: string;
    description: string;
  }>;
  defaultReasoningEffort: string;
  serviceTiers: Array<{ id: string; name: string; description: string }>;
  defaultServiceTier?: string | null;
};

export type CodexThread = { id: string };
export type CodexTurn = { id: string };

export class CodexRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "CodexRpcError";
  }
}

export class CodexProcessError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CodexProcessError";
  }
}

export class CodexMissingError extends Error {
  constructor() {
    super("Heydesk could not find a Codex executable.");
    this.name = "CodexMissingError";
  }
}
