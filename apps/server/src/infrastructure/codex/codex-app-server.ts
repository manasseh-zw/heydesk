import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { rpcEnvelopeSchema } from "./codex.schemas";
import { resolveCodexBinary } from "./codex-binary";
import {
  CodexProcessError,
  CodexRpcError,
  type CodexNotification,
  type CodexServerRequestResponder,
  type JsonRpcId,
} from "./codex.types";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OVERLOAD_RETRIES = 3;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
};

type CodexEvents = {
  notification: [CodexNotification];
  request: [CodexServerRequestResponder];
  exit: [Error];
};

export class CodexAppServer extends EventEmitter<CodexEvents> {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private buffer = Buffer.alloc(0);
  private requestSequence = 0;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();

  constructor(private readonly explicitBinary?: string) {
    super();
  }

  async request<T>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    await this.ensureStarted();
    return this.requestWithRetry<T>(method, params, timeoutMs, 0);
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.ensureStarted();
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.starting = null;
    if (!child) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.child) return;
    if (!this.starting) {
      this.starting = this.start().catch((error) => {
        this.starting = null;
        throw error;
      });
    }
    await this.starting;
  }

  private async start(): Promise<void> {
    const binary = this.explicitBinary ?? (await resolveCodexBinary());
    const child = spawn(binary, ["app-server", "--listen", "stdio://"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.receive(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      console.error(
        JSON.stringify({
          source: "codex",
          level: "warn",
          message: chunk.toString("utf8").trim(),
        }),
      );
    });
    child.once("error", (error) =>
      this.handleExit(new CodexProcessError("Codex failed to start.", error)),
    );
    child.once("exit", (code, signal) => {
      this.handleExit(
        new CodexProcessError(
          `Codex app-server exited (${code ?? signal ?? "unknown"}).`,
        ),
      );
    });

    await this.rawRequest("initialize", {
      clientInfo: { name: "heydesk", title: "Heydesk", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.write({ method: "initialized" });
  }

  private async requestWithRetry<T>(
    method: string,
    params: unknown,
    timeoutMs: number,
    attempt: number,
  ): Promise<T> {
    try {
      return (await this.rawRequest(method, params, timeoutMs)) as T;
    } catch (error) {
      if (
        error instanceof CodexRpcError &&
        error.code === -32001 &&
        attempt < MAX_OVERLOAD_RETRIES
      ) {
        await delay(150 * 2 ** attempt);
        return this.requestWithRetry(method, params, timeoutMs, attempt + 1);
      }
      throw error;
    }
  }

  private rawRequest(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<unknown> {
    const id = `${++this.requestSequence}:${randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexProcessError(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.byteLength > MAX_FRAME_BYTES) {
      this.handleExit(
        new CodexProcessError(
          "Codex emitted a frame larger than Heydesk accepts.",
        ),
      );
      this.child?.kill("SIGKILL");
      return;
    }

    let newline = this.buffer.indexOf(10);
    while (newline >= 0) {
      const frame = this.buffer.subarray(0, newline).toString("utf8").trim();
      this.buffer = this.buffer.subarray(newline + 1);
      if (frame) this.handleFrame(frame);
      newline = this.buffer.indexOf(10);
    }
  }

  private handleFrame(frame: string): void {
    let value: unknown;
    try {
      value = JSON.parse(frame);
    } catch {
      console.error(
        JSON.stringify({
          source: "codex",
          level: "error",
          message: "Invalid JSONL frame",
        }),
      );
      return;
    }
    const parsed = rpcEnvelopeSchema.safeParse(value);
    if (!parsed.success) return;
    const message = parsed.data;

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new CodexRpcError(
            message.error.code,
            message.error.message,
            message.error.data,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method && message.id !== undefined) {
      const id = message.id;
      this.emit("request", {
        request: { id, method: message.method, params: message.params },
        resolve: (result) => this.write({ id, result }),
        reject: (code, errorMessage, data) =>
          this.write({
            id,
            error: {
              code,
              message: errorMessage,
              ...(data === undefined ? {} : { data }),
            },
          }),
      });
      return;
    }

    if (message.method) {
      this.emit("notification", {
        method: message.method,
        params: message.params,
      });
    }
  }

  private write(value: unknown): void {
    const child = this.child;
    if (!child?.stdin.writable)
      throw new CodexProcessError("Codex app-server is not writable.");
    child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  private handleExit(error: Error): void {
    if (!this.child && !this.starting) return;
    this.child = null;
    this.starting = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit("exit", error);
  }
}

export const codexAppServer = new CodexAppServer();

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
