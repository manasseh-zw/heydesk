import { getServerUrl } from "../../lib/server-url";

import type { DocumentFile } from "../document/document.types";

import {
  PageRevisionConflictError,
  type Page,
  type PageSummary,
  type PageWriteOrigin,
  type QuickEditCommand,
  type QuickEditResult,
} from "./page.types";

export async function listPages(workspaceId: string): Promise<PageSummary[]> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/pages`);
}

export async function createPage(
  workspaceId: string,
  name: string,
): Promise<Page> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/pages`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deletePage(
  workspaceId: string,
  path: string,
): Promise<void> {
  const response = await fetch(
    `${getServerUrl()}/api/workspaces/${encodeURIComponent(workspaceId)}/pages/content?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );
  if (response.ok) return;
  const result: unknown = await response.json().catch(() => null);
  const message =
    result && typeof result === "object" && "error" in result
      ? String(result.error)
      : "Heydesk could not delete that page.";
  throw new Error(message);
}

export async function getPage(
  workspaceId: string,
  path: string,
): Promise<Page> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/pages/content?path=${encodeURIComponent(path)}`,
  );
}

export async function getPageIfChanged(
  workspaceId: string,
  path: string,
  revision: string,
): Promise<Page | null> {
  const response = await fetch(
    `${getServerUrl()}/api/workspaces/${encodeURIComponent(workspaceId)}/pages/content?path=${encodeURIComponent(path)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "If-None-Match": `"${revision}"`,
      },
    },
  );
  if (response.status === 304) return null;
  const result: unknown = await response.json();
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : "Heydesk could not refresh that page.";
    throw new Error(message);
  }
  return result as Page;
}

export async function savePage(
  workspaceId: string,
  path: string,
  content: string,
  expectedRevision: string,
  origin: PageWriteOrigin,
): Promise<Page> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/pages/content?path=${encodeURIComponent(path)}`,
    {
      method: "PUT",
      body: JSON.stringify({ content, expectedRevision, origin }),
    },
  );
}

export async function quickEditPage(
  workspaceId: string,
  input: {
    path: string;
    expectedRevision: string;
    selectionMarkdown: string;
    command: QuickEditCommand;
    instruction?: string;
  },
  signal?: AbortSignal,
): Promise<QuickEditResult> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/pages/quick-edits`,
    { method: "POST", body: JSON.stringify(input), signal },
  );
}

export async function convertPageToDocument(
  workspaceId: string,
  input: { path: string; expectedRevision: string },
): Promise<DocumentFile> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/pages/convert-to-document`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getServerUrl()}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    if (
      response.status === 409 &&
      result &&
      typeof result === "object" &&
      "code" in result &&
      result.code === "REVISION_CONFLICT" &&
      "current" in result
    ) {
      throw new PageRevisionConflictError(result.current as Page);
    }
    const message =
      result && typeof result === "object" && "error" in result
        ? String(result.error)
        : "Heydesk could not load that page.";
    throw new Error(message);
  }
  return result as T;
}
