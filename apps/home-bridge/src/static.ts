/** Static file serving for the built web app, with SPA fallback and cache headers. */
import { createReadStream, statSync, type Stats } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function statFile(p: string): Stats | null {
  try {
    const s = statSync(p);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

/** Hashed Vite assets are immutable; everything else is revalidated. */
export function cacheControl(urlPath: string): string {
  return urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
}

export function resolveStatic(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const base = resolve(root);
  const full = resolve(join(base, normalize(decoded)));
  return full === base || full.startsWith(base + sep) ? full : null;
}

export function serveStatic(req: IncomingMessage, res: ServerResponse, root: string, urlPath: string): void {
  const send = (file: string, st: Stats, cache: string) => {
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = {
      "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": cache,
      etag,
      "last-modified": st.mtime.toUTCString(),
      "x-content-type-options": "nosniff",
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, { ...headers, "content-length": st.size });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  };

  let file = resolveStatic(root, urlPath);
  if (file && statFile(join(file, "index.html")) && urlPath.endsWith("/")) file = join(file, "index.html");
  const st = file ? statFile(file) : null;
  if (file && st) return send(file, st, cacheControl(urlPath));

  // SPA fallback: extension-less paths (client routes) get index.html.
  const accept = String(req.headers.accept ?? "");
  if (!extname(urlPath) || accept.includes("text/html")) {
    const index = join(root, "index.html");
    const ist = statFile(index);
    if (ist) return send(index, ist, "no-cache");
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Appli web non construite (${root} absent) : lancer « pnpm --filter @appart3d/web build ».\n`);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Introuvable\n");
}
