import { Hono } from "hono";

import { createWorkspaceSchema, openWorkspaceSchema } from "./workspace.schemas";
import {
  WorkspaceConflictError,
  WorkspaceNotFoundError,
  workspaceService,
} from "./workspace.service";

export const workspaceRoutes = new Hono();

workspaceRoutes.get("/", async (c) => c.json(await workspaceService.getOverview()));

workspaceRoutes.post("/", async (c) => {
  const input = createWorkspaceSchema.safeParse(await readJson(c.req.raw));
  if (!input.success) {
    return c.json({ error: input.error.issues[0]?.message ?? "Invalid workspace." }, 400);
  }

  try {
    return c.json(await workspaceService.create(input.data.name), 201);
  } catch (error) {
    if (error instanceof WorkspaceConflictError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

workspaceRoutes.post("/open", async (c) => {
  const input = openWorkspaceSchema.safeParse(await readJson(c.req.raw));
  if (!input.success) {
    return c.json({ error: input.error.issues[0]?.message ?? "Invalid folder." }, 400);
  }

  try {
    return c.json(await workspaceService.open(input.data.path));
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

workspaceRoutes.delete("/:workspaceId", async (c) => {
  try {
    await workspaceService.remove(c.req.param("workspaceId"));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
