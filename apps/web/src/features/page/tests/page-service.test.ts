import { afterEach, describe, expect, it, vi } from "vitest";

import { createPage, savePage } from "../page.service";
import { PageRevisionConflictError, type Page } from "../page.types";

afterEach(() => vi.unstubAllGlobals());

describe("page client service", () => {
  it("creates a page with the chosen sidebar name", async () => {
    let request: { input: unknown; init?: RequestInit } | undefined;
    const created = page({ path: "pages/Plan.md", title: "Plan" });
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      request = { input, init };
      return Response.json(created, { status: 201 });
    });

    await expect(createPage("workspace-1", "Plan")).resolves.toEqual(created);
    expect(String(request?.input)).toContain("/workspaces/workspace-1/pages");
    expect(request?.init?.method).toBe("POST");
    expect(JSON.parse(String(request?.init?.body))).toEqual({ name: "Plan" });
  });

  it("sends revision-aware writes and returns the new baseline", async () => {
    let body: unknown;
    const updated = page({ revision: "b".repeat(64), content: "# Updated" });
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json(updated);
    });

    await expect(
      savePage(
        "workspace-1",
        "pages/Notes.md",
        "# Updated",
        "a".repeat(64),
        "user",
      ),
    ).resolves.toEqual(updated);
    expect(body).toEqual({
      content: "# Updated",
      expectedRevision: "a".repeat(64),
      origin: "user",
    });
  });

  it("surfaces the current disk page on a stale revision", async () => {
    const current = page({ revision: "c".repeat(64), content: "# Disk" });
    vi.stubGlobal("fetch", async () =>
      Response.json(
        {
          code: "REVISION_CONFLICT",
          error: "This page changed on disk.",
          current,
        },
        { status: 409 },
      ),
    );

    try {
      await savePage(
        "workspace-1",
        "pages/Notes.md",
        "# Mine",
        "a".repeat(64),
        "user",
      );
      throw new Error("Expected a revision conflict.");
    } catch (error) {
      expect(error).toBeInstanceOf(PageRevisionConflictError);
      expect((error as PageRevisionConflictError).current).toEqual(current);
    }
  });
});

function page(overrides: Partial<Page>): Page {
  return {
    path: "pages/Notes.md",
    name: "Notes",
    title: "Notes",
    excerpt: "",
    updatedAt: new Date(0).toISOString(),
    size: 7,
    content: "# Notes",
    revision: "a".repeat(64),
    syntax: "markdown",
    editorMode: "rich",
    ...overrides,
  };
}
