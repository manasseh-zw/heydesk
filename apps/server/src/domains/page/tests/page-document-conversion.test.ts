import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import { DocumentService } from "../../document/document.service";
import {
  PageDocumentConversionService,
  UnsupportedPageConversionError,
} from "../page-document-conversion.service";
import { PageRevisionConflictError, PageService } from "../page.service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("PageDocumentConversionService", () => {
  it("converts the current Markdown revision into a durable Word document", async () => {
    const root = await createWorkspace();
    await writeFile(
      join(root, "pages", "Project brief.md"),
      [
        "# Project brief",
        "",
        "A **durable**, *editable*, ++underlined++, ~~revised~~, and ==highlighted== result with a [reference](https://example.com).",
        "",
        "## Next steps",
        "",
        "### Review",
        "",
        "- Review",
        "- Share",
      ].join("\n"),
    );
    const { documents, pages, service } = createServices(root);
    const page = await pages.read("workspace-1", "pages/Project brief.md");

    const converted = await service.convert("workspace-1", {
      path: page.path,
      expectedRevision: page.revision,
    });
    const content = await documents.read("workspace-1", converted.path);
    const archive = await JSZip.loadAsync(arrayBuffer(content.buffer));
    const documentXml = await archive.file("word/document.xml")?.async("text");
    const stylesXml = await archive.file("word/styles.xml")?.async("text");

    expect(converted).toMatchObject({
      name: "Project brief",
      path: "documents/Project brief.docx",
    });
    expect(documentXml).toContain("Project brief");
    expect(documentXml).toContain("durable");
    expect(documentXml).toContain("Next steps");
    expect(documentXml).toContain('w:pStyle w:val="Heading1"');
    expect(documentXml).toContain('w:pStyle w:val="Heading2"');
    expect(documentXml).toContain('w:pStyle w:val="Heading3"');
    expect(documentXml).not.toMatch(/w:pStyle w:val="[1-6]"/);
    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain("<w:i/>");
    expect(documentXml).toContain('<w:u w:val="single"/>');
    expect(documentXml).toContain("<w:strike/>");
    expect(documentXml).toContain('<w:highlight w:val="yellow"/>');
    expect(documentXml).toContain("<w:hyperlink");
    expect(documentXml).toContain("<w:numPr>");
    expect(stylesXml?.match(/w:styleId="Heading1"/g)).toHaveLength(1);
    expect(stylesXml).toContain('w:ascii="Georgia"');
    expect(stylesXml).toContain('w:ascii="Calibri"');
  });

  it("uses an available name without overwriting an earlier conversion", async () => {
    const root = await createWorkspace();
    await writeFile(join(root, "pages", "Notes.md"), "# Notes\n\nKeep me.");
    const { pages, service } = createServices(root);
    const page = await pages.read("workspace-1", "pages/Notes.md");

    await expect(
      service.convert("workspace-1", {
        path: page.path,
        expectedRevision: page.revision,
      }),
    ).resolves.toMatchObject({ path: "documents/Notes.docx" });
    await expect(
      service.convert("workspace-1", {
        path: page.path,
        expectedRevision: page.revision,
      }),
    ).resolves.toMatchObject({ path: "documents/Notes 2.docx" });
  });

  it("rejects stale revisions and MDX pages", async () => {
    const root = await createWorkspace();
    await writeFile(join(root, "pages", "Stale.md"), "# Stale");
    await writeFile(join(root, "pages", "Component.mdx"), "<Callout />");
    const { pages, service } = createServices(root);
    const page = await pages.read("workspace-1", "pages/Stale.md");
    const mdx = await pages.read("workspace-1", "pages/Component.mdx");

    await expect(
      service.convert("workspace-1", {
        path: page.path,
        expectedRevision: "0".repeat(64),
      }),
    ).rejects.toBeInstanceOf(PageRevisionConflictError);
    await expect(
      service.convert("workspace-1", {
        path: mdx.path,
        expectedRevision: mdx.revision,
      }),
    ).rejects.toBeInstanceOf(UnsupportedPageConversionError);
  });
});

async function createWorkspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "heydesk-page-conversion-"));
  temporaryDirectories.push(path);
  await mkdir(join(path, "pages"));
  await mkdir(join(path, "documents"));
  return path;
}

function createServices(root: string) {
  const workspaces = {
    getById: async () => ({
      id: "workspace-1",
      name: "Workspace",
      path: root,
      lastOpenedAt: new Date(0).toISOString(),
    }),
  };
  const pages = new PageService(workspaces);
  const documents = new DocumentService(workspaces);
  return {
    documents,
    pages,
    service: new PageDocumentConversionService(pages, documents),
  };
}

function arrayBuffer(buffer: Uint8Array): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}
