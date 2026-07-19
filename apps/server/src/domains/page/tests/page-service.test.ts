import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  InvalidPagePathError,
  PageAlreadyExistsError,
  PageNotFoundError,
  PageRevisionConflictError,
  PageService,
} from "../page.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("PageService", () => {
  it("creates a named Markdown page without overwriting an existing page", async () => {
    const root = await createWorkspace();
    const service = createService(root);

    await expect(service.create("workspace-1", "Project brief")).resolves.toMatchObject({
      path: "pages/Project brief.md",
      title: "Project brief",
      content: "# Project brief\n\n",
    });
    await expect(
      service.create("workspace-1", "Project brief"),
    ).rejects.toBeInstanceOf(PageAlreadyExistsError);
    await expect(
      service.create("workspace-1", "../Outside"),
    ).rejects.toBeInstanceOf(InvalidPagePathError);
  });

  it("discovers readable Markdown and MDX pages", async () => {
    const root = await createWorkspace();
    await mkdir(join(root, "pages", "notes"));
    await writeFile(
      join(root, "pages", "Welcome.md"),
      "# Welcome\n\nA calm workspace.",
    );
    await writeFile(
      join(root, "pages", "notes", "Plan.mdx"),
      "# Plan\n\nShip the loop.",
    );
    await writeFile(join(root, "Outside.md"), "# Not a Heydesk page");

    const service = createService(root);
    const pages = await service.list("workspace-1");

    expect(pages).toMatchObject([
      { path: "pages/notes/Plan.mdx", title: "Plan" },
      { path: "pages/Welcome.md", title: "Welcome" },
    ]);
    await expect(
      service.read("workspace-1", "pages/Welcome.md"),
    ).resolves.toMatchObject({
      content: "# Welcome\n\nA calm workspace.",
      excerpt: "A calm workspace.",
    });
  });

  it("rejects traversal, hidden files, and symbolic links", async () => {
    const root = await createWorkspace();
    const outside = await createWorkspace();
    await writeFile(join(outside, "outside.md"), "# Outside");
    await symlink(
      join(outside, "outside.md"),
      join(root, "pages", "linked.md"),
    );
    const service = createService(root);

    await expect(
      service.read("workspace-1", "../outside.md"),
    ).rejects.toBeInstanceOf(InvalidPagePathError);
    await expect(
      service.read("workspace-1", "pages/.hidden.md"),
    ).rejects.toBeInstanceOf(InvalidPagePathError);
    await expect(
      service.read("workspace-1", "pages/linked.md"),
    ).rejects.toBeInstanceOf(InvalidPagePathError);
    await expect(
      service.read("workspace-1", "pages/missing.md"),
    ).rejects.toBeInstanceOf(PageNotFoundError);
  });

  it("writes atomically against the exact disk revision", async () => {
    const root = await createWorkspace();
    await writeFile(
      join(root, "pages", "Notes.md"),
      "# Notes\n\nFirst draft.",
    );
    const service = createService(root);
    const original = await service.read("workspace-1", "pages/Notes.md");

    const updated = await service.write(
      "workspace-1",
      "pages/Notes.md",
      "# Notes\n\nSaved draft.",
      original.revision,
    );

    expect(updated.content).toBe("# Notes\n\nSaved draft.");
    expect(updated.revision).not.toBe(original.revision);
    await expect(
      service.write(
        "workspace-1",
        "pages/Notes.md",
        "# Notes\n\nStale overwrite.",
        original.revision,
      ),
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    await expect(
      service.read("workspace-1", "pages/Notes.md"),
    ).resolves.toMatchObject({
      content: "# Notes\n\nSaved draft.",
    });
  });

  it("marks Markdown as rich candidates and keeps MDX in source mode", async () => {
    const root = await createWorkspace();
    await writeFile(
      join(root, "pages", "Component.mdx"),
      "<Callout>Keep me</Callout>",
    );
    await writeFile(
      join(root, "pages", "Comment.md"),
      "# Notes\n\n<!-- keep me -->",
    );
    await writeFile(
      join(root, "pages", "Plain.md"),
      "# Notes\n\n**Editable** text.",
    );
    const service = createService(root);

    await expect(
      service.read("workspace-1", "pages/Component.mdx"),
    ).resolves.toMatchObject({
      syntax: "mdx",
      editorMode: "source",
    });
    await expect(
      service.read("workspace-1", "pages/Comment.md"),
    ).resolves.toMatchObject({
      editorMode: "rich",
    });
    await expect(
      service.read("workspace-1", "pages/Plain.md"),
    ).resolves.toMatchObject({
      editorMode: "rich",
    });
  });
});

async function createWorkspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "heydesk-page-"));
  temporaryDirectories.push(path);
  await mkdir(join(path, "pages"));
  return path;
}

function createService(root: string): PageService {
  return new PageService({
    getById: async () => ({
      id: "workspace-1",
      name: "Workspace",
      path: root,
      lastOpenedAt: new Date(0).toISOString(),
    }),
  });
}
