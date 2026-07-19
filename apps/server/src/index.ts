import { serve } from "@hono/node-server";

import { app } from "./app";
import { codexAppServer } from "./infrastructure/codex/codex-app-server";

const server = serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://127.0.0.1:${info.port}`);
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void codexAppServer.stop().finally(() => process.exit(0));
    });
  });
}
