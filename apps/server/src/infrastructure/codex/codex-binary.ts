import { access } from "node:fs/promises";

import { env } from "@heydesk/env/server";

import { CodexMissingError } from "./codex.types";

const CHATGPT_CANDIDATES = [
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/Applications/ChatGPT.app/Contents/Resources/bin/codex",
  `${process.env.HOME ?? ""}/Applications/ChatGPT.app/Contents/Resources/codex`,
];

export async function resolveCodexBinary(): Promise<string> {
  if (env.CODEX_BIN) {
    await assertExecutable(env.CODEX_BIN);
    return env.CODEX_BIN;
  }

  for (const candidate of CHATGPT_CANDIDATES) {
    if (!candidate.startsWith("/")) continue;
    try {
      await assertExecutable(candidate);
      return candidate;
    } catch {
      // Keep checking known bundled locations before falling back to PATH.
    }
  }

  if (await isOnPath("codex")) return "codex";
  throw new CodexMissingError();
}

async function assertExecutable(path: string): Promise<void> {
  await access(path);
}

async function isOnPath(command: string): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/env", ["which", command], {
      stdio: "ignore",
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}
