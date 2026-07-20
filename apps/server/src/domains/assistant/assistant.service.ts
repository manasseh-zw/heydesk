import { randomUUID } from "node:crypto";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

import { env } from "@heydesk/env/server";
import { getToolSchemas } from "@eigenpal/docx-editor-agents/server";
import { z } from "zod";

import { PageService } from "../page/page.service";
import { DocumentService } from "../document/document.service";
import { workspaceService } from "../workspace/workspace.service";
import { workspacePagesDirectory } from "../workspace/workspace.paths";
import type { WorkspaceService } from "../workspace/workspace.service";
import type { WorkspaceSummary } from "../workspace/workspace.types";
import {
  accountReadResponseSchema,
  codexNotificationParamsSchema,
  loginStartResponseSchema,
  modelListResponseSchema,
  threadResponseSchema,
  turnResponseSchema,
} from "../../infrastructure/codex/codex.schemas";
import {
  codexAppServer,
  type CodexAppServer,
} from "../../infrastructure/codex/codex-app-server";
import {
  CodexMissingError,
  CodexRpcError,
  type CodexModel,
  type CodexNotification,
  type CodexServerRequestResponder,
} from "../../infrastructure/codex/codex.types";
import { AssistantRepository, scopeKey } from "./assistant.repository";
import { canAutoAcceptFileChanges } from "./assistant-safety";
import type {
  AssistantActivity,
  AssistantDocumentToolCall,
  AssistantDocumentHandoff,
  AssistantEvent,
  AssistantFileChange,
  AssistantInteraction,
  AssistantModel,
  AssistantPageHandoff,
  AssistantReadiness,
  AssistantRun,
  AssistantRunContext,
  AssistantRunPreferences,
  AssistantScope,
  AssistantSnapshot,
  SequencedAssistantEvent,
} from "./assistant.types";

const INTERACTION_TIMEOUT_MS = 5 * 60_000;
const MODEL_CACHE_MS = 30_000;
const DOCUMENT_TOOL_TIMEOUT_MS = 60_000;
const DOCUMENT_TOOL_CONTRACT_VERSION = "document-tools-v6";
const PAGE_ASSISTANT_CONTRACT_VERSION = "page-filesystem-v1";
const WORKSPACE_TOOL_CONTRACT_VERSION = "workspace-tools-v3";
const WORKSPACE_CREATE_DOCUMENT_TOOL = "create_document";
const WORKSPACE_CREATE_PAGE_TOOL = "create_page";
const DOCUMENT_TOOL_NAMES = new Set([
  "read_document",
  "read_selection",
  "read_page",
  "read_pages",
  "find_text",
  "read_comments",
  "read_changes",
  "add_comment",
  "suggest_change",
  "apply_formatting",
  "apply_formatting_batch",
  "set_paragraph_style",
  "set_paragraph_styles",
  "scroll",
  "append_paragraphs",
]);
const MUTATING_DOCUMENT_TOOLS = new Set([
  "add_comment",
  "suggest_change",
  "apply_formatting",
  "apply_formatting_batch",
  "set_paragraph_style",
  "set_paragraph_styles",
  "append_paragraphs",
]);

const singleParagraphTextSchema = z
  .string()
  .max(8_000)
  .refine((value) => !/[\r\n]/.test(value), {
    message: "Tracked document changes must stay within one paragraph.",
  });
const documentParagraphIdSchema = z.string().trim().min(1).max(128);
const suggestChangeArgumentsSchema = z
  .object({
    paraId: documentParagraphIdSchema,
    search: singleParagraphTextSchema,
    replaceWith: singleParagraphTextSchema,
  })
  .strict()
  .refine(({ search }) => search.length > 0, {
    message:
      "Tracked changes must identify existing text. Use append_paragraphs for new content.",
  });
const underlineStyleSchema = z.enum([
  "single",
  "words",
  "double",
  "thick",
  "dotted",
  "dottedHeavy",
  "dash",
  "dashedHeavy",
  "dashLong",
  "dashLongHeavy",
  "dotDash",
  "dashDotHeavy",
  "dotDotDash",
  "dashDotDotHeavy",
  "wave",
  "wavyHeavy",
  "wavyDouble",
  "none",
]);
const highlightColorSchema = z.enum([
  "black",
  "blue",
  "cyan",
  "darkBlue",
  "darkCyan",
  "darkGray",
  "darkGreen",
  "darkMagenta",
  "darkRed",
  "darkYellow",
  "green",
  "lightGray",
  "magenta",
  "red",
  "white",
  "yellow",
  "none",
]);
const formattingMarksSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z
      .union([
        z.boolean(),
        z.object({ style: underlineStyleSchema }).strict(),
      ])
      .optional(),
    strike: z.boolean().optional(),
    color: z
      .object({
        rgb: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional(),
        themeColor: z.string().trim().min(1).max(64).optional(),
      })
      .strict()
      .refine(({ rgb, themeColor }) => Boolean(rgb || themeColor), {
        message: "A font color needs an RGB or theme color value.",
      })
      .optional(),
    highlight: highlightColorSchema.optional(),
    fontSize: z.number().finite().min(1).max(400).optional(),
    fontFamily: z
      .object({
        ascii: z.string().trim().min(1).max(128).optional(),
        hAnsi: z.string().trim().min(1).max(128).optional(),
      })
      .strict()
      .refine(({ ascii, hAnsi }) => Boolean(ascii || hAnsi), {
        message: "A font family needs an ASCII or high-ANSI name.",
      })
      .optional(),
  })
  .strict();
const nonEmptyFormattingMarksSchema = formattingMarksSchema.refine(
  (marks) => Object.keys(marks).length > 0,
  {
    message: "Choose at least one formatting change.",
  },
);
const applyFormattingArgumentsSchema = z
  .object({
    paraId: documentParagraphIdSchema,
    search: singleParagraphTextSchema.optional(),
    marks: nonEmptyFormattingMarksSchema,
  })
  .strict();
const setParagraphStyleArgumentsSchema = z
  .object({
    paraId: documentParagraphIdSchema,
    styleId: z.string().trim().min(1).max(128),
  })
  .strict();
const applyFormattingBatchArgumentsSchema = z
  .object({
    operations: z.array(applyFormattingArgumentsSchema).min(1).max(100),
  })
  .strict();
const setParagraphStylesArgumentsSchema = z
  .object({
    operations: z.array(setParagraphStyleArgumentsSchema).min(1).max(100),
  })
  .strict();
const appendParagraphRunSchema = z
  .object({
    text: z.string().max(4_000),
    marks: formattingMarksSchema.optional(),
  })
  .strict();
const appendParagraphSchema = z
  .object({
    runs: z.array(appendParagraphRunSchema).min(1).max(30),
    styleId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .refine(
    ({ runs }) => runs.reduce((length, run) => length + run.text.length, 0) <= 8_000,
    { message: "A document paragraph cannot exceed 8,000 characters." },
  );
const appendParagraphsArgumentsSchema = z
  .object({
    paragraphs: z.array(appendParagraphSchema).min(1).max(100),
  })
  .strict()
  .refine(
    ({ paragraphs }) =>
      paragraphs.reduce(
        (total, paragraph) =>
          total + paragraph.runs.reduce((length, run) => length + run.text.length, 0),
        0,
      ) <= 50_000,
    { message: "One document structure operation cannot exceed 50,000 characters." },
  )
  .refine(
    ({ paragraphs }) =>
      paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.length > 0)),
    { message: "Add at least one paragraph with text." },
  );

