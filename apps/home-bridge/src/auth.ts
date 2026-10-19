/** Auth helpers: bearer/cookie token check, loopback bypass, pair-code rate limiting. */
import { createHash, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "appart3d_home";
export const COOKIE_MAX_AGE = 365 * 24 * 3600;

export function isLoopback(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** Constant-time comparison (hash first so lengths don't leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export interface AuthInput {
  remoteAddress: string | undefined;
  authorization: string | undefined;
  cookie: string | undefined;
}

export function isAuthorized(req: AuthInput, accessToken: string): boolean {
  if (isLoopback(req.remoteAddress)) return true;
  const bearer = /^Bearer\s+(.+)$/i.exec(req.authorization ?? "")?.[1]?.trim();
  if (bearer && safeEqual(bearer, accessToken)) return true;
  const cookie = parseCookies(req.cookie)[COOKIE_NAME];
  return !!cookie && safeEqual(cookie, accessToken);
}

export function authCookie(accessToken: string): string {
  return `${COOKIE_NAME}=${accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

/**
 * Fixed-window limiter on pair attempts: `max` attempts per key per window, plus a global cap
 * across all clients (a 6-digit code must not be brute-forceable from many addresses).
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; start: number }>();
  private max: number;
  private globalMax: number;
  private windowMs: number;

  constructor(opts: { max?: number; globalMax?: number; windowMs?: number } = {}) {
    this.max = opts.max ?? 5;
    this.globalMax = opts.globalMax ?? 30;
    this.windowMs = opts.windowMs ?? 10 * 60_000;
  }

  private bump(key: string, limit: number, now: number): { ok: boolean; retryAfter: number } {
    let h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      h = { count: 0, start: now };
      this.hits.set(key, h);
    }
    h.count++;
    return { ok: h.count <= limit, retryAfter: Math.ceil((h.start + this.windowMs - now) / 1000) };
  }

  /** Count an attempt; false = blocked (retryAfter in seconds). */
  attempt(key: string, now = Date.now()): { ok: boolean; retryAfter: number } {
    const g = this.bump("*", this.globalMax, now);
    const k = this.bump(key, this.max, now);
    if (!g.ok) return g;
    return k;
  }

  /** Successful pairing clears the client's counter. */
  reset(key: string): void {
    this.hits.delete(key);
  }
}
