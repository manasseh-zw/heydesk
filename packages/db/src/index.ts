import { env } from "@heydesk/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { join } from "node:path";

import * as schema from "./schema";

export function createDb() {
  const client = createClient({
    url: env.DATABASE_URL,
  });

  return drizzle({ client, schema });
}

export const db = createDb();

export function createWorkspaceDb(workspacePath: string) {
  const client = createClient({
    url: `file:${join(workspacePath, ".heydesk", "heydesk.sqlite")}`,
  });

  return {
    client,
    db: drizzle({ client, schema }),
  };
}

export { schema };