const appendParagraphsDynamicTool = {
  type: "function" as const,
  name: "append_paragraphs",
  description:
    "Append real paragraphs to the end of the document in one atomic edit. Use this for new document structure or multi-paragraph content. Each paragraph contains ordered text runs, optional direct character formatting, and an optional Word paragraph style such as Title, Subtitle, Heading1 through Heading6, Quote, or Normal. This is a direct edit, not a tracked change.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["paragraphs"],
    properties: {
      paragraphs: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["runs"],
          properties: {
            styleId: { type: "string" },
            runs: {
              type: "array",
              minItems: 1,
              maxItems: 30,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text"],
                properties: {
                  text: { type: "string" },
                  marks: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      bold: { type: "boolean" },
                      italic: { type: "boolean" },
                      underline: { type: "boolean" },
                      strike: { type: "boolean" },
                      color: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          rgb: { type: "string" },
                          themeColor: { type: "string" },
                        },
                      },
                      highlight: { type: "string" },
                      fontSize: { type: "number" },
                      fontFamily: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          ascii: { type: "string" },
                          hAnsi: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

function formattingMarksJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      bold: { type: "boolean" },
      italic: { type: "boolean" },
      underline: {
        anyOf: [
          { type: "boolean" },
          {
            type: "object",
            additionalProperties: false,
            required: ["style"],
            properties: { style: { type: "string" } },
          },
        ],
      },
      strike: { type: "boolean" },
      color: {
        type: "object",
        additionalProperties: false,
        properties: {
          rgb: { type: "string" },
          themeColor: { type: "string" },
        },
      },
      highlight: { type: "string" },
      fontSize: { type: "number" },
      fontFamily: {
        type: "object",
        additionalProperties: false,
        properties: {
          ascii: { type: "string" },
          hAnsi: { type: "string" },
        },
      },
    },
  };
}

const applyFormattingBatchDynamicTool = {
  type: "function" as const,
  name: "apply_formatting_batch",
  description:
    "Apply bounded character-formatting operations to several existing paragraphs in one tool call and one save. Prefer this over repeated apply_formatting calls when a request affects multiple paragraphs.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["operations"],
    properties: {
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["paraId", "marks"],
          properties: {
            paraId: { type: "string" },
            search: { type: "string" },
            marks: formattingMarksJsonSchema(),
          },
        },
      },
    },
  },
};

const setParagraphStylesDynamicTool = {
  type: "function" as const,
  name: "set_paragraph_styles",
  description:
    "Apply paragraph styles to several existing paragraphs in one tool call and one save. Prefer this over repeated set_paragraph_style calls.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["operations"],
    properties: {
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["paraId", "styleId"],
          properties: {
            paraId: { type: "string" },
            styleId: { type: "string" },
          },
        },
      },
    },
  },
};

type AssistantEventListener = (event: SequencedAssistantEvent) => void;

type AssistantServiceOptions = {
  ephemeralThreads?: boolean;
};

type ActiveRun = {
  workspace: WorkspaceSummary;
  repository: AssistantRepository;
  run: AssistantRun;
  startedMessages: Set<string>;
  startedReasoning: Set<string>;
  items: Map<string, Record<string, unknown>>;
};

type PendingInteraction = {
  interaction: AssistantInteraction;
  responder: CodexServerRequestResponder;
  method: string;
  params: Record<string, unknown>;
  timeout: NodeJS.Timeout;
  active: ActiveRun;
};

type PendingDocumentTool = {
  call: AssistantDocumentToolCall;
  responder: CodexServerRequestResponder;
  active: ActiveRun;
  claimed: boolean;
  requestedAt: number;
  timeout: NodeJS.Timeout;
};

type PendingDocumentHandoff = {
  handoff: AssistantDocumentHandoff;
  context: string;
  preferences: AssistantRunPreferences;
};

type PendingPageHandoff = {
  handoff: AssistantPageHandoff;
  context: string;
  preferences: AssistantRunPreferences;
};

export class AssistantService {
  private readonly repositories = new Map<string, AssistantRepository>();
  private readonly reconciledWorkspaces = new Set<string>();
  private readonly activeByThread = new Map<string, ActiveRun>();
  private readonly activeByRun = new Map<string, ActiveRun>();
  private readonly listeners = new Map<string, Set<AssistantEventListener>>();
  private readonly pendingInteractions = new Map<string, PendingInteraction>();
  private readonly pendingDocumentTools = new Map<string, PendingDocumentTool>();
  private readonly pendingDocumentHandoffs = new Map<
    string,
    PendingDocumentHandoff
  >();
  private readonly pendingPageHandoffs = new Map<string, PendingPageHandoff>();
  private modelCache: { expiresAt: number; models: CodexModel[] } | null = null;
  private readonly pages: PageService;
  private readonly documents: DocumentService;

  constructor(
    private readonly codex: CodexAppServer,
    private readonly workspaces: Pick<
      WorkspaceService,
      "getById"
    > = workspaceService,
    private readonly options: AssistantServiceOptions = {},
  ) {
    this.pages = new PageService(workspaces);
    this.documents = new DocumentService(workspaces);
    codex.on("notification", (notification) => {
      void this.handleNotification(notification).catch((error) => {
        console.error(
          JSON.stringify({
            source: "assistant",
            level: "error",
            message: toMessage(error),
          }),
        );
      });
    });
    codex.on("request", (request) => {
      void this.handleServerRequest(request).catch((error) => {
        request.reject(-32603, "Heydesk could not process the Codex request.");
        console.error(
          JSON.stringify({
            source: "assistant",
            level: "error",
            message: toMessage(error),
          }),
        );
      });
    });
    codex.on("exit", (error) => {
      void this.handleCodexExit(error);
    });
  }

  async getReadiness(): Promise<AssistantReadiness> {
    try {
      const account = accountReadResponseSchema.parse(
        await this.codex.request("account/read", { refreshToken: false }),
      );
      if (account.requiresOpenaiAuth && !account.account) {
        return {
          status: "unauthenticated",
          message: "Sign in to ChatGPT to use Codex in Heydesk.",
        };
      }

      const models = await this.loadModels();

      const model = models.find(
        (candidate) =>
          !candidate.hidden &&
          (candidate.model === env.CODEX_MODEL ||
            candidate.id === env.CODEX_MODEL),
      );
      if (!model) {
        return {
          status: "model-unavailable",
          model: env.CODEX_MODEL,
          message: `${env.CODEX_MODEL} is not available in this Codex installation. Update Codex or adjust CODEX_MODEL explicitly.`,
        };
      }
      return {
        status: "ready",
        model: env.CODEX_MODEL,
        ...(account.account?.email
          ? { account: { email: account.account.email } }
          : {}),
      };
    } catch (error) {
      if (error instanceof CodexMissingError) {
        return { status: "codex-missing", message: error.message };
      }
      return { status: "error", recoverable: true, message: toMessage(error) };
    }
  }

  async getModels(): Promise<AssistantModel[]> {
    return (await this.loadModels()).map((model) => ({
      id: model.id,
      model: model.model,
      displayName: model.displayName,
      supportedReasoningEfforts: model.supportedReasoningEfforts.map(
        (option) => ({
          effort: option.reasoningEffort,
          description: option.description,
        }),
      ),
      defaultReasoningEffort: model.defaultReasoningEffort,
      serviceTiers: model.serviceTiers,
      ...(model.defaultServiceTier
        ? { defaultServiceTier: model.defaultServiceTier }
        : {}),
    }));
  }

  async startLogin(): Promise<{ loginId: string; authUrl: string }> {
    const result = loginStartResponseSchema.parse(
      await this.codex.request("account/login/start", { type: "chatgpt" }),
    );
    if (result.type !== "chatgpt")
      throw new Error("Codex did not start ChatGPT sign-in.");
    return { loginId: result.loginId, authUrl: result.authUrl };
  }

  async cancelLogin(loginId: string): Promise<void> {
    await this.codex.request("account/login/cancel", { loginId });
  }

  async getSnapshot(
    workspaceId: string,
    scope: AssistantScope = { kind: "workspace" },
  ): Promise<AssistantSnapshot> {
    const { repository } = await this.getWorkspaceContext(workspaceId, scope);
    return repository.getSnapshot();
  }

  async getEvents(
    workspaceId: string,
    afterSequence = 0,
    scope: AssistantScope = { kind: "workspace" },
  ): Promise<SequencedAssistantEvent[]> {
    const { repository } = await this.getWorkspaceContext(workspaceId, scope);
    return repository.listEvents(afterSequence);
  }

  subscribe(
    workspaceId: string,
    listener: AssistantEventListener,
    scope: AssistantScope = { kind: "workspace" },
  ): () => void {
    const listenerKey = repositoryKey(workspaceId, scope);
    const listeners =
      this.listeners.get(listenerKey) ?? new Set<AssistantEventListener>();
    listeners.add(listener);
    this.listeners.set(listenerKey, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(listenerKey);
    };
  }

