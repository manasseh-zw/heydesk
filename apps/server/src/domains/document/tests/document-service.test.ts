import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDocumentWithText,
  createDocx,
} from "@eigenpal/docx-editor-core/headless";

import {
  DocumentAlreadyExistsError,
  DocumentRevisionConflictError,
  DocumentService,
  InvalidDocumentError,
} from "../document.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("DocumentService", () => {
  it("creates, discovers, and reads a valid DOCX", async () => {
    const root = await createWorkspace();
    const service = createService(root);

    const created = await service.create("workspace-1", "Project brief");
    const content = await service.read("workspace-1", created.path);

    expect(created).toMatchObject({ path: "Project brief.docx", name: "Project brief" });
    expect(content.buffer.byteLength).toBeGreaterThan(100);
    await expect(service.list("workspace-1")).resolves.toMatchObject([
      { path: "Project brief.docx" },
    ]);
  });

  it("imports and revision-checks exact DOCX bytes", async () => {
    const root = await createWorkspace();
    const service = createService(root);
    const first = bytes(await createDocx(createDocumentWithText("First draft")));
    const second = bytes(await createDocx(createDocumentWithText("Second draft")));
    const imported = await service.import("workspace-1", "Notes.docx", first);

    const saved = await service.write(
      "workspace-1",
      imported.path,
      second,
      imported.revision,
    );

    expect(saved.revision).not.toBe(imported.revision);
    await expect(
      service.write("workspace-1", imported.path, first, imported.revision),
    ).rejects.toBeInstanceOf(DocumentRevisionConflictError);
  });

  it("rejects invalid packages, duplicate names, traversal, and symlinks", async () => {
    const root = await createWorkspace();
    const outside = await createWorkspace();
    await writeFile(join(outside, "Outside.docx"), "not a docx");
    await symlink(join(outside, "Outside.docx"), join(root, "Linked.docx"));
    const service = createService(root);
    await service.create("workspace-1", "Existing");

    await expect(service.create("workspace-1", "Existing.docx")).rejects.toBeInstanceOf(
      DocumentAlreadyExistsError,
    );
    await expect(
      service.import("workspace-1", "Broken.docx", new TextEncoder().encode("broken")),
    ).rejects.toBeInstanceOf(InvalidDocumentError);
    await expect(service.read("workspace-1", "../Outside.docx")).rejects.toBeInstanceOf(
      InvalidDocumentError,
    );
    await expect(service.read("workspace-1", "Linked.docx")).rejects.toBeInstanceOf(
      InvalidDocumentError,
    );
  });

  it("does not discover documents inside ignored workspace directories", async () => {
    const root = await createWorkspace();
    const service = createService(root);
    const nested = join(root, "reference-sources");
    await mkdir(nested);
    await writeFile(join(root, ".gitignore"), "reference-sources/\n");
    await writeFile(
      join(nested, "Reference.docx"),
      bytes(await createDocx(createDocumentWithText("Reference"))),
    );
    await service.create("workspace-1", "Visible");

    await expect(service.list("workspace-1")).resolves.toMatchObject([
      { path: "Visible.docx" },
    ]);
  });
});

async function createWorkspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "heydesk-document-"));
  temporaryDirectories.push(path);
  await mkdir(join(path, ".heydesk"));
  return path;
}

function createService(root: string): DocumentService {
  return new DocumentService({
    getById: async () => ({
      id: "workspace-1",
      name: "Workspace",
      path: root,
      lastOpenedAt: new Date(0).toISOString(),
    }),
  });
}

function bytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}
