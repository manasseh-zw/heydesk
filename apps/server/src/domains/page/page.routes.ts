import { Hono } from "hono";

import { AssistantRepository } from "../assistant/assistant.repository";
import { DocumentService } from "../document/document.service";
import {
  WorkspaceNotFoundError,
  workspaceService,
} from "../workspace/workspace.service";
import {
  convertPageToDocumentSchema,
  createPageSchema,
  pagePathSchema,
  quickEditPageSchema,
  writePageSchema,
} from "./page.schemas";
import {
  PageDocumentConversionError,
  PageDocumentConversionService,
  UnsupportedPageConversionError,
} from "./page-document-conversion.service";
import { pageQuickEditService } from "./page-quick-edit.service";
import {
  InvalidPagePathError,
  PageAlreadyExistsError,
  PageNotFoundError,
  PageRevisionConflictError,
  PageService,
} from "./page.service";

export const pageRoutes = new Hono();
const pageService = new PageService(workspaceService);
const pageDocumentConversionService = new PageDocumentConversionService(
  pageService,
  new DocumentService(workspaceService),
);

pageRoutes.get("/:workspaceId/pages", async (c) => {
  try {
    return c.json(await pageService.list(c.req.param("workspaceId")));
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    throw error;
  }
});

pageRoutes.post("/:workspaceId/pages", async (c) => {
  const input = createPageSchema.safeParse(await readJson(c.req.raw));
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "Invalid page name." },
      400,
    );
  }
  try {
    const page = await pageService.create(
      c.req.param("workspaceId"),
      input.data.name,
    );
    c.header("ETag", `"${page.revision}"`);
    return c.json(page, 201);
  } catch (error) {
    if (error instanceof PageAlreadyExistsError) {
      return c.json({ error: error.message }, 409);
    }
    if (error instanceof WorkspaceNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof InvalidPagePathError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

pageRoutes.get("/:workspaceId/pages/content", async (c) => {
  const input = pagePathSchema.safeParse(c.req.query());
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "Invalid page." },
      400,
    );
  }
  try {
    const page = await pageService.read(
      c.req.param("workspaceId"),
      input.data.path,
    );
    const etag = `"${page.revision}"`;
    c.header("ETag", etag);
    if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
    return c.json(page);
  } catch (error) {
    if (
      error instanceof PageNotFoundError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof InvalidPagePathError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

pageRoutes.put("/:workspaceId/pages/content", async (c) => {
  const path = pagePathSchema.safeParse(c.req.query());
  const input = writePageSchema.safeParse(await readJson(c.req.raw));
  if (!path.success || !input.success) {
    return c.json(
      {
        error:
          path.error?.issues[0]?.message ??
          input.error?.issues[0]?.message ??
          "Invalid page.",
      },
      400,
    );
  }
  try {
    const page = await pageService.write(
      c.req.param("workspaceId"),
      path.data.path,
      input.data.content,
      input.data.expectedRevision,
    );
    c.header("ETag", `"${page.revision}"`);
    return c.json(page);
  } catch (error) {
    if (error instanceof PageRevisionConflictError) {
      return c.json(
        {
          code: "REVISION_CONFLICT" as const,
          error: error.message,
          current: error.current,
        },
        409,
      );
    }
    if (
      error instanceof PageNotFoundError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof InvalidPagePathError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

pageRoutes.delete("/:workspaceId/pages/content", async (c) => {
  const input = pagePathSchema.safeParse(c.req.query());
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "Invalid page." },
      400,
    );
  }
  try {
    const workspaceId = c.req.param("workspaceId");
    const workspace = await workspaceService.getById(workspaceId);
    await pageService.delete(workspaceId, input.data.path);
    await new AssistantRepository(workspaceId, workspace.path, {
      kind: "page",
      path: input.data.path,
    }).deleteScopeData();
    return c.body(null, 204);
  } catch (error) {
    if (
      error instanceof PageNotFoundError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof InvalidPagePathError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

pageRoutes.post("/:workspaceId/pages/convert-to-document", async (c) => {
  const input = convertPageToDocumentSchema.safeParse(
    await readJson(c.req.raw),
  );
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "Invalid page." },
      400,
    );
  }
  try {
    const document = await pageDocumentConversionService.convert(
      c.req.param("workspaceId"),
      input.data,
      c.req.raw.signal,
    );
    c.header("ETag", `"${document.revision}"`);
    return c.json(document, 201);
  } catch (error) {
    if (error instanceof PageRevisionConflictError) {
      return c.json(
        {
          code: "REVISION_CONFLICT" as const,
          error: error.message,
          current: error.current,
        },
        409,
      );
    }
    if (
      error instanceof PageNotFoundError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return c.json({ error: error.message }, 404);
    }
    if (
      error instanceof InvalidPagePathError ||
      error instanceof UnsupportedPageConversionError
    ) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof PageDocumentConversionError) {
      return c.json({ error: error.message }, 422);
    }
    throw error;
  }
});

pageRoutes.post("/:workspaceId/pages/quick-edits", async (c) => {
  const input = quickEditPageSchema.safeParse(await readJson(c.req.raw));
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "Invalid quick edit." },
      400,
    );
  }
  try {
    return c.json(
      await pageQuickEditService.run(
        c.req.param("workspaceId"),
        input.data,
        c.req.raw.signal,
      ),
      201,
    );
  } catch (error) {
    if (error instanceof PageRevisionConflictError) {
      return c.json(
        {
          code: "REVISION_CONFLICT" as const,
          error: error.message,
          current: error.current,
        },
        409,
      );
    }
    if (
      error instanceof PageNotFoundError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof InvalidPagePathError) {
      return c.json({ error: error.message }, 400);
    }
    return c.json(
      {
        error: error instanceof Error ? error.message : "Quick edit failed.",
      },
      502,
    );
  }
});

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