  async startRun(
    workspaceId: string,
    runId: string,
    userText: string,
    options: {
      context?: AssistantRunContext;
      preferences?: AssistantRunPreferences;
      scope?: AssistantScope;
    } = {},
  ): Promise<AssistantRun> {
    const readiness = await this.getReadiness();
    if (readiness.status !== "ready")
      throw new AssistantUnavailableError(readiness);

    const scope = options.scope ?? scopeForContext(options.context);
    if (
      scope.kind === "document" &&
      (options.context?.kind !== "document" || options.context.path !== scope.path)
    ) {
      throw new AssistantConflictError(
        "The document run context does not match its assistant scope.",
      );
    }
    if (
      scope.kind === "page" &&
      (options.context?.kind !== "page" || options.context.path !== scope.path)
    ) {
      throw new AssistantConflictError(
        "The page run context does not match its assistant scope.",
      );
    }
    if (scope.kind === "home" && options.context) {
      throw new AssistantConflictError(
        "A Home conversation cannot inherit page or document context.",
      );
    }
    const { workspace, repository } =
      await this.getWorkspaceContext(workspaceId, scope);
    if (options.context) {
      const current = options.context.kind === "page"
        ? await this.pages.read(workspaceId, options.context.path)
        : await this.documents.read(workspaceId, options.context.path);
      if (current.revision !== options.context.expectedRevision) {
        throw new AssistantConflictError(
          `That ${options.context.kind} changed before the assistant run started.`,
        );
      }
    }
    const preferences = await this.resolvePreferences(options.preferences);
    if (this.activeByRun.has(runId) || (await repository.getRun(runId))) {
      throw new AssistantConflictError("That assistant run already exists.");
    }

    const threadId = await this.ensureThread(workspace, repository, scope);
    const run: AssistantRun = {
      id: runId,
      workspaceId,
      threadId,
      status: "starting",
      userText,
      scope,
      ...(options.context ? { context: options.context } : {}),
      preferences,
      createdAt: new Date().toISOString(),
    };
    await repository.createRun(run);

    const active: ActiveRun = {
      workspace,
      repository,
      run,
      startedMessages: new Set(),
      startedReasoning: new Set(),
      items: new Map(),
    };
    this.activeByThread.set(threadId, active);
    this.activeByRun.set(runId, active);
    await this.publish(active, { type: "run.started", run });

    try {
      const response = turnResponseSchema.parse(
        await this.codex.request("turn/start", {
          threadId,
          input: [
            {
              type: "text",
              text: buildCodexInput(userText, workspace, options.context),
              text_elements: [],
            },
          ],
          cwd: workspace.path,
          approvalPolicy: scope.kind === "document" ? "never" : "untrusted",
          sandboxPolicy:
            scope.kind === "document"
              ? { type: "readOnly" }
              : {
                  type: "workspaceWrite",
                  writableRoots: [
                    scope.kind === "home" || scope.kind === "page"
                      ? resolve(workspace.path, workspacePagesDirectory)
                      : workspace.path,
                  ],
                  networkAccess: false,
                  excludeTmpdirEnvVar: true,
                  excludeSlashTmp: true,
                },
          model: preferences.model,
          effort: preferences.effort,
          ...(preferences.serviceTier
            ? { serviceTier: preferences.serviceTier }
            : {}),
        }),
      );
      run.turnId = response.turn.id;
      run.status = "running";
      await repository.updateRun(run);
      await this.publish(active, {
        type: "run.status",
        runId,
        status: "running",
      });
      return run;
    } catch (error) {
      await this.failRun(active, "TURN_START_FAILED", toMessage(error), true);
      throw error;
    }
  }

