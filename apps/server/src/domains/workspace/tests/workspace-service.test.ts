import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  WorkspaceRepository,
  createWorkspaceStateFile,
} from "../workspace.repository";
import { WorkspaceService } from "../workspace.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true }),
    ),
  );
});

describe("WorkspaceService", () => {
  it("separates development workspaces and recents from production", async () => {
    const home = await mkdtemp(join(tmpdir(), "heydesk-workspace-"));
    temporaryDirectories.push(home);

    const development = new WorkspaceService(
      new WorkspaceRepository(createWorkspaceStateFile(home, "development")),
      home,
      "development",
    );
    const production = new WorkspaceService(
      new WorkspaceRepository(createWorkspaceStateFile(home, "production")),
      home,
      "production",
    );

    expect(development.defaultLocation).toBe(
      join(home, "Documents", "Heydesk", "Dev"),
    );
    expect(production.defaultLocation).toBe(join(home, "Documents", "Heydesk"));

    await development.create("Development Studio");
    await expect(
      readFile(
        join(home, ".heydesk", "dev", "workspaces.json"),
        "utf8",
      ),
    ).resolves.toContain("Development Studio");
    await expect(production.getOverview()).resolves.toEqual({
      defaultLocation: join(home, "Documents", "Heydesk"),
      recent: [],
    });
  });

  it("creates the canonical private state and content directories", async () => {
    const home = await mkdtemp(join(tmpdir(), "heydesk-workspace-"));
    temporaryDirectories.push(home);
    const service = new WorkspaceService(
      new WorkspaceRepository(join(home, ".heydesk", "workspaces.json")),
      home,
      "production",
    );

    const workspace = await service.create("Studio");

    expect(
      (await stat(join(workspace.path, ".heydesk", "heydesk.sqlite"))).isFile(),
    ).toBe(true);
    expect((await stat(join(workspace.path, "pages"))).isDirectory()).toBe(
      true,
    );
    expect((await stat(join(workspace.path, "documents"))).isDirectory()).toBe(
      true,
    );
    await expect(
      readFile(join(workspace.path, "pages", "Welcome.md"), "utf8"),
    ).resolves.toContain("# Welcome to Studio");
    await expect(
      readFile(
        join(workspace.path, ".heydesk", "workspace.json"),
        "utf8",
      ),
    ).resolves.toContain('"version": 3');
  });

  it("removes a workspace from recents without deleting its folder", async () => {
    const home = await mkdtemp(join(tmpdir(), "heydesk-workspace-"));
    temporaryDirectories.push(home);
    const service = new WorkspaceService(
      new WorkspaceRepository(join(home, ".heydesk", "workspaces.json")),
      home,
      "production",
    );
    const workspace = await service.create("Temporary Studio");

    await service.remove(workspace.id);

    await expect(service.getOverview()).resolves.toMatchObject({ recent: [] });
    expect((await stat(workspace.path)).isDirectory()).toBe(true);
  });
});
