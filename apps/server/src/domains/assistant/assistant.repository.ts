import { createWorkspaceDb, schema } from "@heydesk/db";
import { and, desc, eq, gt, inArray } from "drizzle-orm";

import type {
  AssistantEvent,
  AssistantRun,
  AssistantRunStatus,
  AssistantScope,
  AssistantSnapshot,
  SequencedAssistantEvent,
} from "./assistant.types";

const ACTIVE_STATUSES: AssistantRunStatus[] = [
  "starting",
  "running",
  "waiting-for-user",
];
const REPLAY_LIMIT = 500;

export class AssistantRepository {
  private readonly connection;
  private initialized: Promise<void> | null = null;

  constructor(
    readonly workspaceId: string,
    readonly workspacePath: string,
    readonly scope: AssistantScope = { kind: "workspace" },
  ) {
    this.connection = createWorkspaceDb(workspacePath);
  }

  async getThread(): Promise<{ id: string; toolContractVersion?: string } | null> {
    await this.initialize();
    const [row] = await this.connection.db
      .select()
      .from(schema.assistantThreadScopes)
      .where(
        and(
          eq(schema.assistantThreadScopes.workspaceId, this.workspaceId),
          eq(schema.assistantThreadScopes.scopeKind, this.scope.kind),
          eq(schema.assistantThreadScopes.scopeKey, scopeKey(this.scope)),
        ),
      )
      .limit(1);
    if (row) {
      return {
        id: row.codexThreadId,
        ...(row.toolContractVersion
          ? { toolContractVersion: row.toolContractVersion }
          : {}),
      };
    }
    if (this.scope.kind !== "workspace") return null;
    const [legacy] = await this.connection.db
      .select()
      .from(schema.assistantThreads)
      .where(eq(schema.assistantThreads.workspaceId, this.workspaceId))
      .limit(1);
    if (!legacy) return null;
    await this.saveThread(legacy.codexThreadId);
    return { id: legacy.codexThreadId };
  }

