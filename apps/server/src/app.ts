import { env } from "@heydesk/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { workspaceRoutes } from "./domains/workspace/workspace.routes";
import { assistantRoutes } from "./domains/assistant/assistant.routes";
import { pageRoutes } from "./domains/page/page.routes";
import { documentRoutes } from "./domains/document/document.routes";

export const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "If-Match", "If-None-Match", "Last-Event-ID"],
    exposeHeaders: ["ETag", "Content-Disposition"],
  }),
);

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/workspaces", workspaceRoutes);
app.route("/api/workspaces", pageRoutes);
app.route("/api/workspaces", documentRoutes);
app.route("/api", assistantRoutes);
