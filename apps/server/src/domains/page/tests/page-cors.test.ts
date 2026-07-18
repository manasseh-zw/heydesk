import { describe, expect, it } from "vitest";

import { app } from "../../../app";

describe("page browser boundary", () => {
  it("allows revision-aware PUT saves through CORS", async () => {
    const response = await app.request(
      "/api/workspaces/workspace-1/pages/content?path=Notes.md",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost",
          "Access-Control-Request-Method": "PUT",
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "PUT",
    );
  });
});