  async saveThread(
    codexThreadId: string,
    toolContractVersion?: string,
  ): Promise<void> {
    await this.initialize();
    const now = new Date().toISOString();
    await this.connection.db
      .insert(schema.assistantThreadScopes)
      .values({
        id: `${this.workspaceId}:${this.scope.kind}:${scopeKey(this.scope)}`,
        workspaceId: this.workspaceId,
        scopeKind: this.scope.kind,
        scopeKey: scopeKey(this.scope),
        codexThreadId,
        toolContractVersion,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.assistantThreadScopes.workspaceId,
          schema.assistantThreadScopes.scopeKind,
          schema.assistantThreadScopes.scopeKey,
        ],
        set: { codexThreadId, toolContractVersion, updatedAt: now },
      });
  }

  async clearThread(): Promise<void> {
    await this.initialize();
    await this.connection.db
      .delete(schema.assistantThreadScopes)
      .where(
        and(
          eq(schema.assistantThreadScopes.workspaceId, this.workspaceId),
          eq(schema.assistantThreadScopes.scopeKind, this.scope.kind),
          eq(schema.assistantThreadScopes.scopeKey, scopeKey(this.scope)),
        ),
      );
  }

  async createRun(run: AssistantRun): Promise<void> {
    await this.initialize();
    const active = await this.getActiveRun();
    if (active)
      throw new Error("This workspace already has an active assistant run.");
    await this.connection.db.insert(schema.assistantRuns).values({
      id: run.id,
      workspaceId: run.workspaceId,
      scopeKind: run.scope.kind,
      scopeKey: scopeKey(run.scope),
      threadId: run.threadId,
      codexTurnId: run.turnId,
      status: run.status,
      userText: run.userText,
      snapshotJson: JSON.stringify(run),
      createdAt: run.createdAt,
      updatedAt: run.createdAt,
      completedAt: run.completedAt,
    });
  }

  async updateRun(run: AssistantRun, error?: unknown): Promise<void> {
    await this.initialize();
    await this.connection.db
      .update(schema.assistantRuns)
      .set({
        codexTurnId: run.turnId,
        status: run.status,
        snapshotJson: JSON.stringify(run),
        errorJson: error === undefined ? null : JSON.stringify(error),
        updatedAt: new Date().toISOString(),
        completedAt: run.completedAt,
      })
      .where(eq(schema.assistantRuns.id, run.id));
  }

  async getRun(runId: string): Promise<AssistantRun | null> {
    await this.initialize();
    const [row] = await this.connection.db
      .select()
      .from(schema.assistantRuns)
      .where(eq(schema.assistantRuns.id, runId))
      .limit(1);
    return row ? parseRun(row.snapshotJson) : null;
  }

  async getActiveRun(): Promise<AssistantRun | null> {
    await this.initialize();
    const [row] = await this.connection.db
      .select()
      .from(schema.assistantRuns)
      .where(
        and(
          eq(schema.assistantRuns.workspaceId, this.workspaceId),
          inArray(schema.assistantRuns.status, ACTIVE_STATUSES),
        ),
      )
      .orderBy(desc(schema.assistantRuns.createdAt))
      .limit(1);
    return row ? parseRun(row.snapshotJson) : null;
  }

  async appendEvent(
    runId: string,
    event: AssistantEvent,
  ): Promise<SequencedAssistantEvent> {
    await this.initialize();
    const createdAt = new Date().toISOString();
    const [row] = await this.connection.db
      .insert(schema.assistantEvents)
      .values({
        runId,
        workspaceId: this.workspaceId,
        scopeKind: this.scope.kind,
        scopeKey: scopeKey(this.scope),
        eventType: event.type,
        eventJson: JSON.stringify(event),
        createdAt,
      })
      .returning({ sequence: schema.assistantEvents.sequence });
    if (!row) throw new Error("Heydesk could not persist the assistant event.");

    await this.connection.client.execute({
      sql: `DELETE FROM assistant_events
        WHERE run_id = ? AND sequence NOT IN (
          SELECT sequence FROM assistant_events WHERE run_id = ? ORDER BY sequence DESC LIMIT ?
        )`,
      args: [runId, runId, REPLAY_LIMIT],
    });

    return {
      sequence: row.sequence,
      runId,
      workspaceId: this.workspaceId,
      createdAt,
      event,
    };
  }

  async listEvents(afterSequence = 0): Promise<SequencedAssistantEvent[]> {
    await this.initialize();
    const rows = await this.connection.db
      .select()
      .from(schema.assistantEvents)
      .where(
        and(
          eq(schema.assistantEvents.workspaceId, this.workspaceId),
          eq(schema.assistantEvents.scopeKind, this.scope.kind),
          eq(schema.assistantEvents.scopeKey, scopeKey(this.scope)),
          gt(schema.assistantEvents.sequence, afterSequence),
        ),
      )
      .orderBy(schema.assistantEvents.sequence)
      .limit(REPLAY_LIMIT);
    return rows.map((row) => ({
      sequence: row.sequence,
      runId: row.runId,
      workspaceId: row.workspaceId,
      createdAt: row.createdAt,
      event: JSON.parse(row.eventJson) as AssistantEvent,
    }));
  }

  async getSnapshot(): Promise<AssistantSnapshot> {
    await this.initialize();
    const runRows = await this.connection.db
      .select()
      .from(schema.assistantRuns)
      .where(
        and(
          eq(schema.assistantRuns.workspaceId, this.workspaceId),
          eq(schema.assistantRuns.scopeKind, this.scope.kind),
          eq(schema.assistantRuns.scopeKey, scopeKey(this.scope)),
        ),
      )
      .orderBy(desc(schema.assistantRuns.createdAt))
      .limit(20);
    const recentRuns = runRows.map((row) => parseRun(row.snapshotJson));
    const events = await this.listEvents();
    return {
      workspaceId: this.workspaceId,
      scope: this.scope,
      activeRun:
        recentRuns.find((run) => ACTIVE_STATUSES.includes(run.status)) ?? null,
      recentRuns,
      events,
      lastSequence: events.at(-1)?.sequence ?? 0,
    };
  }

  private initialize(): Promise<void> {
    this.initialized ??= (async () => {
      await this.connection.client.batch(
        [
          `CREATE TABLE IF NOT EXISTS assistant_threads (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL UNIQUE,
          codex_thread_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
          `CREATE TABLE IF NOT EXISTS assistant_thread_scopes (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_key TEXT NOT NULL,
          codex_thread_id TEXT NOT NULL,
          tool_contract_version TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
          `CREATE UNIQUE INDEX IF NOT EXISTS assistant_thread_scopes_scope_idx
          ON assistant_thread_scopes (workspace_id, scope_kind, scope_key)`,
          `CREATE TABLE IF NOT EXISTS assistant_runs (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          codex_turn_id TEXT,
          status TEXT NOT NULL,
          user_text TEXT NOT NULL,
          snapshot_json TEXT NOT NULL DEFAULT '{}',
          error_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        )`,
          `CREATE INDEX IF NOT EXISTS assistant_runs_workspace_idx
          ON assistant_runs (workspace_id, created_at)`,
          `CREATE TABLE IF NOT EXISTS assistant_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          run_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`,
          `CREATE INDEX IF NOT EXISTS assistant_events_run_idx
          ON assistant_events (run_id, sequence)`,
        ],
        "write",
      );
      await addColumnIfMissing(
        this.connection.client,
        "assistant_runs",
        "scope_kind",
        "TEXT NOT NULL DEFAULT 'workspace'",
      );
      await addColumnIfMissing(
        this.connection.client,
        "assistant_runs",
        "scope_key",
        "TEXT NOT NULL DEFAULT ''",
      );
      await addColumnIfMissing(
        this.connection.client,
        "assistant_events",
        "scope_kind",
        "TEXT NOT NULL DEFAULT 'workspace'",
      );
      await addColumnIfMissing(
        this.connection.client,
        "assistant_events",
        "scope_key",
        "TEXT NOT NULL DEFAULT ''",
      );
      await this.connection.client.batch(
        [
          `CREATE INDEX IF NOT EXISTS assistant_runs_scope_idx
          ON assistant_runs (workspace_id, scope_kind, scope_key, created_at)`,
          `CREATE INDEX IF NOT EXISTS assistant_events_scope_idx
          ON assistant_events (workspace_id, scope_kind, scope_key, sequence)`,
        ],
        "write",
      );
    })();
    return this.initialized;
  }
}

export function scopeKey(scope: AssistantScope): string {
  return scope.kind === "document" ? scope.path : "";
}

async function addColumnIfMissing(
  client: { execute: (statement: string) => Promise<unknown> },
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (!(error instanceof Error) || !/duplicate column/i.test(error.message)) {
      throw error;
    }
  }
}

function parseRun(value: string): AssistantRun {
  const run = JSON.parse(value) as AssistantRun;
  return { ...run, scope: run.scope ?? { kind: "workspace" } };
}