  private async loadModels(): Promise<CodexModel[]> {
    if (this.modelCache && this.modelCache.expiresAt > Date.now()) {
      return this.modelCache.models;
    }
    const models: CodexModel[] = [];
    let cursor: string | undefined;
    do {
      const page = modelListResponseSchema.parse(
        await this.codex.request("model/list", {
          ...(cursor ? { cursor } : {}),
          limit: 100,
          includeHidden: false,
        }),
      );
      models.push(...page.data);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    this.modelCache = { expiresAt: Date.now() + MODEL_CACHE_MS, models };
    return models;
  }

  private async resolvePreferences(
    requested?: AssistantRunPreferences,
  ): Promise<AssistantRunPreferences> {
    const models = await this.loadModels();
    const requestedModel = requested?.model ?? env.CODEX_MODEL;
    const model = models.find(
      (candidate) =>
        !candidate.hidden &&
        (candidate.id === requestedModel || candidate.model === requestedModel),
    );
    if (!model) {
      throw new AssistantConflictError(
        `${requestedModel} is not available in this Codex installation.`,
      );
    }
    const effort = requested?.effort ?? model.defaultReasoningEffort;
    if (
      model.supportedReasoningEfforts.length > 0 &&
      !model.supportedReasoningEfforts.some(
        (option) => option.reasoningEffort === effort,
      )
    ) {
      throw new AssistantConflictError(
        `${effort} reasoning is not available for ${model.displayName}.`,
      );
    }
    if (
      requested?.serviceTier &&
      !model.serviceTiers.some((tier) => tier.id === requested.serviceTier)
    ) {
      throw new AssistantConflictError(
        `${requested.serviceTier} service is not available for ${model.displayName}.`,
      );
    }
    return {
      model: model.model,
      effort,
      ...(requested?.serviceTier
        ? { serviceTier: requested.serviceTier }
        : {}),
    };
  }

  async interruptRun(workspaceId: string, runId: string): Promise<void> {
    const active = this.activeByRun.get(runId);
    if (!active || active.workspace.id !== workspaceId) {
      const { repository } = await this.getWorkspaceContext(workspaceId);
      const run = await repository.getRun(runId);
      if (!run || !run.turnId)
        throw new AssistantNotFoundError("That assistant run is not active.");
      await this.codex.request("turn/interrupt", {
        threadId: run.threadId,
        turnId: run.turnId,
      });
      return;
    }
    if (!active.run.turnId)
      throw new AssistantConflictError("The assistant run is still starting.");
    await this.codex.request("turn/interrupt", {
      threadId: active.run.threadId,
      turnId: active.run.turnId,
    });
  }

  async respondToInteraction(
    workspaceId: string,
    interactionId: string,
    response: { approved?: boolean; answers?: Record<string, string[]> },
  ): Promise<void> {
    const pending = this.pendingInteractions.get(interactionId);
    if (!pending || pending.active.workspace.id !== workspaceId) {
      throw new AssistantNotFoundError(
        "That interaction is no longer pending.",
      );
    }
    clearTimeout(pending.timeout);
    this.pendingInteractions.delete(interactionId);

    if (pending.method === "item/tool/requestUserInput") {
      pending.responder.resolve({
        answers: Object.fromEntries(
          Object.entries(response.answers ?? {}).map(([id, answers]) => [
            id,
            { answers },
          ]),
        ),
      });
    } else if (pending.method === "item/permissions/requestApproval") {
      pending.responder.resolve({
        permissions: response.approved
          ? (pending.params.permissions ?? {})
          : {},
        scope: "turn",
        strictAutoReview: true,
      });
    } else {
      pending.responder.resolve({
        decision: response.approved ? "accept" : "decline",
      });
    }

    await this.publish(pending.active, {
      type: "interaction.resolved",
      interactionId,
    });
    pending.active.run.status = "running";
    await pending.active.repository.updateRun(pending.active.run);
  }

  async claimDocumentTool(workspaceId: string, callId: string): Promise<void> {
    const pending = this.pendingDocumentTools.get(callId);
    if (!pending || pending.active.workspace.id !== workspaceId) {
      throw new AssistantNotFoundError("That document action is no longer pending.");
    }
    if (pending.claimed) {
      throw new AssistantConflictError("That document action is already being handled.");
    }
    pending.claimed = true;
    logDocumentTool("claimed", pending, {
      elapsedMs: Date.now() - pending.requestedAt,
    });
  }

  async respondToDocumentTool(
    workspaceId: string,
    callId: string,
    result: { success: boolean; data?: unknown; error?: string; revision?: string },
  ): Promise<void> {
    const pending = this.pendingDocumentTools.get(callId);
    if (!pending || pending.active.workspace.id !== workspaceId) {
      throw new AssistantNotFoundError("That document action is no longer pending.");
    }
    if (!pending.claimed) {
      throw new AssistantConflictError("Claim that document action before responding.");
    }
    const context = pending.active.run.context;
    if (
      result.success &&
      MUTATING_DOCUMENT_TOOLS.has(pending.call.tool) &&
      context?.kind === "document"
    ) {
      if (!result.revision) {
        throw new AssistantConflictError("A saved document revision is required.");
      }
      const current = await this.documents.read(workspaceId, context.path);
      if (current.revision !== result.revision) {
        throw new AssistantConflictError("The reported document revision is not durable.");
      }
      await this.publish(pending.active, {
        type: "content.committed",
        content: {
          path: context.path,
          kind: "document",
          revision: result.revision,
        },
      });
    }
    let responseResult = result;
    let text = JSON.stringify(
      result.success
        ? { success: true, data: result.data ?? null }
        : { success: false, error: result.error ?? "The document action failed." },
    );
    if (Buffer.byteLength(text, "utf8") > 256 * 1024) {
      responseResult = {
        success: false,
        error: "The document action result exceeded Heydesk's size limit.",
      };
      text = JSON.stringify(responseResult);
    }
    logDocumentTool("completed", pending, {
      elapsedMs: Date.now() - pending.requestedAt,
      result: summarizeInstrumentationValue(responseResult),
      revision: result.revision,
    });
    clearTimeout(pending.timeout);
    this.pendingDocumentTools.delete(callId);
    pending.responder.resolve({
      contentItems: [{ type: "inputText", text }],
      success: responseResult.success,
    });
    await this.publish(pending.active, {
      type: "document-tool.resolved",
      callId,
    });
  }

  private async ensureThread(
    workspace: WorkspaceSummary,
    repository: AssistantRepository,
    scope: AssistantScope,
  ): Promise<string> {
    const expectedContract =
      scope.kind === "document"
        ? DOCUMENT_TOOL_CONTRACT_VERSION
        : scope.kind === "page"
          ? PAGE_ASSISTANT_CONTRACT_VERSION
        : scope.kind === "home"
          ? WORKSPACE_TOOL_CONTRACT_VERSION
          : undefined;
    const existing = await repository.getThread();
    if (
      existing &&
      expectedContract &&
      existing.toolContractVersion !== expectedContract
    ) {
      await repository.clearThread();
    }
    if (existing && existing.toolContractVersion === expectedContract) {
      try {
        const resumed = threadResponseSchema.parse(
          await this.codex.request("thread/resume", {
            threadId: existing.id,
            cwd: workspace.path,
            approvalPolicy: scope.kind === "document" ? "never" : "untrusted",
            sandbox: scope.kind === "document" ? "read-only" : "workspace-write",
            model: env.CODEX_MODEL,
          }),
        );
        assertSelectedModel(resumed.model);
        return resumed.thread.id;
      } catch (error) {
        if (!isMissingThreadError(error)) throw error;
        await repository.clearThread();
      }
    }

    const started = threadResponseSchema.parse(
      await this.codex.request("thread/start", {
        cwd: workspace.path,
        approvalPolicy: scope.kind === "document" ? "never" : "untrusted",
        sandbox: scope.kind === "document" ? "read-only" : "workspace-write",
        model: env.CODEX_MODEL,
        developerInstructions:
          scope.kind === "document"
            ? buildDocumentDeveloperInstructions(scope.path)
            : scope.kind === "page"
              ? buildPageDeveloperInstructions(scope.path)
              : buildWorkspaceDeveloperInstructions(),
        ...(scope.kind === "document"
          ? { dynamicTools: documentDynamicTools() }
          : scope.kind === "home"
            ? { dynamicTools: workspaceDynamicTools() }
            : {}),
        ephemeral:
          scope.kind === "home" || (this.options.ephemeralThreads ?? false),
      }),
    );
    assertSelectedModel(started.model);
    await repository.saveThread(started.thread.id, expectedContract);
    return started.thread.id;
  }

  private async handleNotification(
    notification: CodexNotification,
  ): Promise<void> {
    if (
      notification.method === "account/login/completed" ||
      notification.method === "account/updated"
    ) {
      return;
    }
    const parsed = codexNotificationParamsSchema.safeParse(notification.params);
    if (!parsed.success) return;
    const params = parsed.data;
    const threadId = params.threadId ?? params.thread?.id;
    const active = threadId ? this.activeByThread.get(threadId) : undefined;
    if (!active) return;

    if (notification.method === "item/agentMessage/delta") {
      const messageId = params.itemId ?? "assistant-message";
      if (!active.startedMessages.has(messageId)) {
        active.startedMessages.add(messageId);
        await this.publish(active, { type: "message.started", messageId });
      }
      if (params.delta)
        await this.publish(active, {
          type: "message.delta",
          messageId,
          delta: params.delta,
        });
      return;
    }

    if (notification.method === "item/reasoning/summaryTextDelta") {
      const messageId = params.itemId ?? "reasoning";
      if (!active.startedReasoning.has(messageId)) {
        active.startedReasoning.add(messageId);
        await this.publish(active, { type: "reasoning.started", messageId });
      }
      if (params.delta)
        await this.publish(active, {
          type: "reasoning.summary",
          messageId,
          delta: params.delta,
        });
      return;
    }

    if (notification.method === "item/started" && params.item) {
      const item = params.item;
      const id = stringValue(item.id) ?? params.itemId ?? randomUUID();
      active.items.set(id, item);
      const activity = mapActivity(active.run.id, item, "running");
      if (activity)
        await this.publish(active, { type: "activity.started", activity });
      return;
    }

    if (notification.method === "item/completed" && params.item) {
      const item = params.item;
      const id = stringValue(item.id) ?? params.itemId ?? randomUUID();
      active.items.set(id, item);
      const itemType = stringValue(item.type);
      if (itemType === "agentMessage") {
        const text = stringValue(item.text) ?? "";
        if (!active.startedMessages.has(id)) {
          active.startedMessages.add(id);
          await this.publish(active, {
            type: "message.started",
            messageId: id,
          });
          if (text)
            await this.publish(active, {
              type: "message.delta",
              messageId: id,
              delta: text,
            });
        }
        await this.publish(active, {
          type: "message.completed",
          messageId: id,
          text,
        });
      } else if (itemType === "reasoning" && active.startedReasoning.has(id)) {
        await this.publish(active, {
          type: "reasoning.completed",
          messageId: id,
        });
      }
      const activity = mapActivity(active.run.id, item, "completed");
      if (activity) {
        await this.publish(active, { type: "activity.completed", activity });
        if (activity.kind === "file-change")
          await this.commitArtifacts(active, item);
      }
      return;
    }

    if (
      notification.method === "item/commandExecution/outputDelta" ||
      notification.method === "item/fileChange/outputDelta" ||
      notification.method === "item/mcpToolCall/progress"
    ) {
      if (params.itemId && params.delta) {
        await this.publish(active, {
          type: "activity.progress",
          activityId: params.itemId,
          delta: params.delta,
        });
      }
      return;
    }

    if (notification.method === "turn/diff/updated") {
      const diff = stringValue(params.diff) ?? "";
      await this.publish(active, {
        type: "draft.diff.updated",
        files: diff ? [{ path: "workspace", kind: "update", diff }] : [],
      });
      return;
    }

    if (notification.method === "turn/plan/updated") {
      const plan = Array.isArray(params.plan) ? params.plan : [];
      await this.publish(active, {
        type: "plan.updated",
        steps: plan.map((step, index) => {
          const value = asRecord(step);
          return {
            id: stringValue(value.id) ?? String(index),
            title:
              stringValue(value.step) ??
              stringValue(value.title) ??
              "Plan step",
            status: mapPlanStatus(stringValue(value.status)),
          };
        }),
      });
      return;
    }

    if (notification.method === "turn/completed") {
      const turn = asRecord(params.turn);
      const status = stringValue(turn.status);
      if (status === "failed") {
        const error = asRecord(turn.error);
        await this.failRun(
          active,
          "TURN_FAILED",
          stringValue(error.message) ?? "Codex could not complete the run.",
          true,
        );
      } else {
        const documentHandoff =
          status === "interrupted"
            ? undefined
            : this.pendingDocumentHandoffs.get(active.run.id);
        const pageHandoff =
          status === "interrupted"
            ? undefined
            : this.pendingPageHandoffs.get(active.run.id);
        this.pendingDocumentHandoffs.delete(active.run.id);
        this.pendingPageHandoffs.delete(active.run.id);
        active.run.status =
          status === "interrupted" ? "interrupted" : "completed";
        active.run.completedAt = new Date().toISOString();
        await active.repository.updateRun(active.run);
        await this.publish(active, { type: "run.completed", run: active.run });
        this.finishActive(active);
        if (documentHandoff) {
          await this.startDocumentHandoff(active, documentHandoff);
        }
        if (pageHandoff) {
          await this.startPageHandoff(active, pageHandoff);
        }
      }
      return;
    }

    if (notification.method === "error") {
      await this.failRun(
        active,
        "CODEX_ERROR",
        params.message ?? "Codex reported an error.",
        true,
      );
    }
  }

  private async handleServerRequest(
    responder: CodexServerRequestResponder,
  ): Promise<void> {
    const params = asRecord(responder.request.params);
    const threadId = stringValue(params.threadId);
    const active = threadId ? this.activeByThread.get(threadId) : undefined;
    if (!active) {
      responder.reject(-32602, "No active Heydesk run matches this request.");
      return;
    }

    if (responder.request.method === "item/tool/call") {
      if (
        active.run.scope.kind === "home" &&
        stringValue(params.namespace) === "workspace"
      ) {
        await this.executeWorkspaceTool(active, responder, params);
      } else {
        await this.requestDocumentTool(active, responder, params);
      }
      return;
    }

    if (responder.request.method === "item/fileChange/requestApproval") {
      const itemId = stringValue(params.itemId);
      const item = itemId ? active.items.get(itemId) : undefined;
      const changes = mapFileChanges(item?.changes);
      if (
        changesMatchRunScope(active, changes) &&
        (await canAutoAcceptFileChanges(active.workspace.path, changes))
      ) {
        responder.resolve({ decision: "accept" });
        return;
      }
      if (active.run.scope.kind === "page") {
        responder.resolve({ decision: "decline" });
        return;
      }
    }

    if (
      active.run.scope.kind === "home" &&
      isApprovalRequest(responder.request.method)
    ) {
      declineApprovalRequest(responder);
      return;
    }

    const interaction = mapInteraction(
      active.run.id,
      responder.request.method,
      params,
    );
    if (!interaction) {
      responder.reject(-32601, "Heydesk does not expose this Codex request.");
      return;
    }
    const timeout = setTimeout(() => {
      this.pendingInteractions.delete(interaction.id);
      if (responder.request.method === "item/tool/requestUserInput") {
        responder.resolve({ answers: {} });
      } else if (
        responder.request.method === "item/permissions/requestApproval"
      ) {
        responder.resolve({
          permissions: {},
          scope: "turn",
          strictAutoReview: true,
        });
      } else {
        responder.resolve({ decision: "cancel" });
      }
      void this.publish(active, {
        type: "interaction.resolved",
        interactionId: interaction.id,
      });
    }, INTERACTION_TIMEOUT_MS);
    this.pendingInteractions.set(interaction.id, {
      interaction,
      responder,
      method: responder.request.method,
      params,
      timeout,
      active,
    });
    active.run.status = "waiting-for-user";
    await active.repository.updateRun(active.run);
    await this.publish(active, { type: "interaction.requested", interaction });
  }

  private async commitArtifacts(
    active: ActiveRun,
    item: Record<string, unknown>,
  ): Promise<void> {
    for (const change of mapFileChanges(item.changes)) {
      if (
        !(["add", "update"] as const).includes(change.kind as "add" | "update")
      )
        continue;
      const artifactPath = workspaceRelativePath(
        active.workspace.path,
        change.path,
      );
      if (!artifactPath || !/\.mdx?$/i.test(artifactPath)) continue;
      if (
        active.run.scope.kind === "page" &&
        active.run.context?.kind === "page" &&
        artifactPath === active.run.context.path
      ) {
        const page = await this.pages.read(active.workspace.id, artifactPath);
        await this.publish(active, {
          type: "content.committed",
          content: {
            path: artifactPath,
            kind: "page",
            revision: page.revision,
          },
        });
        continue;
      }
      await this.publish(active, {
        type: "artifact.committed",
        artifact: {
          id: `${active.run.id}:${artifactPath}`,
          runId: active.run.id,
          path: artifactPath,
          kind: "page",
        },
      });
    }
  }

  private async requestDocumentTool(
    active: ActiveRun,
    responder: CodexServerRequestResponder,
    params: Record<string, unknown>,
  ): Promise<void> {
    const context = active.run.context;
    const namespace = stringValue(params.namespace);
    const tool = stringValue(params.tool);
    const callId = stringValue(params.callId);
    const argumentsValue = asRecord(params.arguments);
    if (
      context?.kind !== "document" ||
      namespace !== "document" ||
      !tool ||
      !DOCUMENT_TOOL_NAMES.has(tool) ||
      !callId
    ) {
      logDocumentToolRequest("rejected", {
        workspaceId: active.workspace.id,
        runId: active.run.id,
        callId,
        tool,
        reason: "unavailable-tool-or-scope",
        arguments: argumentsValue,
      });
      responder.resolve({
        contentItems: [
          { type: "inputText", text: JSON.stringify({ success: false, error: "That document tool is not available." }) },
        ],
        success: false,
      });
      return;
    }
    const validatedArguments = validateDocumentToolArguments(
      tool,
      argumentsValue,
    );
    if (!validatedArguments.success) {
      logDocumentToolRequest("rejected", {
        workspaceId: active.workspace.id,
        runId: active.run.id,
        callId,
        tool,
        reason: validatedArguments.error,
        arguments: argumentsValue,
      });
      responder.resolve({
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({
              success: false,
              error: validatedArguments.error,
            }),
          },
        ],
        success: false,
      });
      return;
    }
    if (this.pendingDocumentTools.has(callId)) {
      responder.reject(-32600, "That document action is already pending.");
      return;
    }
    const call: AssistantDocumentToolCall = {
      callId,
      runId: active.run.id,
      tool,
      arguments: validatedArguments.arguments,
      expiresAt: new Date(Date.now() + DOCUMENT_TOOL_TIMEOUT_MS).toISOString(),
    };
    const requestedAt = Date.now();
    const timeout = setTimeout(() => {
      this.pendingDocumentTools.delete(callId);
      logDocumentToolRequest("timed-out", {
        workspaceId: active.workspace.id,
        runId: active.run.id,
        callId,
        tool,
        elapsedMs: Date.now() - requestedAt,
        arguments: validatedArguments.arguments,
      });
      responder.resolve({
        contentItems: [
          { type: "inputText", text: JSON.stringify({ success: false, error: "The document editor did not respond in time." }) },
        ],
        success: false,
      });
      void this.publish(active, { type: "document-tool.resolved", callId });
    }, DOCUMENT_TOOL_TIMEOUT_MS);
    this.pendingDocumentTools.set(callId, {
      call,
      responder,
      active,
      claimed: false,
      requestedAt,
      timeout,
    });
    logDocumentToolRequest("requested", {
      workspaceId: active.workspace.id,
      runId: active.run.id,
      callId,
      tool,
      arguments: validatedArguments.arguments,
    });
    await this.publish(active, { type: "document-tool.requested", call });
  }

  private async executeWorkspaceTool(
    active: ActiveRun,
    responder: CodexServerRequestResponder,
    params: Record<string, unknown>,
  ): Promise<void> {
    const tool = stringValue(params.tool);
    const parsed = createArtifactToolArgumentsSchema.safeParse(params.arguments);
    if (
      this.pendingDocumentHandoffs.has(active.run.id) ||
      this.pendingPageHandoffs.has(active.run.id)
    ) {
      responder.resolve({
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({
              success: false,
              error:
                "An artifact has already been created for this request. Finish the Home turn so Heydesk can open it.",
            }),
          },
        ],
        success: false,
      });
      return;
    }
    if (
      (tool !== WORKSPACE_CREATE_DOCUMENT_TOOL &&
        tool !== WORKSPACE_CREATE_PAGE_TOOL) ||
      !parsed.success
    ) {
      responder.resolve({
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({
              success: false,
              error:
                tool === WORKSPACE_CREATE_DOCUMENT_TOOL ||
                tool === WORKSPACE_CREATE_PAGE_TOOL
                  ? (parsed.error?.issues[0]?.message ?? "Choose a valid name.")
                  : "That workspace action is not available.",
            }),
          },
        ],
        success: false,
      });
      return;
    }

    try {
      if (tool === WORKSPACE_CREATE_PAGE_TOOL) {
        const page = await this.pages.create(active.workspace.id, parsed.data.name);
        const handoff: AssistantPageHandoff = {
          sourceRunId: active.run.id,
          path: page.path,
          title: page.title,
          revision: page.revision,
        };
        this.pendingPageHandoffs.set(active.run.id, {
          handoff,
          context: parsed.data.context,
          preferences: active.run.preferences ?? {
            model: env.CODEX_MODEL,
            effort: "medium",
          },
        });
        await this.publish(active, { type: "page.created", handoff });
        responder.resolve({
          contentItems: [
            {
              type: "inputText",
              text: JSON.stringify({
                success: true,
                page: {
                  title: page.title,
                  path: page.path,
                  revision: page.revision,
                },
                next: "Finish this Home turn. Heydesk will open the page and continue from the handoff context.",
              }),
            },
          ],
          success: true,
        });
        return;
      }

      const document = await this.documents.create(
        active.workspace.id,
        parsed.data.name,
      );
      const handoff: AssistantDocumentHandoff = {
        sourceRunId: active.run.id,
        path: document.path,
        name: document.name,
        revision: document.revision,
      };
      this.pendingDocumentHandoffs.set(active.run.id, {
        handoff,
        context: parsed.data.context,
        preferences: active.run.preferences ?? {
          model: env.CODEX_MODEL,
          effort: "medium",
        },
      });
      await this.publish(active, { type: "document.created", handoff });
      responder.resolve({
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({
              success: true,
              document: {
                name: document.name,
                path: document.path,
                revision: document.revision,
              },
              next: "Finish this Home turn. Heydesk will open the document and continue from the handoff context with document tools.",
            }),
          },
        ],
        success: true,
      });
    } catch (error) {
      responder.resolve({
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({ success: false, error: toMessage(error) }),
          },
        ],
        success: false,
      });
    }
  }

  private async startDocumentHandoff(
    source: ActiveRun,
    pending: PendingDocumentHandoff,
  ): Promise<void> {
    try {
      const current = await this.documents.read(
        source.workspace.id,
        pending.handoff.path,
      );
      await this.startRun(
        source.workspace.id,
        randomUUID(),
        pending.context,
        {
          scope: { kind: "document", path: pending.handoff.path },
          context: {
            kind: "document",
            path: pending.handoff.path,
            expectedRevision: current.revision,
          },
          preferences: pending.preferences,
        },
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          source: "assistant-document-handoff",
          level: "error",
          workspaceId: source.workspace.id,
          sourceRunId: source.run.id,
          path: pending.handoff.path,
          message: toMessage(error),
        }),
      );
    }
  }

  private async startPageHandoff(
    source: ActiveRun,
    pending: PendingPageHandoff,
  ): Promise<void> {
    try {
      const current = await this.pages.read(
        source.workspace.id,
        pending.handoff.path,
      );
      await this.startRun(
        source.workspace.id,
        randomUUID(),
        pending.context,
        {
          scope: { kind: "page", path: pending.handoff.path },
          context: {
            kind: "page",
            path: pending.handoff.path,
            expectedRevision: current.revision,
          },
          preferences: pending.preferences,
        },
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          source: "assistant-page-handoff",
          level: "error",
          workspaceId: source.workspace.id,
          sourceRunId: source.run.id,
          path: pending.handoff.path,
          message: toMessage(error),
        }),
      );
    }
  }

  private async handleCodexExit(error: Error): Promise<void> {
    for (const pending of this.pendingDocumentTools.values()) {
      clearTimeout(pending.timeout);
      logDocumentTool("cancelled", pending, {
        elapsedMs: Date.now() - pending.requestedAt,
        reason: "codex-exited",
      });
      pending.responder.resolve({
        contentItems: [
          { type: "inputText", text: JSON.stringify({ success: false, error: "Codex exited before the document action completed." }) },
        ],
        success: false,
      });
      await this.publish(pending.active, {
        type: "document-tool.resolved",
        callId: pending.call.callId,
      });
    }
    this.pendingDocumentTools.clear();
    for (const pending of this.pendingInteractions.values()) {
      clearTimeout(pending.timeout);
      await this.publish(pending.active, {
        type: "interaction.resolved",
        interactionId: pending.interaction.id,
      });
    }
    this.pendingInteractions.clear();
    for (const active of [...this.activeByRun.values()]) {
      await this.failRun(active, "CODEX_EXITED", error.message, true);
    }
  }

  private async failRun(
    active: ActiveRun,
    code: string,
    message: string,
    recoverable: boolean,
  ): Promise<void> {
    this.pendingDocumentHandoffs.delete(active.run.id);
    this.pendingPageHandoffs.delete(active.run.id);
    active.run.status = "failed";
    active.run.completedAt = new Date().toISOString();
    const error = { code, message, recoverable };
    await active.repository.updateRun(active.run, error);
    await this.publish(active, {
      type: "run.failed",
      runId: active.run.id,
      error,
    });
    this.finishActive(active);
  }

  private finishActive(active: ActiveRun): void {
    this.activeByRun.delete(active.run.id);
    if (
      this.activeByThread.get(active.run.threadId)?.run.id === active.run.id
    ) {
      this.activeByThread.delete(active.run.threadId);
    }
  }

  private async publish(
    active: ActiveRun,
    event: AssistantEvent,
  ): Promise<void> {
    const sequenced = await active.repository.appendEvent(active.run.id, event);
    for (
      const listener of
        this.listeners.get(repositoryKey(active.workspace.id, active.run.scope)) ?? []
    )
      listener(sequenced);
  }

  private async getWorkspaceContext(
    workspaceId: string,
    scope: AssistantScope = { kind: "workspace" },
  ): Promise<{
    workspace: WorkspaceSummary;
    repository: AssistantRepository;
  }> {
    const workspace = await this.workspaces.getById(workspaceId);
    const key = repositoryKey(workspaceId, scope);
    let repository = this.repositories.get(key);
    if (!repository) {
      repository = new AssistantRepository(workspaceId, workspace.path, scope);
      this.repositories.set(key, repository);
      const staleRun = this.reconciledWorkspaces.has(workspaceId)
        ? null
        : await repository.getActiveRun();
      this.reconciledWorkspaces.add(workspaceId);
      if (staleRun && !this.activeByRun.has(staleRun.id)) {
        staleRun.status = "failed";
        staleRun.completedAt = new Date().toISOString();
        const error = {
          code: "SERVER_RESTARTED",
          message: "The previous assistant run ended when Heydesk restarted.",
          recoverable: true,
        };
        await repository.updateRun(staleRun, error);
        await repository.appendEvent(staleRun.id, {
          type: "run.failed",
          runId: staleRun.id,
          error,
        });
      }
    }
    return { workspace, repository };
  }
}

