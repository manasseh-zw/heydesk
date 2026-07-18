import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CodexAppServer } from "../codex-app-server";
import { CodexProcessError } from "../codex.types";

const clients: CodexAppServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()));
});

describe("Codex app-server transport", () => {
  it("frames JSONL, correlates responses, routes notifications, and retries overload", async () => {
    const binary = await createFakeCodex();
    const client = new CodexAppServer(binary);
    clients.push(client);
    const notifications: string[] = [];
    client.on("notification", (notification) =>
      notifications.push(notification.method),
    );

    await expect(client.request("echo", { value: "hello" })).resolves.toEqual({
      value: "hello",
    });
    await expect(client.request("overload")).resolves.toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notifications).toContain("test/notification");
  });

  it("times out unanswered requests", async () => {
    const client = new CodexAppServer(await createFakeCodex());
    clients.push(client);
    await expect(client.request("hang", undefined, 20)).rejects.toBeInstanceOf(
      CodexProcessError,
    );
  });

  it("routes notifications to only the matching thread collector", async () => {
    const client = new CodexAppServer(await createFakeCodex());
    clients.push(client);
    const first: string[] = [];
    const second: string[] = [];
    const unsubscribeFirst = client.subscribeToThread("thread-1", (event) =>
      first.push(event.method),
    );
    client.subscribeToThread("thread-2", (event) => second.push(event.method));

    await client.request("thread-notifications");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(first).toEqual(["turn/started"]);
    expect(second).toEqual(["turn/completed"]);
    unsubscribeFirst();
  });
});

async function createFakeCodex(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "heydesk-fake-codex-"));
  const binary = join(directory, "codex");
  await writeFile(
    binary,
    `#!/usr/bin/env node
const readline = require("node:readline");
let overloaded = false;
const input = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  if (message.method === "initialize") {
    send({ id: message.id, result: { serverInfo: { name: "fake", version: "1" } } });
    send({ method: "test/notification", params: { ready: true } });
    return;
  }
  if (message.method === "hang") return;
  if (message.method === "overload" && !overloaded) {
    overloaded = true;
    send({ id: message.id, error: { code: -32001, message: "overloaded" } });
    return;
  }
  if (message.method === "thread-notifications") {
    send({ method: "turn/started", params: { threadId: "thread-1" } });
    send({ method: "turn/completed", params: { thread: { id: "thread-2" } } });
    send({ id: message.id, result: { ok: true } });
    return;
  }
  send({ id: message.id, result: message.method === "echo" ? message.params : { ok: true } });
});
`,
    "utf8",
  );
  await chmod(binary, 0o755);
  return binary;
}
