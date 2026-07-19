import { convertMarkdownToBuffer } from "@mohtasham/md-to-docx";

import type { DocumentFile } from "../document/document.types";
import {
  DocumentAlreadyExistsError,
  type DocumentService,
} from "../document/document.service";
import {
  normalizePageDocumentForEditor,
  pageDocumentStyle,
  translatePageMarkdownForWord,
} from "./page-document-translation";
import { PageRevisionConflictError, type PageService } from "./page.service";

const maximumNameAttempts = 100;

export class UnsupportedPageConversionError extends Error {}
export class PageDocumentConversionError extends Error {}

export class PageDocumentConversionService {
  constructor(
    private readonly pages: Pick<PageService, "read">,
    private readonly documents: Pick<DocumentService, "import">,
  ) {}

  async convert(
    workspaceId: string,
    input: { path: string; expectedRevision: string },
    signal?: AbortSignal,
  ): Promise<DocumentFile> {
    const page = await this.pages.read(workspaceId, input.path);
    if (page.revision !== input.expectedRevision) {
      throw new PageRevisionConflictError(page);
    }
    if (page.syntax !== "markdown") {
      throw new UnsupportedPageConversionError(
        "Only Markdown pages can be opened as Word documents.",
      );
    }

    let converted: Buffer;
    try {
      const generated = await convertMarkdownToBuffer(
        translatePageMarkdownForWord(page.content),
        {
          documentType: "document",
          imageHandling: { remote: { enabled: false } },
          maxInputLength: 2 * 1024 * 1024,
          signal,
          style: pageDocumentStyle,
        },
      );
      converted = Buffer.from(await normalizePageDocumentForEditor(generated));
    } catch (error) {
      throw new PageDocumentConversionError(
        "Heydesk could not convert that page to Word.",
        { cause: error },
      );
    }

    for (let attempt = 1; attempt <= maximumNameAttempts; attempt += 1) {
      const name = attempt === 1 ? page.name : `${page.name} ${attempt}`;
      try {
        return await this.documents.import(
          workspaceId,
          name,
          new Uint8Array(converted),
        );
      } catch (error) {
        if (error instanceof DocumentAlreadyExistsError) continue;
        throw error;
      }
    }

    throw new PageDocumentConversionError(
      "Heydesk could not choose an available Word document name.",
    );
  }
}