export class AssistantUnavailableError extends Error {
  constructor(readonly readiness: AssistantReadiness) {
    super("The assistant is not ready.");
  }
}
export class AssistantConflictError extends Error {}
export class AssistantNotFoundError extends Error {}

export const assistantService = new AssistantService(codexAppServer);

function assertSelectedModel(model: string): void {
  if (model !== env.CODEX_MODEL) {
    throw new Error(
      `Codex selected ${model} instead of the configured ${env.CODEX_MODEL}.`,
    );
  }
}

function mapActivity(
  runId: string,
  item: Record<string, unknown>,
  status: "running" | "completed",
): AssistantActivity | null {
  const type = stringValue(item.type);
  const id = stringValue(item.id) ?? randomUUID();
  const kindByType: Record<string, AssistantActivity["kind"]> = {
    commandExecution: "command",
    fileChange: "file-change",
    mcpToolCall: "mcp",
    dynamicToolCall: "dynamic-tool",
    webSearch: "web-search",
    collabAgentToolCall: "sub-agent",
    subAgentActivity: "sub-agent",
  };
  const kind = type ? kindByType[type] : undefined;
  if (!kind) return null;
  return {
    id,
    runId,
    kind,
    title:
      stringValue(item.name) ??
      stringValue(item.tool) ??
      stringValue(item.query) ??
      stringValue(item.command) ??
      type ??
      "Codex activity",
    status,
    input: item,
    output: status === "completed" ? item : undefined,
  };
}

