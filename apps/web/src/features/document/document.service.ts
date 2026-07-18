import { env } from "@heydesk/env/web";

import type { DocumentFile, DocumentSummary, LoadedDocument } from "./document.types";
import { DocumentRevisionConflictError } from "./document.types";

const docxContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents`);
}

export async function createDocument(
  workspaceId: string,
  name: string,
): Promise<DocumentFile> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function importDocument(
  workspaceId: string,
  file: File,
): Promise<DocumentFile> {
  return requestJson(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/documents/import?name=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "Content-Type": docxContentType },
      body: file,
    },
  );
}

export async function getDocument(
  workspaceId: string,
  path: string,
): Promise<LoadedDocument> {
  const response = await fetch(documentContentUrl(workspaceId, path));
  if (!response.ok) throw await responseError(response);
  const revision = parseEtag(response.headers.get("ETag"));
  if (!revision) throw new Error("Heydesk did not receive a document revision.");
  const buffer = await response.arrayBuffer();
  return {
    path,
    name: documentName(path),
    size: buffer.byteLength,
    updatedAt: new Date().toISOString(),
    revision,
    buffer,
  };
}

export async function getDocumentIfChanged(
  workspaceId: string,
  path: string,
  revision: string,
): Promise<LoadedDocument | null> {
  const response = await fetch(documentContentUrl(workspaceId, path), {
    headers: { "If-None-Match": `"${revision}"` },
  });
  if (response.status === 304) return null;
  if (!response.ok) throw await responseError(response);
  const nextRevision = parseEtag(response.headers.get("ETag"));
  if (!nextRevision) throw new Error("Heydesk did not receive a document revision.");
  const buffer = await response.arrayBuffer();
  return {
    path,
    name: documentName(path),
    size: buffer.byteLength,
    updatedAt: new Date().toISOString(),
    revision: nextRevision,
    buffer,
  };
}

export async function saveDocument(
  workspaceId: string,
  path: string,
  buffer: ArrayBuffer,
  expectedRevision: string,
): Promise<DocumentFile> {
  const response = await fetch(documentContentUrl(workspaceId, path), {
    method: "PUT",
    headers: { "Content-Type": docxContentType, "If-Match": `"${expectedRevision}"` },
    body: buffer,
  });
  const result: unknown = await response.json();
  if (
    response.status === 409 &&
    result &&
    typeof result === "object" &&
    "code" in result &&
    result.code === "REVISION_CONFLICT" &&
    "current" in result
  ) {
    throw new DocumentRevisionConflictError(result.current as DocumentFile);
  }
  if (!response.ok) throw resultError(result, "Heydesk could not save that document.");
  return result as DocumentFile;
}

function documentContentUrl(workspaceId: string, path: string): string {
  return `${env.VITE_SERVER_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/documents/content?path=${encodeURIComponent(path)}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.VITE_SERVER_URL}${path}`, init);
  const result: unknown = await response.json();
  if (!response.ok) throw resultError(result, "Heydesk could not complete that document request.");
  return result as T;
}

async function responseError(response: Response): Promise<Error> {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  return resultError(result, "Heydesk could not load that document.");
}

function resultError(result: unknown, fallback: string): Error {
  return new Error(
    result && typeof result === "object" && "error" in result
      ? String(result.error)
      : fallback,
  );
}

function parseEtag(value: string | null): string | null {
  return value?.replaceAll('"', "") ?? null;
}

function documentName(path: string): string {
  return (path.split("/").at(-1) ?? path).replace(/\.docx$/i, "");
}
