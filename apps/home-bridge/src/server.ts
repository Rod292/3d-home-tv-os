/** HTTP server: /api/home* + POST /api/pair (contract in @appart3d/home), /pair, /healthz, static web app. */
import type { DeviceAction, PairResponse } from "@appart3d/home";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { authCookie, isAuthorized, RateLimiter, safeEqual } from "./auth.ts";
import { DEFAULT_SHARED_DIR, DEFAULT_WEB_DIST, loadConfig, updateConfig, type BridgeConfig } from "./config.ts";
import type { Hub } from "./hub.ts";
import { errMsg, logger } from "./log.ts";
import { SSE_PING, SSE_RETRY, sseFrame } from "./sse.ts";
import { serveStatic } from "./static.ts";
import { HttpError } from "./types.ts";

const log = logger("http");

export interface ServerState {
  config: BridgeConfig;
  /** Config file path (pair codes are re-read from disk so `pnpm pair --rotate` applies live). */
  configPath: string;
}

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(data),
    ...extra,
  });
  res.end(data);
}

function html(res: ServerResponse, status: number, title: string, body: string, extra: Record<string, string> = {}): void {
  const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui;background:#f6f1e8;color:#3b3a36;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#fff;padding:2rem;border-radius:16px;box-shadow:0 4px 20px #0001;max-width:22rem;text-align:center}input{font-size:1.6rem;letter-spacing:.3em;width:9ch;text-align:center;padding:.4rem;border-radius:8px;border:1px solid #ccc}button{margin-top:1rem;font-size:1rem;padding:.6rem 1.2rem;border:0;border-radius:8px;background:#c8674a;color:#fff}</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra });
  res.end(page);
}

const PAIR_FORM = `<form method="get" action="/pair"><p>Code affiché par <code>pnpm pair</code> sur le Mac :</p><input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autofocus required><br><button>Associer</button></form>`;