function mapInteraction(
  runId: string,
  method: string,
  params: Record<string, unknown>,
): AssistantInteraction | null {
  const id = `${runId}:${String(params.itemId ?? randomUUID())}:${method}`;
  const expiresAt = new Date(Date.now() + INTERACTION_TIMEOUT_MS).toISOString();
  if (method === "item/commandExecution/requestApproval") {
    return {
      id,
      runId,
      kind: "command-approval",
      title: "Review command",
      description:
        stringValue(params.reason) ?? "Codex wants to run a command.",
      options: [
        { id: "approve", label: "Allow once" },
        { id: "decline", label: "Decline" },
      ],
      expiresAt,
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      id,
      runId,
      kind: "file-approval",
      title: "Review file changes",
      description:
        stringValue(params.reason) ?? "These changes need your review.",
      options: [
        { id: "approve", label: "Apply changes" },
        { id: "decline", label: "Decline" },
      ],
      expiresAt,
    };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      id,
      runId,
      kind: "permissions",
      title: "Review additional access",
      description:
        stringValue(params.reason) ??
        "Codex requested access outside the default workspace policy.",
      options: [
        { id: "approve", label: "Allow for this turn" },
        { id: "decline", label: "Decline" },
      ],
      expiresAt,
    };
  }
  if (method === "item/tool/requestUserInput") {
    const questions = Array.isArray(params.questions) ? params.questions : [];
    return {
      id,
      runId,
      kind: "user-input",
      title: "Codex needs your input",
      questions: questions.map((question) => {
        const value = asRecord(question);
        return {
          id: stringValue(value.id) ?? randomUUID(),
          question: stringValue(value.question) ?? "Choose an option",
          options: Array.isArray(value.options)
            ? value.options.map((option) => {
                const item = asRecord(option);
                return {
                  label: stringValue(item.label) ?? "Option",
                  description: stringValue(item.description),
                };
              })
            : undefined,
        };
      }),
      expiresAt,
    };
  }
  return null;
}

