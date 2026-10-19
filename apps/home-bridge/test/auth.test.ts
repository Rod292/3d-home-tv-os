import { describe, expect, it } from "vitest";
import { authCookie, isAuthorized, parseCookies, RateLimiter } from "../src/auth.ts";

const token = "a".repeat(64);

describe("auth", () => {
  it("loopback is always allowed", () => {
    for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      expect(isAuthorized({ remoteAddress: a, authorization: undefined, cookie: undefined }, token)).toBe(true);
  });

  it("LAN needs bearer or cookie", () => {
    const lan = { remoteAddress: "192.168.1.20", authorization: undefined, cookie: undefined };
    expect(isAuthorized(lan, token)).toBe(false);
    expect(isAuthorized({ ...lan, authorization: `Bearer ${token}` }, token)).toBe(true);
    expect(isAuthorized({ ...lan, authorization: "Bearer nope" }, token)).toBe(false);
    expect(isAuthorized({ ...lan, cookie: `foo=1; appart3d_home=${token}` }, token)).toBe(true);
    expect(isAuthorized({ ...lan, cookie: "appart3d_home=wrong" }, token)).toBe(false);
  });

  it("cookie attributes", () => {
    const c = authCookie(token);
    expect(c).toContain(`appart3d_home=${token}`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Max-Age=31536000");
    expect(parseCookies("a=1; b = x%20y")).toEqual({ a: "1", b: "x y" });
  });
});

describe("pair rate limiting", () => {
  it("blocks after 5 attempts per client within the window, then recovers", () => {
    const rl = new RateLimiter({ max: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) expect(rl.attempt("ip1", 1000).ok).toBe(true);
    const blocked = rl.attempt("ip1", 2000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(59);
    expect(rl.attempt("ip2", 2000).ok).toBe(true);
    expect(rl.attempt("ip1", 61_001).ok).toBe(true);
  });

  it("reset after success; global cap across clients", () => {
    const rl = new RateLimiter({ max: 5, globalMax: 8, windowMs: 60_000 });
    for (let i = 0; i < 4; i++) rl.attempt("a", 0);
    rl.reset("a");
    for (let i = 0; i < 4; i++) expect(rl.attempt("b", 0).ok).toBe(true);
    expect(rl.attempt("c", 0).ok).toBe(false); // 9th attempt overall
  });
});
