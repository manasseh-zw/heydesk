import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { join } from "node:path";

import * as schema from "./schema";

const workspaceDatabaseDirectory = ".heydesk";
const workspaceDatabaseName = "heydesk.sqlite";

export function createWorkspaceDb(workspacePath: string) {
  const client = createClient({
    url: `file:${join(workspacePath, workspaceDatabaseDirectory, workspaceDatabaseName)}`,
  });

  return {
    client,
    db: drizzle({ client, schema }),
  };
}

export async function initializeWorkspaceDb(
  workspacePath: string,
): Promise<void> {
  const connection = createWorkspaceDb(workspacePath);
  try {
    await connection.client.execute("PRAGMA user_version");
  } finally {
    connection.client.close();
  }
}

export { schema };