function mapFileChanges(value: unknown): AssistantFileChange[] {
  if (!Array.isArray(value)) return [];
  return value.map((change) => {
    const item = asRecord(change);
    const kindValue = item.kind;
    const kindRecord = asRecord(kindValue);
    const rawKind =
      stringValue(kindValue) ?? stringValue(kindRecord.type) ?? "unknown";
    return {
      path: stringValue(item.path) ?? stringValue(item.destinationPath) ?? "",
      kind: mapFileKind(rawKind),
      diff: stringValue(item.diff),
    };
  });
}

function mapFileKind(kind: string): AssistantFileChange["kind"] {
  const normalized = kind.toLowerCase();
  if (normalized.includes("add") || normalized.includes("create")) return "add";
  if (normalized.includes("update") || normalized.includes("modify"))
    return "update";
  if (normalized.includes("delete")) return "delete";
  if (normalized.includes("move") || normalized.includes("rename"))
    return "move";
  return "unknown";
}

function workspaceRelativePath(
  workspacePath: string,
  candidatePath: string,
): string | undefined {
  if (!candidatePath) return undefined;
  const root = resolve(workspacePath);
  const candidate = isAbsolute(candidatePath)
    ? resolve(candidatePath)
    : resolve(root, candidatePath);
  const path = relative(root, candidate);
  if (
    !path ||
    path === ".." ||
    path.startsWith(`..${sep}`) ||
    path.startsWith(sep)
  ) {
    return undefined;
  }
  return path.split(sep).join("/");
}

function changesMatchRunScope(
  active: ActiveRun,
  changes: AssistantFileChange[],
): boolean {
  if (active.run.context?.kind === "document") return false;
  if (active.run.context?.kind !== "page") return true;
  if (changes.length === 0) return false;
  return changes.every(
    (change) =>
      workspaceRelativePath(active.workspace.path, change.path) ===
      active.run.context?.path,
  );
}

function buildCodexInput(
  userText: string,
  workspace: WorkspaceSummary,
  context?: AssistantRunContext,
): string {
  if (!context) {
    return [
      "[Heydesk workspace context]",
      `The active Heydesk workspace is named ${JSON.stringify(workspace.name)}.`,
      "This request comes from the workspace Home view. There is no currently open page or document.",
      "[/Heydesk workspace context]",
      "",
      userText,
    ].join("\n");
  }
  if (context.kind === "document") {
    return [
      "[Heydesk document context]",
      `The user currently has the Word document ${JSON.stringify(basename(context.path))} open in the Heydesk document editor.`,
      "[/Heydesk document context]",
      "",
      userText,
    ].join("\n");
  }
  return [
    "[Heydesk page context]",
    `The user currently has the page ${JSON.stringify(basename(context.path))} open in the Heydesk page editor.`,
    "[/Heydesk page context]",
    "",
    userText,
  ].join("\n");
}

function buildWorkspaceDeveloperInstructions(): string {
  return [
    "Operate only inside the current Heydesk workspace.",
    "You are embedded in a visual editor used by non-technical users, so keep all responses concise, natural, and focused on the result visible in Heydesk.",
    "Do not expose shell commands, tool names, directories, filesystem paths, or implementation details unless the user asks for technical information.",
    "Heydesk has two distinct artifact types. A document always means a Microsoft Word .docx file in Documents. Never substitute a Markdown page when the user asks for a document.",
    "A page, draft, or note means a Markdown .md file in Pages unless the user explicitly says otherwise.",
    "When the user asks to create, draft, write, generate, or prepare a page, draft, or note, call workspace.create_page. Supply a concise user-facing title and a self-contained context brief that combines the current request with only the relevant requirements and decisions from this Home conversation. Write that context as a direct user task for the page assistant; do not mention handoffs, tools, threads, directories, or implementation details. After the tool succeeds, finish the Home turn; Heydesk will open the page and continue from that bounded context.",
    "Do not put YAML frontmatter, raw HTML, MDX or JSX, task lists, Markdown tables, footnotes, reference-style links, or embedded images in generated pages unless the user explicitly requests source-only content.",
    "When the user asks to create, draft, write, generate, or prepare a document, decide whether they mean a Word document and call workspace.create_document. Supply a concise user-facing filename and a self-contained context brief that combines the current document request with only the relevant requirements and decisions from this Home conversation. Write that context as a direct user task for the document assistant; do not mention handoffs, tools, threads, directories, or other implementation details. After the tool succeeds, finish the Home turn; Heydesk will open the blank document and continue from that bounded context through document tools.",
    "Never create scripts, helper programs, package files, build artifacts, or temporary files in the workspace. Do not generate Word files through Python, shell commands, ZIP manipulation, raw OOXML, or direct filesystem writes.",
    "Treat documents/ as user-owned Word content and .heydesk/ as private application state; do not modify either directly. Never create a Markdown substitute when the user asked for a document.",
    "Refer to artifacts by their visible names and say they are available in Pages or Documents rather than describing their internal location.",
    "Never use network access.",
  ].join(" ");
}

function isApprovalRequest(method: string): boolean {
  return (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval" ||
    method === "item/permissions/requestApproval"
  );
}

function declineApprovalRequest(responder: CodexServerRequestResponder): void {
  if (responder.request.method === "item/permissions/requestApproval") {
    responder.resolve({
      permissions: {},
      scope: "turn",
      strictAutoReview: true,
    });
    return;
  }
  responder.resolve({ decision: "decline" });
}

function buildDocumentDeveloperInstructions(path: string): string {
  return [
    `This thread belongs exclusively to the Word document ${JSON.stringify(basename(path))} already open in Heydesk.`,
    "In Heydesk, document always means a Microsoft Word .docx file; page, draft, or note refers to Markdown content in Pages.",
    "You are embedded beside the open Word document in a visual editor used by non-technical users. Keep responses concise, natural, and focused on what changed in the document.",
    "Do not expose dynamic tool names, paragraph identifiers, internal paths, or implementation details unless the user asks for technical information.",
    "Use only the document namespace tools. Never use shell commands, filesystem writes, or network access.",
    "Only inspect or modify this document. Never create another file or inspect another workspace artifact. If broader workspace context is required, ask the user to continue from Home.",
    "If the current document is blank and the request asks to create content, populate this already-open document. Never create another file.",
    "Inspect the relevant text and pending changes before mutating the document, and use the stable paraId returned by the read tools.",
    "Use append_paragraphs once when creating new document structure or adding several paragraphs. It can apply Word paragraph styles and run-level formatting while it creates the content. Do not simulate paragraphs with repeated insertions into one paraId.",
    "Use suggest_change for reviewable copy changes. Each suggestion targets exactly one paragraph: search must identify existing text, and search and replaceWith must never contain line breaks. Avoid ranges that overlap an unresolved tracked change.",
    "Use apply_formatting for one character-styling operation and apply_formatting_batch when the same request affects several paragraphs. Use set_paragraph_style for one style change and set_paragraph_styles when several paragraphs need styles.",
    "Express document hierarchy with paragraph styles, not bold text or font size alone. For a structured document, use Title for its title, Subtitle for an optional deck or byline, Heading1 for top-level sections, Heading2 and Heading3 for nested sections, Normal for body paragraphs, and Quote for block quotations.",
    "Formatting and paragraph-style tools apply direct edits rather than tracked changes. Use them only when the user explicitly asks for formatting or when formatting is essential to the requested result.",
    "Never accept or reject tracked changes on the user's behalf.",
    `Refer to the target as ${JSON.stringify(basename(path))} or "this document". After an edit, briefly describe the result without reporting a path or saved-file artifact.`,
  ].join(" ");
}

