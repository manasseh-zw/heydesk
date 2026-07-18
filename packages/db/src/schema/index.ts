import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const assistantThreads = sqliteTable(
  "assistant_threads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    codexThreadId: text("codex_thread_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("assistant_threads_workspace_idx").on(table.workspaceId),
  ],
);

export const assistantRuns = sqliteTable(
  "assistant_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    threadId: text("thread_id").notNull(),
    codexTurnId: text("codex_turn_id"),
    status: text("status").notNull(),
    userText: text("user_text").notNull(),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    errorJson: text("error_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("assistant_runs_workspace_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const assistantEvents = sqliteTable(
  "assistant_events",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    eventType: text("event_type").notNull(),
    eventJson: text("event_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("assistant_events_run_idx").on(table.runId, table.sequence),
  ],
);
