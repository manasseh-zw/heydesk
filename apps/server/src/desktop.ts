import { serve } from "@hono/node-server";

import { app } from "./app";
import { codexAppServer } from "./infrastructure/codex/codex-app-server";
import { createDesktopFetch } from "./infrastructure/desktop/desktop-http";

type DesktopParentPort = {
  on: (event: "message", listener: (event: { data: unknown }) => void) => void;
  postMessage: (message: unknown) => void;
};

type DesktopProcess = NodeJS.Process & {
  parentPort?: DesktopParentPort;
};

const hostname = "127.0.0.1";
const rendererDirectory = process.env.HEYDESK_RENDERER_DIR;
const bootstrapToken = process.env.HEYDESK_BOOTSTRAP_TOKEN;
const parentPort = (process as DesktopProcess).parentPort;
const desktopFetch = createDesktopFetch({
  apiFetch: app.fetch,
  rendererRoot: rendererDirectory,
  sessionToken: bootstrapToken,
});

const server = serve(
  {
    fetch: desktopFetch,
    hostname,
    port: 0,
  },
  (info) => {
    const origin = `http://${hostname}:${info.port}`;
    parentPort?.postMessage({ type: "server-ready", origin });
    if (!parentPort) {
      console.log(`Heydesk desktop server is running on ${origin}`);
    }
  },
);

let stopping = false;

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((complete) => server.close(() => complete()));
  await codexAppServer.stop();
}

parentPort?.on("message", (event) => {
  if (isShutdownMessage(event.data)) {
    void stop().finally(() => process.exit(0));
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stop().finally(() => process.exit(0));
  });
}

function isShutdownMessage(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "shutdown"
  );
}