function buildPageDeveloperInstructions(path: string): string {
  return [
    `This thread belongs exclusively to the open Markdown page ${JSON.stringify(basename(path))}. Its workspace-relative path is ${JSON.stringify(path)}.`,
    "You are embedded beside this page in a visual editor used by non-technical users. Keep responses concise, natural, and focused on the visible result.",
    "Read and edit the open page directly on the local filesystem. Only modify this exact page. Never create, rename, move, delete, or modify another file, page, or document.",
    "Start with the open page as the primary context. You may read other workspace files only when the user explicitly requests workspace-aware work or the request clearly depends on named workspace context. Do not broadly explore the workspace for edits, rewrites, formatting, or questions answerable from the open page.",
    "Reading additional context never grants permission to modify another file. If another mutation is required, ask the user to continue from Home.",
    "Keep the page compatible with Heydesk's Markdown editor. Use ATX headings, paragraphs, bold, italic, strikethrough, inline or fenced code, blockquotes, ordered or unordered lists, links, horizontal rules, and ==highlight== syntax.",
    "Do not add YAML frontmatter, raw HTML, MDX or JSX, task lists, Markdown tables, footnotes, reference-style links, or embedded images unless the user explicitly requests source-only content.",
    "Do not create scripts, helper files, build artifacts, or temporary files. Never use network access.",
    `Refer to the target as ${JSON.stringify(basename(path))} or "this page". After an edit, briefly describe the result without reporting its internal path or presenting it as a newly created artifact.`,
  ].join(" ");
}

function scopeForContext(context?: AssistantRunContext): AssistantScope {
  if (context?.kind === "page") return { kind: "page", path: context.path };
  if (context?.kind === "document") {
    return { kind: "document", path: context.path };
  }
  return { kind: "workspace" };
}

function repositoryKey(workspaceId: string, scope: AssistantScope): string {
  return `${workspaceId}:${scope.kind}:${scopeKey(scope)}`;
}

function documentDynamicTools() {
  return [
    {
      type: "namespace" as const,
      name: "document",
      description: "Inspect the active Word document and propose reviewable changes.",
      tools: getToolSchemas()
        .filter((schema) => DOCUMENT_TOOL_NAMES.has(schema.function.name))
        .map((schema) => ({
          type: "function" as const,
          name: schema.function.name,
          description: schema.function.description,
          inputSchema: schema.function.parameters,
        }))
        .concat(
          appendParagraphsDynamicTool,
          applyFormattingBatchDynamicTool,
          setParagraphStylesDynamicTool,
        ),
    },
  ];
}

const createArtifactToolArgumentsSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    context: z.string().trim().min(1).max(20_000),
  })
  .strict();

function workspaceDynamicTools() {
  return [
    {
      type: "namespace" as const,
      name: "workspace",
      description:
        "Perform bounded Heydesk workspace actions that the visual application owns.",
      tools: [
        {
          type: "function" as const,
          name: WORKSPACE_CREATE_PAGE_TOOL,
          description:
            "Create a Markdown page in Heydesk before page editing begins. Call this when the user asks to create a page, draft, or note. Choose a concise visible title and provide a self-contained handoff context distilled from the relevant conversation. Do not use shell or filesystem tools to create the page.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["name", "context"],
            properties: {
              name: {
                type: "string",
                description: "A concise visible page title.",
              },
              context: {
                type: "string",
                description:
                  "A self-contained direct user task for the page assistant, containing the requested content and relevant constraints.",
              },
            },
          },
        },
        {
          type: "function" as const,
          name: WORKSPACE_CREATE_DOCUMENT_TOOL,
          description:
            "Create a valid blank Microsoft Word document in Heydesk before document editing begins. Call this when the user asks to create a document. Choose a concise visible filename and provide a self-contained handoff context distilled from the relevant conversation. Do not use shell or filesystem tools to create Word documents.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["name", "context"],
            properties: {
              name: {
                type: "string",
                description:
                  "A concise visible filename. The .docx extension is optional.",
              },
              context: {
                type: "string",
                description:
                  "A concise, self-contained continuation brief written as the user's document task. Preserve relevant requirements and decisions from the Home conversation plus the latest request, omit unrelated history, and do not mention internal tools or filesystem details.",
              },
            },
          },
        },
      ],
    },
  ];
}

export function validateDocumentToolArguments(
  tool: string,
  argumentsValue: Record<string, unknown>,
):
  | { success: true; arguments: Record<string, unknown> }
  | { success: false; error: string } {
  const schema =
    tool === "suggest_change"
      ? suggestChangeArgumentsSchema
      : tool === "apply_formatting"
        ? applyFormattingArgumentsSchema
        : tool === "apply_formatting_batch"
          ? applyFormattingBatchArgumentsSchema
        : tool === "set_paragraph_style"
          ? setParagraphStyleArgumentsSchema
          : tool === "set_paragraph_styles"
            ? setParagraphStylesArgumentsSchema
          : tool === "append_paragraphs"
            ? appendParagraphsArgumentsSchema
            : undefined;
  if (!schema) return { success: true, arguments: argumentsValue };
  const result = schema.safeParse(argumentsValue);
  if (result.success) return { success: true, arguments: result.data };
  return {
    success: false,
    error:
      result.error.issues[0]?.message ??
      `The arguments for ${tool} are invalid.`,
  };
}

function logDocumentTool(
  phase: "claimed" | "completed" | "cancelled",
  pending: PendingDocumentTool,
  details: Record<string, unknown> = {},
): void {
  logDocumentToolRequest(phase, {
    workspaceId: pending.active.workspace.id,
    runId: pending.active.run.id,
    callId: pending.call.callId,
    tool: pending.call.tool,
    arguments: pending.call.arguments,
    ...details,
  });
}

function logDocumentToolRequest(
  phase:
    | "requested"
    | "claimed"
    | "completed"
    | "rejected"
    | "timed-out"
    | "cancelled",
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "test") return;
  console.info(
    JSON.stringify({
      source: "assistant-document-tool",
      phase,
      ...Object.fromEntries(
        Object.entries(details).map(([key, value]) => [
          key,
          summarizeInstrumentationValue(value),
        ]),
      ),
    }),
  );
}

function summarizeInstrumentationValue(
  value: unknown,
  depth = 0,
): unknown {
  if (typeof value === "string") {
    if (value.length <= 500) return value;
    return {
      preview: value.slice(0, 500),
      length: value.length,
      truncated: true,
    };
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (depth >= 3) return "[nested value]";
  if (Array.isArray(value)) {
    return {
      items: value
        .slice(0, 10)
        .map((item) => summarizeInstrumentationValue(item, depth + 1)),
      length: value.length,
      ...(value.length > 10 ? { truncated: true } : {}),
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, 20);
    return Object.fromEntries(
      entries.map(([key, item]) => [
        key,
        summarizeInstrumentationValue(item, depth + 1),
      ]),
    );
  }
  return String(value);
}

function mapPlanStatus(
  status?: string,
): "pending" | "in_progress" | "completed" {
  if (status === "completed") return "completed";
  if (status === "inProgress" || status === "in_progress") return "in_progress";
  return "pending";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isMissingThreadError(error: unknown): boolean {
  return (
    error instanceof CodexRpcError &&
    /thread.*(not found|missing|does not exist)/i.test(error.message)
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unknown assistant error occurred.";
}
