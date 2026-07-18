import { afterEach, describe, expect, it, vi } from "vitest";

import { savePage } from "../page.service";
import { PageRevisionConflictError, type Page } from "../page.types";

afterEach(() => vi.unstubAllGlobals());

describe("page client service", () => {
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
        "Notes.md",
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
        "Notes.md",
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
    path: "Notes.md",
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
