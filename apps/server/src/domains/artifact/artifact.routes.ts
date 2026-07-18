import { Hono } from "hono";

import {
  WorkspaceNotFoundError,
  workspaceService,
} from "../workspace/workspace.service";
import { artifactPathSchema } from "./artifact.schemas";
import {
  ArtifactNotFoundError,
  ArtifactService,
  InvalidArtifactPathError,
} from "./artifact.service";

export const artifactRoutes = new Hono();
const artifactService = new ArtifactService(workspaceService);

artifactRoutes.get("/:workspaceId/artifacts", async (c) => {
  try {
    return c.json(await artifactService.list(c.req.param("workspaceId")));
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

artifactRoutes.get("/:workspaceId/artifacts/content", async (c) => {
  const input = artifactPathSchema.safeParse(c.req.query());
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "Invalid artifact." },
      400,
    );
  }
  try {
    return c.json(
      await artifactService.read(c.req.param("workspaceId"), input.data.path),
    );
  } catch (error) {
    if (
      error instanceof ArtifactNotFoundError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof InvalidArtifactPathError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});
