import { env } from "@heydesk/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { workspaceRoutes } from "./domains/workspace/workspace.routes";
import { assistantRoutes } from "./domains/assistant/assistant.routes";

export const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/", (c) => c.text("OK"));
app.route("/api/workspaces", workspaceRoutes);
app.route("/api", assistantRoutes);
