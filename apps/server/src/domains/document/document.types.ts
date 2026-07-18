export type DocumentSummary = {
  path: string;
  name: string;
  size: number;
  updatedAt: string;
};

export type DocumentFile = DocumentSummary & {
  revision: string;
};

export type DocumentContent = DocumentFile & {
  buffer: Uint8Array;
};
