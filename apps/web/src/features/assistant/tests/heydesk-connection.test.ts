import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamChunk } from "@tanstack/ai";
import {
  ChatClient,
  type SubscribeConnectionAdapter,
} from "@tanstack/ai-client";

import { createHeydeskConnection } from "../heydesk-connection";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readonly url: string;
  closed = false;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(data: unknown, lastEventId = "") {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(data),
        lastEventId,
      }),
    );
  }
}

const storage = new Map<string, string>();

beforeEach(() => {
  FakeEventSource.instances = [];
  storage.clear();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Heydesk TanStack connection adapter", () => {
  it("subscribes to AG-UI events and reconnects from the persisted event ID", async () => {
    storage.set("heydesk:assistant:last-event:workspace-1", "7:0");
    const controller = new AbortController();
    const connection = createHeydeskConnection("workspace-1");
    const iterator = connection
      .subscribe(controller.signal)
      [Symbol.asyncIterator]();
    const next = iterator.next();
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toContain("after=7");

    source.emit(
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
      "8:0",
    );
    await expect(next).resolves.toEqual({
      done: false,
      value: expect.objectContaining({ type: "RUN_STARTED", runId: "run-1" }),
    });
    expect(storage.get("heydesk:assistant:last-event:workspace-1")).toBe("8:0");

    controller.abort();
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(source.closed).toBe(true);
  });

  it("starts after an atomically hydrated snapshot instead of replaying stored history", async () => {
    storage.set("heydesk:assistant:last-event:workspace-1", "19:0");
    const controller = new AbortController();
    const connection = createHeydeskConnection(
      "workspace-1",
      () => ({}),
      { kind: "document", path: "documents/Brief.docx" },
      () => 12,
    );
    const iterator = connection
      .subscribe(controller.signal)
      [Symbol.asyncIterator]();
    const next = iterator.next();
    const source = FakeEventSource.instances[0]!;

    expect(source.url).toContain("scope=document");
    expect(source.url).toContain("path=documents%2FBrief.docx");
    expect(source.url).toContain("after=12");
    expect(source.url).not.toContain("after=19");

    source.emit(
      { type: "RUN_STARTED", threadId: "thread-2", runId: "run-2" },
      "13:0",
    );
    await expect(next).resolves.toEqual({
      done: false,
      value: expect.objectContaining({ type: "RUN_STARTED", runId: "run-2" }),
    });

    controller.abort();
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("sends only the newest user text without cancelling the run on navigation", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify({ ok: true }), {
          status: init?.method === "POST" ? 201 : 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    const connection = createHeydeskConnection("workspace-1");
    const controller = new AbortController();
    await connection.send(
      [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", content: "old" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", content: "answer" }],
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", content: "new request" }],
        },
      ],
      undefined,
      controller.signal,
      { threadId: "workspace-1", runId: "run-1" },
    );

    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      runId: "run-1",
      message: "new request",
    });
    controller.abort();
    expect(requests).toHaveLength(1);

    await connection.interruptActiveRun();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toContain("/runs/run-1/interrupt");
  });

  it("attaches the exact page context and turn preferences to the next send", async () => {
    let requestBody: unknown;
    vi.stubGlobal(
      "fetch",
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    const connection = createHeydeskConnection(
      "workspace-1",
      () => ({
        context: {
          kind: "page",
          path: "pages/Notes.md",
          expectedRevision: "a".repeat(64),
        },
        preferences: {
          model: "gpt-5.6-luna",
          effort: "low",
          serviceTier: "fast",
        },
      }),
      { kind: "page", path: "pages/Notes.md" },
    );

    await connection.send(
      [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", content: "Improve this page" }],
        },
      ],
      undefined,
      undefined,
      { threadId: "workspace-1", runId: "run-page" },
    );

    expect(requestBody).toMatchObject({
      runId: "run-page",
      message: "Improve this page",
      scope: { kind: "page", path: "pages/Notes.md" },
      context: {
        path: "pages/Notes.md",
        expectedRevision: "a".repeat(64),
      },
      preferences: {
        model: "gpt-5.6-luna",
        effort: "low",
        serviceTier: "fast",
      },
    });
  });

  it("reconciles a fake AG-UI stream into TanStack UIMessage parts", async () => {
    const stream = createFakeStream();
    const customEvents: string[] = [];
    const client = new ChatClient({
      connection: stream.connection,
      onCustomEvent: (name) => customEvents.push(name),
    });

    await client.sendMessage("Hello Heydesk");
    const messages = client.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "user",
        parts: [
          expect.objectContaining({ type: "text", content: "Hello Heydesk" }),
        ],
      }),
    );
    expect(messages[1]).toEqual(
      expect.objectContaining({
        role: "assistant",
        parts: [expect.objectContaining({ type: "text", content: "Done" })],
      }),
    );
    expect(customEvents).toContain("heydesk:plan");
    client.dispose();
  });
});

function createFakeStream(): { connection: SubscribeConnectionAdapter } {
  const chunks: StreamChunk[] = [];
  let wake: (() => void) | undefined;
  const push = (chunk: StreamChunk) => {
    chunks.push(chunk);
    wake?.();
    wake = undefined;
  };
  return {
    connection: {
      async *subscribe(signal) {
        while (!signal?.aborted) {
          if (chunks.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve;
              signal?.addEventListener("abort", () => resolve(), {
                once: true,
              });
            });
          }
          while (chunks.length > 0) yield chunks.shift()!;
        }
      },
      async send(_messages, _data, _signal, context) {
        const runId = context!.runId;
        const threadId = context!.threadId;
        push({ type: "RUN_STARTED", runId, threadId } as StreamChunk);
        push({
          type: "TEXT_MESSAGE_START",
          messageId: "assistant-1",
          role: "assistant",
        } as StreamChunk);
        push({
          type: "TEXT_MESSAGE_CONTENT",
          messageId: "assistant-1",
          delta: "Done",
        } as StreamChunk);
        push({
          type: "TEXT_MESSAGE_END",
          messageId: "assistant-1",
        } as StreamChunk);
        push({
          type: "CUSTOM",
          name: "heydesk:plan",
          value: [],
        } as StreamChunk);
        push({ type: "RUN_FINISHED", runId, threadId } as StreamChunk);
      },
    },
  };
}
