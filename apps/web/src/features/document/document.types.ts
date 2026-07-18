export type DocumentSummary = {
  path: string;
  name: string;
  size: number;
  updatedAt: string;
};

export type DocumentFile = DocumentSummary & {
  revision: string;
};

export type LoadedDocument = DocumentFile & {
  buffer: ArrayBuffer;
};

export class DocumentRevisionConflictError extends Error {
  constructor(readonly current: DocumentFile) {
    super("This document changed on disk.");
  }
}
