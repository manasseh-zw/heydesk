import { serve } from "@hono/node-server";

import { app } from "./app";
import { codexAppServer } from "./infrastructure/codex/codex-app-server";

const server = serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void codexAppServer.stop().finally(() => process.exit(0));
    });
  });
}
