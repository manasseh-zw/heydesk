import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  InvalidPagePathError,
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
  it("discovers readable Markdown and MDX pages", async () => {
    const root = await createWorkspace();
    await mkdir(join(root, "notes"));
    await writeFile(join(root, "Welcome.md"), "# Welcome\n\nA calm workspace.");
    await writeFile(join(root, "notes", "Plan.mdx"), "# Plan\n\nShip the loop.");
    await mkdir(join(root, ".heydesk"));
    await writeFile(join(root, ".heydesk", "private.md"), "# Private");
    await mkdir(join(root, "opensrc"));
    await writeFile(join(root, "opensrc", "reference.md"), "# Reference");
    await writeFile(join(root, ".gitignore"), "opensrc/\n");

    const service = createService(root);
    const pages = await service.list("workspace-1");

    expect(pages).toMatchObject([
      { path: "notes/Plan.mdx", title: "Plan" },
      { path: "Welcome.md", title: "Welcome" },
    ]);
    await expect(
      service.read("workspace-1", "Welcome.md"),
    ).resolves.toMatchObject({
      content: "# Welcome\n\nA calm workspace.",
      excerpt: "A calm workspace.",
    });
  });

  it("rejects traversal, hidden files, and symbolic links", async () => {
    const root = await createWorkspace();
    const outside = await createWorkspace();
    await writeFile(join(outside, "outside.md"), "# Outside");
    await symlink(join(outside, "outside.md"), join(root, "linked.md"));
    const service = createService(root);

    await expect(
      service.read("workspace-1", "../outside.md"),
    ).rejects.toBeInstanceOf(InvalidPagePathError);
    await expect(
      service.read("workspace-1", ".hidden.md"),
    ).rejects.toBeInstanceOf(InvalidPagePathError);
    await expect(
      service.read("workspace-1", "linked.md"),
    ).rejects.toBeInstanceOf(InvalidPagePathError);
    await expect(
      service.read("workspace-1", "missing.md"),
    ).rejects.toBeInstanceOf(PageNotFoundError);
  });

  it("writes atomically against the exact disk revision", async () => {
    const root = await createWorkspace();
    await writeFile(join(root, "Notes.md"), "# Notes\n\nFirst draft.");
    const service = createService(root);
    const original = await service.read("workspace-1", "Notes.md");

    const updated = await service.write(
      "workspace-1",
      "Notes.md",
      "# Notes\n\nSaved draft.",
      original.revision,
    );

    expect(updated.content).toBe("# Notes\n\nSaved draft.");
    expect(updated.revision).not.toBe(original.revision);
    await expect(
      service.write(
        "workspace-1",
        "Notes.md",
        "# Notes\n\nStale overwrite.",
        original.revision,
      ),
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    await expect(service.read("workspace-1", "Notes.md")).resolves.toMatchObject({
      content: "# Notes\n\nSaved draft.",
    });
  });

  it("uses lossless source mode for MDX and unsupported Markdown", async () => {
    const root = await createWorkspace();
    await writeFile(join(root, "Component.mdx"), "<Callout>Keep me</Callout>");
    await writeFile(join(root, "Comment.md"), "# Notes\n\n<!-- keep me -->");
    await writeFile(join(root, "Jsx.md"), "# Notes\n\n<Callout>Keep me</Callout>");
    await writeFile(join(root, "Plain.md"), "# Notes\n\n**Editable** text.");
    const service = createService(root);

    await expect(service.read("workspace-1", "Component.mdx")).resolves.toMatchObject({
      syntax: "mdx",
      editorMode: "source",
    });
    await expect(service.read("workspace-1", "Comment.md")).resolves.toMatchObject({
      editorMode: "source",
    });
    await expect(service.read("workspace-1", "Jsx.md")).resolves.toMatchObject({
      editorMode: "source",
    });
    await expect(service.read("workspace-1", "Plain.md")).resolves.toMatchObject({
      editorMode: "rich",
    });
  });
});

async function createWorkspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "heydesk-page-"));
  temporaryDirectories.push(path);
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
