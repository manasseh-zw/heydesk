import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canAutoAcceptFileChanges } from "../assistant-safety";

describe("assistant file approval policy", () => {
  it("accepts bounded Markdown additions and updates", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "heydesk-safety-"));
    expect(
      await canAutoAcceptFileChanges(workspace, [
        { path: "pages/Notes.md", kind: "add" },
        { path: "pages/Brief.mdx", kind: "update" },
      ]),
    ).toBe(true);
  });

  it("rejects deletes, hidden state, other extensions, and escaped paths", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "heydesk-safety-"));
    await expect(
      canAutoAcceptFileChanges(workspace, [{ path: "Old.md", kind: "delete" }]),
    ).resolves.toBe(false);
    await expect(
      canAutoAcceptFileChanges(workspace, [
        { path: ".heydesk/state.md", kind: "update" },
      ]),
    ).resolves.toBe(false);
    await expect(
      canAutoAcceptFileChanges(workspace, [{ path: "script.ts", kind: "add" }]),
    ).resolves.toBe(false);
    await expect(
      canAutoAcceptFileChanges(workspace, [
        { path: "Outside.md", kind: "add" },
      ]),
    ).resolves.toBe(false);
    await expect(
      canAutoAcceptFileChanges(workspace, [
        { path: "../outside.md", kind: "add" },
      ]),
    ).resolves.toBe(false);
  });

  it("rejects paths that traverse a symlink", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "heydesk-safety-"));
    const outside = await mkdtemp(join(tmpdir(), "heydesk-outside-"));
    await mkdir(join(workspace, "pages"));
    await writeFile(join(outside, "Secret.md"), "secret", "utf8");
    await symlink(outside, join(workspace, "pages", "linked"));
    await expect(
      canAutoAcceptFileChanges(workspace, [
        { path: "pages/linked/Secret.md", kind: "update" },
      ]),
    ).resolves.toBe(false);
  });
});
