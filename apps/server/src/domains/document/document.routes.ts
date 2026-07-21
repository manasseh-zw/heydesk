import { Hono, type Context } from "hono";

import { AssistantRepository } from "../assistant/assistant.repository";
import {
  WorkspaceNotFoundError,
  workspaceService,
} from "../workspace/workspace.service";
import {
  createDocumentSchema,
  documentPathSchema,
  documentRevisionSchema,
  importDocumentSchema,
} from "./document.schemas";
import {
  DocumentAlreadyExistsError,
  DocumentNotFoundError,
  DocumentRevisionConflictError,
  DocumentService,
  InvalidDocumentError,
  maximumDocumentSize,
} from "./document.service";

export const documentRoutes = new Hono();
export const documentService = new DocumentService(workspaceService);

documentRoutes.get("/:workspaceId/documents", async (c) => {
  try {
    return c.json(await documentService.list(c.req.param("workspaceId")));
  } catch (error) {
    return mapDocumentError(c, error);
  }
});

documentRoutes.post("/:workspaceId/documents", async (c) => {
  const input = createDocumentSchema.safeParse(await readJson(c.req.raw));
  if (!input.success) return c.json({ error: input.error.issues[0]?.message }, 400);
  try {
    const document = await documentService.create(
      c.req.param("workspaceId"),
      input.data.name,
    );
    c.header("ETag", `"${document.revision}"`);
    return c.json(document, 201);
  } catch (error) {
    return mapDocumentError(c, error);
  }
});

documentRoutes.post("/:workspaceId/documents/import", async (c) => {
  const input = importDocumentSchema.safeParse(c.req.query());
  if (!input.success) return c.json({ error: input.error.issues[0]?.message }, 400);
  try {
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.byteLength > maximumDocumentSize) {
      return c.json({ error: "That document is too large." }, 413);
    }
    const document = await documentService.import(
      c.req.param("workspaceId"),
      input.data.name,
      body,
    );
    c.header("ETag", `"${document.revision}"`);
    return c.json(document, 201);
  } catch (error) {
    return mapDocumentError(c, error);
  }
});

documentRoutes.get("/:workspaceId/documents/content", async (c) => {
  const input = documentPathSchema.safeParse(c.req.query());
  if (!input.success) return c.json({ error: input.error.issues[0]?.message }, 400);
  try {
    const document = await documentService.read(
      c.req.param("workspaceId"),
      input.data.path,
    );
    const etag = `"${document.revision}"`;
    c.header("ETag", etag);
    if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
    c.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    c.header("Content-Disposition", `inline; filename="${encodeURIComponent(document.name)}.docx"`);
    return c.body(
      document.buffer.buffer.slice(
        document.buffer.byteOffset,
        document.buffer.byteOffset + document.buffer.byteLength,
      ) as ArrayBuffer,
    );
  } catch (error) {
    return mapDocumentError(c, error);
  }
});

documentRoutes.put("/:workspaceId/documents/content", async (c) => {
  const path = documentPathSchema.safeParse(c.req.query());
  const expectedRevision = documentRevisionSchema.safeParse(
    c.req.header("If-Match")?.replaceAll('"', ""),
  );
  if (!path.success || !expectedRevision.success) {
    return c.json({ error: "Choose a document and provide its current revision." }, 400);
  }
  try {
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (body.byteLength > maximumDocumentSize) {
      return c.json({ error: "That document is too large." }, 413);
    }
    const document = await documentService.write(
      c.req.param("workspaceId"),
      path.data.path,
      body,
      expectedRevision.data,
    );
    c.header("ETag", `"${document.revision}"`);
    return c.json(document);
  } catch (error) {
    return mapDocumentError(c, error);
  }
});

documentRoutes.delete("/:workspaceId/documents/content", async (c) => {
  const input = documentPathSchema.safeParse(c.req.query());
  if (!input.success) {
    return c.json({ error: input.error.issues[0]?.message }, 400);
  }
  try {
    const workspaceId = c.req.param("workspaceId");
    const workspace = await workspaceService.getById(workspaceId);
    await documentService.delete(workspaceId, input.data.path);
    await new AssistantRepository(workspaceId, workspace.path, {
      kind: "document",
      path: input.data.path,
    }).deleteScopeData();
    return c.body(null, 204);
  } catch (error) {
    return mapDocumentError(c, error);
  }
});

function mapDocumentError(c: Context, error: unknown) {
  if (error instanceof DocumentRevisionConflictError) {
    return c.json({ code: "REVISION_CONFLICT", error: error.message, current: error.current }, 409);
  }
  if (error instanceof DocumentAlreadyExistsError) return c.json({ error: error.message }, 409);
  if (error instanceof DocumentNotFoundError || error instanceof WorkspaceNotFoundError) {
    return c.json({ error: error.message }, 404);
  }
  if (error instanceof InvalidDocumentError) return c.json({ error: error.message }, 400);
  throw error;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
