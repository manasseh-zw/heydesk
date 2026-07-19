import { timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, normalize, relative, resolve } from "node:path";

type DesktopFetchOptions = {
  apiFetch: (request: Request) => Response | Promise<Response>;
  rendererRoot?: string;
  sessionToken?: string;
};

export function createDesktopFetch(options: DesktopFetchOptions) {
  return (request: Request) => desktopFetch(request, options);
}

async function desktopFetch(
  request: Request,
  { apiFetch, rendererRoot, sessionToken }: DesktopFetchOptions,
): Promise<Response> {
  const url = new URL(request.url);
  if (rendererRoot && url.pathname === "/desktop/bootstrap") {
    if (
      !sessionToken ||
      !tokensMatch(url.searchParams.get("token"), sessionToken)
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": `heydesk_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`,
      },
    });
  }
  if (
    rendererRoot &&
    url.pathname.startsWith("/api") &&
    (!sessionToken || !hasSessionCookie(request, sessionToken))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (
    !rendererRoot ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/api" ||
    url.pathname === "/health"
  ) {
    return apiFetch(request);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const requestedPath = decodeURIComponent(url.pathname);
  const assetPath =
    requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const response = await readStaticFile(rendererRoot, assetPath, request.method);
  if (response) return response;

  return (
    (await readStaticFile(rendererRoot, "index.html", request.method)) ??
    new Response("Heydesk renderer not found", { status: 404 })
  );
}

async function readStaticFile(
  rendererRoot: string,
  requestedPath: string,
  method: string,
): Promise<Response | null> {
  const root = resolve(rendererRoot);
  const filePath = resolve(root, normalize(requestedPath));
  const relativePath = relative(root, filePath);
  if (relativePath.startsWith("..") || relativePath.includes("\0")) return null;

  try {
    const details = await stat(filePath);
    if (!details.isFile()) return null;
    return new Response(method === "HEAD" ? null : await readFile(filePath), {
      headers: {
        "Cache-Control": filePath.endsWith("index.html")
          ? "no-cache"
          : "public, max-age=31536000, immutable",
        "Content-Length": String(details.size),
        "Content-Security-Policy":
          "default-src 'self'; connect-src 'self'; font-src 'self' data:; img-src 'self' blob: data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:",
        "Content-Type": contentType(filePath),
      },
    });
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function hasSessionCookie(request: Request, expectedToken: string): boolean {
  const cookies = request.headers.get("Cookie")?.split(";") ?? [];
  const value = cookies
    .map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === "heydesk_session")?.[1];
  return tokensMatch(value ?? null, expectedToken);
}

function tokensMatch(value: string | null, expected: string): boolean {
  if (!value) return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".wasm":
      return "application/wasm";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["ENOENT", "ENOTDIR"].includes(
      String((error as NodeJS.ErrnoException).code),
    )
  );
}