async function readJson(req: IncomingMessage, limit = 16 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > limit) throw new HttpError(413, "corps trop gros");
    chunks.push(c);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON invalide");
  }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseAction(body: unknown): DeviceAction {
  const b = (body ?? {}) as Record<string, unknown>;
  switch (b.type) {
    case "toggle":
      return { type: "toggle" };
    case "power":
      if (typeof b.on === "boolean") return { type: "power", on: b.on };
      break;
    case "fanLight":
      if (typeof b.on === "boolean") return { type: "fanLight", on: b.on };
      break;
    case "brightness":
    case "speed":
    case "volume":
      if (isNum(b.value) && b.value >= 0 && b.value <= 100) return { type: b.type, value: b.value };
      break;
    case "kelvin":
      if (isNum(b.value) && b.value >= 1000 && b.value <= 10000) return { type: "kelvin", value: b.value };
      break;
    case "color":
      if (typeof b.hex === "string" && /^#?[0-9a-f]{6}$/i.test(b.hex)) return { type: "color", hex: b.hex.startsWith("#") ? b.hex : `#${b.hex}` };
      break;
    case "volumeStep":
      if (b.delta === 1 || b.delta === -1) return { type: "volumeStep", delta: b.delta };
      break;
    case "button":
      if (typeof b.name === "string" && b.name.length > 0 && b.name.length <= 64) return { type: "button", name: b.name };
      break;
    case "ambilight": {
      const out: Extract<DeviceAction, { type: "ambilight" }> = { type: "ambilight" };
      if (b.on !== undefined) {
        if (typeof b.on !== "boolean") break;
        out.on = b.on;
      }
      if (b.hex !== undefined) {
        if (typeof b.hex !== "string" || !/^#?[0-9a-f]{6}$/i.test(b.hex)) break;
        out.hex = b.hex.startsWith("#") ? b.hex : `#${b.hex}`;
      }
      if (b.brightness !== undefined) {
        if (!isNum(b.brightness) || b.brightness < 1 || b.brightness > 100) break;
        out.brightness = b.brightness;
      }
      if (b.effect !== undefined) {
        if (typeof b.effect !== "string" || !b.effect || b.effect.length > 80) break;
        out.effect = b.effect;
      }
      return out;
    }
    case "media":
      if (b.command === "play" || b.command === "pause" || b.command === "playPause" || b.command === "next" || b.command === "previous")
        return { type: "media", command: b.command };
      break;
  }
  throw new HttpError(400, "action invalide");
}

/** PUT /api/home/order body → device ids to store (unknown ids and duplicates dropped). */
export function parseOrder(body: unknown, known: ReadonlySet<string>): string[] {
  const order = (body as { order?: unknown } | null)?.order;
  if (!Array.isArray(order) || order.length > 200 || !order.every((x) => typeof x === "string" && x.length > 0 && x.length <= 200))
    throw new HttpError(400, "order doit être une liste d'identifiants (200 au plus)");
  return [...new Set(order as string[])].filter((id) => known.has(id));
}

function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "?";
}

export function createBridgeServer(hub: Hub, state: ServerState): Server {
  const limiter = new RateLimiter();

  function cors(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    if (origin && state.config.corsOrigins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
    }
  }

  /** Pair code from disk (so `pnpm pair --rotate` applies live), falling back to the in-memory config. */
  function currentConfig(): BridgeConfig {
    try {
      state.config = loadConfig(state.configPath).config;
    } catch {
      /* keep the in-memory config */
    }
    return state.config;
  }

  /** Native apps: POST /api/pair {code, deviceName?} → {token, home}. No auth; shares the /pair limiter. */
  async function handleApiPair(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const key = clientKey(req);
    const rl = limiter.attempt(key);
    if (!rl.ok) {
      log.warn(`appairage bloqué pour ${key} (trop d'essais)`);
      return json(res, 429, { error: "trop d'essais, réessayez plus tard" }, { "retry-after": String(rl.retryAfter) });
    }
    const body = (await readJson(req, 4 * 1024)) as { code?: unknown; deviceName?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const current = currentConfig();
    if (!/^\d{6}$/.test(code) || !safeEqual(code, current.pairCode)) {
      log.warn(`code d'appairage incorrect (API) depuis ${key}`);
      return json(res, 401, { error: "code incorrect" });
    }
    limiter.reset(key);
    const deviceName =
      typeof body.deviceName === "string" && body.deviceName.trim()
        ? body.deviceName.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 80)
        : `appareil ${key}`;
    log.info(`appairé : ${deviceName}`);
    const out: PairResponse = { token: current.accessToken, home: current.homeName };
    return json(res, 200, out);
  }

  function handlePair(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const code = url.searchParams.get("code")?.trim();
    if (!code) return html(res, 200, "Associer cet appareil", PAIR_FORM);
    const key = clientKey(req);
    const rl = limiter.attempt(key);
    if (!rl.ok) {
      log.warn(`appairage bloqué pour ${key} (trop d'essais)`);
      return html(res, 429, "Trop d'essais", `<p>Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.</p>`, {
        "retry-after": String(rl.retryAfter),
      });
    }
    const current = currentConfig();
    if (!/^\d{6}$/.test(code) || !safeEqual(code, current.pairCode)) {
      log.warn(`code d'appairage incorrect depuis ${key}`);
      return html(res, 403, "Code incorrect", `<p>Ce code ne correspond pas.</p>${PAIR_FORM}`);
    }
    limiter.reset(key);
    log.info(`appareil associé depuis ${key}`);
    res.writeHead(302, { location: "/", "set-cookie": authCookie(current.accessToken), "cache-control": "no-store" });
    res.end();
  }

  function handleEvents(req: IncomingMessage, res: ServerResponse): void {
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(SSE_RETRY);
    res.write(sseFrame({ type: "snapshot", snapshot: hub.snapshot() }));
    const unsubscribe = hub.subscribe((e) => res.write(sseFrame(e)));
    const ping = setInterval(() => res.write(SSE_PING), 25_000);
    const close = () => {
      clearInterval(ping);
      unsubscribe();
    };
    req.on("close", close);
    res.on("error", close);
  }

  /** GET /api/home/media/:id/artwork — immutable caching when `?h=` names the current content. */
  async function handleArtwork(req: IncomingMessage, res: ServerResponse, id: string, query: URLSearchParams): Promise<void> {
    const art = await hub.artwork(id);
    if (!art) return json(res, 404, { error: "pas d'image" });
    const etag = `"${art.key}"`;
    const headers: Record<string, string> = {
      "content-type": art.mime,
      etag,
      "cache-control": query.get("h") === art.key ? "private, max-age=31536000, immutable" : "private, no-cache",
      "x-content-type-options": "nosniff",
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      return void res.end();
    }
    res.writeHead(200, { ...headers, "content-length": String(art.data.length) });
    res.end(req.method === "HEAD" ? undefined : art.data);
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams = new URLSearchParams()): Promise<void> {
    const method = req.method ?? "GET";
    if (method === "GET" && path === "/api/home") return json(res, 200, hub.snapshot());
    if (method === "GET" && path === "/api/home/events") return handleEvents(req, res);

    let m = /^\/api\/home\/devices\/([^/]+)\/action$/.exec(path);
    if (m && method === "POST") {
      const id = decodeURIComponent(m[1]!);
      const action = parseAction(await readJson(req));
      log.info(`action ${id} ${JSON.stringify(action)}`);
      return json(res, 200, await hub.act(id, action));
    }
    m = /^\/api\/home\/media\/([^/]+)\/artwork$/.exec(path);
    if (m && (method === "GET" || method === "HEAD")) return handleArtwork(req, res, decodeURIComponent(m[1]!), query);
    m = /^\/api\/home\/scenes\/([^/]+)$/.exec(path);
    if (m && method === "POST") return json(res, 200, await hub.runScene(decodeURIComponent(m[1]!)));
    if (path === "/api/home/order" && method === "PUT") {
      const order = parseOrder(await readJson(req), new Set(hub.devices().map((d) => d.id)));
      state.config = updateConfig((c) => {
        c.deviceOrder = order;
      }, state.configPath);
      log.info(`ordre des tuiles : ${order.join(", ")}`);
      return json(res, 200, hub.setConfigAndPush(state.config));
    }
    m = /^\/api\/home\/devices\/([^/]+)\/link$/.exec(path);
    if (m && method === "PUT") {
      const id = decodeURIComponent(m[1]!);
      hub.device(id); // 404 if unknown
      const body = (await readJson(req)) as { itemId?: unknown };
      const itemId = body.itemId;
      if (!(itemId === null || (typeof itemId === "string" && itemId.length > 0 && itemId.length <= 200)))
        throw new HttpError(400, "itemId doit être une chaîne ou null");
      state.config = updateConfig((c) => {
        c.links[id] = itemId;
      }, state.configPath);
      hub.setConfig(state.config);
      log.info(`lien ${id} → ${itemId ?? "aucun"}`);
      return json(res, 200, hub.device(id));
    }
    throw new HttpError(404, "route inconnue");
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://bridge.local");
    const path = url.pathname;
    try {
      if (path === "/healthz") return json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
      if (path === "/pair") return handlePair(req, res, url);
      if (path === "/api" || path.startsWith("/api/")) {
        cors(req, res);
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "access-control-allow-methods": "GET, HEAD, POST, PUT, OPTIONS",
            "access-control-allow-headers": "Authorization, Content-Type",
            "access-control-max-age": "600",
          });
          return res.end();
        }
        if (path === "/api/pair") {
          if (req.method !== "POST") return json(res, 405, { error: "méthode non autorisée" }, { allow: "POST" });
          return await handleApiPair(req, res);
        }
        const ok = isAuthorized(
          { remoteAddress: req.socket.remoteAddress, authorization: req.headers.authorization, cookie: req.headers.cookie },
          state.config.accessToken,
        );
        if (!ok) return json(res, 401, { error: "non autorisé : associez cet appareil via /pair" });
        return await handleApi(req, res, path, url.searchParams);
      }
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "méthode non autorisée" });
      // "/" without a scene (home-screen app, menu bar): open the home's own apartment, in Maison mode.
      if (path === "/" && state.config.defaultScene) {
        const query = new URL(req.url ?? "/", "http://bridge").searchParams;
        if (!query.has("scene")) {
          query.set("scene", state.config.defaultScene);
          if (!query.has("home")) query.set("home", "1");
          res.writeHead(302, { location: `/?${query.toString()}` });
          return res.end();
        }
      }
      // /shared/* straight from apps/web/public/shared when serving this repo's build (falls back to dist).
      if (path.startsWith("/shared/") && !state.config.webDist && existsSync(join(DEFAULT_SHARED_DIR, path.slice("/shared/".length)))) {
        serveStatic(req, res, DEFAULT_SHARED_DIR, path.slice("/shared".length));
        return;
      }
      serveStatic(req, res, state.config.webDist ?? DEFAULT_WEB_DIST, path);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) log.error(`${req.method} ${path}: ${errMsg(e)}`);
      if (!res.headersSent) json(res, status, { error: errMsg(e) });
      else res.end();
    }
  });
}
