import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { env } from "@heydesk/env/server";
import { getToolSchemas } from "@eigenpal/docx-editor-agents/server";
import { z } from "zod";

import { PageService } from "../page/page.service";
import { DocumentService } from "../document/document.service";
import { workspaceService } from "../workspace/workspace.service";
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
  AssistantEvent,
  AssistantFileChange,
  AssistantInteraction,
  AssistantModel,
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
const DOCUMENT_TOOL_CONTRACT_VERSION = "document-tools-v2";
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
  "set_paragraph_style",
  "scroll",
]);
const MUTATING_DOCUMENT_TOOLS = new Set([
  "add_comment",
  "suggest_change",
  "apply_formatting",
  "set_paragraph_style",
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
  .refine(({ search, replaceWith }) => search.length > 0 || replaceWith.length > 0, {
    message: "A tracked change must search for or insert text.",
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
  .strict()
  .refine((marks) => Object.keys(marks).length > 0, {
    message: "Choose at least one formatting change.",
  });
const applyFormattingArgumentsSchema = z
  .object({
    paraId: documentParagraphIdSchema,
    search: singleParagraphTextSchema.optional(),
    marks: formattingMarksSchema,
  })
  .strict();
const setParagraphStyleArgumentsSchema = z
  .object({
    paraId: documentParagraphIdSchema,
    styleId: z.string().trim().min(1).max(128),
  })
  .strict();

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
  timeout: NodeJS.Timeout;
};

export class AssistantService {
  private readonly repositories = new Map<string, AssistantRepository>();
  private readonly reconciledWorkspaces = new Set<string>();
  private readonly activeByThread = new Map<string, ActiveRun>();
  private readonly activeByRun = new Map<string, ActiveRun>();
  private readonly listeners = new Map<string, Set<AssistantEventListener>>();
  private readonly pendingInteractions = new Map<string, PendingInteraction>();
  private readonly pendingDocumentTools = new Map<string, PendingDocumentTool>();
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
      throw new AssistantConflictError("The document run context does not match its assistant scope.");
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
              text: buildCodexInput(userText, options.context),
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
                  writableRoots: [workspace.path],
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
        type: "artifact.committed",
        artifact: {
          id: `${pending.active.run.id}:${context.path}:${result.revision}`,
          runId: pending.active.run.id,
          path: context.path,
          kind: "document",
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
      scope.kind === "document" ? DOCUMENT_TOOL_CONTRACT_VERSION : undefined;
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
            : "Operate only inside the current Heydesk workspace. Prefer readable Markdown or MDX artifacts. Never use network access. Treat .heydesk as private application state and do not modify it.",
        ...(scope.kind === "document"
          ? { dynamicTools: documentDynamicTools() }
          : {}),
        ephemeral: this.options.ephemeralThreads ?? false,
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
        active.run.status =
          status === "interrupted" ? "interrupted" : "completed";
        active.run.completedAt = new Date().toISOString();
        await active.repository.updateRun(active.run);
        await this.publish(active, { type: "run.completed", run: active.run });
        this.finishActive(active);
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
      await this.requestDocumentTool(active, responder, params);
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
    const timeout = setTimeout(() => {
      this.pendingDocumentTools.delete(callId);
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
      timeout,
    });
    await this.publish(active, { type: "document-tool.requested", call });
  }

  private async handleCodexExit(error: Error): Promise<void> {
    for (const pending of this.pendingDocumentTools.values()) {
      clearTimeout(pending.timeout);
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
  context?: AssistantRunContext,
): string {
  if (!context) return userText;
  if (context.kind === "document") {
    return [
      "[Heydesk document context]",
      `The user is currently viewing ${context.path}.`,
      `The durable document revision before this turn is ${context.expectedRevision}.`,
      "Use the document namespace tools for all inspection and edits.",
      "Use suggest_change for reviewable text edits and keep each call within one paragraph.",
      "Use apply_formatting or set_paragraph_style when the user asks for formatting.",
      "[/Heydesk document context]",
      "",
      userText,
    ].join("\n");
  }
  return [
    "[Heydesk page context]",
    `The user is currently viewing ${context.path}.`,
    `The page revision before this turn is ${context.expectedRevision}.`,
    "Focus changes on this page. Explain conversational answers normally.",
    "[/Heydesk page context]",
    "",
    userText,
  ].join("\n");
}

function buildDocumentDeveloperInstructions(path: string): string {
  return [
    `You are editing ${path} inside Heydesk.`,
    "Use only the document namespace tools. Never use shell commands, filesystem writes, or network access.",
    "Inspect the relevant text and pending changes before mutating the document, and use the stable paraId returned by the read tools.",
    "Use suggest_change for reviewable text replacements, insertions, and deletions. Each suggestion must target exactly one paragraph: search and replaceWith must never contain line breaks. Use one suggest_change call per paragraph and avoid ranges that overlap an unresolved tracked change.",
    "Use apply_formatting for character styling such as bold, italic, underline, color, highlight, font size, or font family. Use set_paragraph_style for Title, Heading1, Heading2, Quote, Normal, and other styles already defined in the document.",
    "Formatting and paragraph-style tools apply direct edits rather than tracked changes. Use them only when the user explicitly asks for formatting or when formatting is essential to the requested result.",
    "Never accept or reject tracked changes on the user's behalf.",
  ].join(" ");
}

function scopeForContext(context?: AssistantRunContext): AssistantScope {
  return context?.kind === "document"
    ? { kind: "document", path: context.path }
    : { kind: "workspace" };
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
        })),
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
        : tool === "set_paragraph_style"
          ? setParagraphStyleArgumentsSchema
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
