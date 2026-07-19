import { lstat, realpath } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import type { AssistantFileChange } from "./assistant.types";
import { workspacePagesDirectory } from "../workspace/workspace.paths";

export async function canAutoAcceptFileChanges(
  workspacePath: string,
  changes: AssistantFileChange[],
): Promise<boolean> {
  if (changes.length === 0) return false;
  const canonicalWorkspace = await realpath(workspacePath);
  for (const change of changes) {
    if (
      change.kind === "delete" ||
      change.kind === "move" ||
      change.kind === "unknown"
    ) {
      return false;
    }
    const target = isAbsolute(change.path)
      ? resolve(change.path)
      : resolve(canonicalWorkspace, change.path);
    if (!isInside(canonicalWorkspace, target)) return false;

    const relativePath = relative(canonicalWorkspace, target);
    const segments = relativePath.split(sep);
    if (
      segments[0] !== workspacePagesDirectory ||
      segments.length < 2 ||
      segments.some((segment) => segment.startsWith(".")) ||
      segments.includes(".heydesk") ||
      ![".md", ".mdx"].includes(extname(target).toLowerCase())
    ) {
      return false;
    }

    if (await pathOrParentIsSymlink(canonicalWorkspace, target)) return false;
  }
  return true;
}

function isInside(root: string, target: string): boolean {
  const value = relative(root, target);
  return (
    value !== "" &&
    !value.startsWith(`..${sep}`) &&
    value !== ".." &&
    !isAbsolute(value)
  );
}

async function pathOrParentIsSymlink(
  root: string,
  target: string,
): Promise<boolean> {
  let current = target;
  while (isInside(root, current)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) return true;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    current = dirname(current);
  }
  return false;
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
