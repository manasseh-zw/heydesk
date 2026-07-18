import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ArtifactNotFoundError,
  ArtifactService,
  InvalidArtifactPathError,
} from "../artifact.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("ArtifactService", () => {
  it("discovers readable Markdown and MDX artifacts", async () => {
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
    const artifacts = await service.list("workspace-1");

    expect(artifacts).toMatchObject([
      { path: "notes/Plan.mdx", title: "Plan", kind: "page" },
      { path: "Welcome.md", title: "Welcome", kind: "page" },
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
    ).rejects.toBeInstanceOf(InvalidArtifactPathError);
    await expect(
      service.read("workspace-1", ".hidden.md"),
    ).rejects.toBeInstanceOf(InvalidArtifactPathError);
    await expect(
      service.read("workspace-1", "linked.md"),
    ).rejects.toBeInstanceOf(InvalidArtifactPathError);
    await expect(
      service.read("workspace-1", "missing.md"),
    ).rejects.toBeInstanceOf(ArtifactNotFoundError);
  });
});

async function createWorkspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "heydesk-artifact-"));
  temporaryDirectories.push(path);
  return path;
}

function createService(root: string): ArtifactService {
  return new ArtifactService({
    getById: async () => ({
      id: "workspace-1",
      name: "Workspace",
      path: root,
      lastOpenedAt: new Date(0).toISOString(),
    }),
  });
}
