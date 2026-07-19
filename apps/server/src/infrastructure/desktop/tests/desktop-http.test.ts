import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDesktopFetch } from "../desktop-http";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { force: true, recursive: true }),
    ),
  );
});

describe("desktop HTTP boundary", () => {
  it("exchanges a valid bootstrap token for a private session cookie", async () => {
    const rendererRoot = await createRenderer();
    const fetch = createDesktopFetch({
      apiFetch: () => new Response("api"),
      rendererRoot,
      sessionToken: "secret",
    });

    const invalid = await fetch(
      new Request("http://127.0.0.1/desktop/bootstrap?token=wrong"),
    );
    expect(invalid.status).toBe(401);

    const valid = await fetch(
      new Request("http://127.0.0.1/desktop/bootstrap?token=secret"),
    );
    expect(valid.status).toBe(302);
    expect(valid.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(valid.headers.get("Set-Cookie")).toContain("SameSite=Strict");
  });

  it("rejects API calls without the desktop session", async () => {
    const rendererRoot = await createRenderer();
    const fetch = createDesktopFetch({
      apiFetch: () => Response.json({ ok: true }),
      rendererRoot,
      sessionToken: "secret",
    });

    expect(
      (await fetch(new Request("http://127.0.0.1/api/workspaces"))).status,
    ).toBe(401);

    const response = await fetch(
      new Request("http://127.0.0.1/api/workspaces", {
        headers: { Cookie: "heydesk_session=secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("serves the packaged renderer with a restrictive content policy", async () => {
    const rendererRoot = await createRenderer();
    const fetch = createDesktopFetch({
      apiFetch: () => new Response("api"),
      rendererRoot,
      sessionToken: "secret",
    });

    const response = await fetch(new Request("http://127.0.0.1/"));
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("<html>Heydesk</html>");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "object-src 'none'",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});

async function createRenderer(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "heydesk-desktop-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "index.html"), "<html>Heydesk</html>");
  return directory;
}
