import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_LINKS, DEMO_NAMES, loadConfig, updateConfig } from "../src/config.ts";
import { Hub } from "../src/hub.ts";
import { MockAdapter } from "../src/mock.ts";
import { lanAddresses } from "../src/lan.ts";
import { createBridgeServer, parseAction } from "../src/server.ts";

const dir = mkdtempSync(join(tmpdir(), "home-bridge-"));
const configPath = join(dir, "home.json");
loadConfig(configPath);
// The mock devices linked to the demo apartment (+ the mock HomePod), as with HOME_BRIDGE_MOCK=1. Saved to the
// file: the server reloads its config from disk after a change (e.g. the link test below).
const config = updateConfig((c) => {
  c.links = { ...DEMO_LINKS, "airplay:homepod": "item_homepod" };
  c.deviceNames = { ...DEMO_NAMES };
  c.roles.ambientStrip = "hue:light:12";
}, configPath);
config.webDist = dir; // no index.html: static falls back to 503 text
const hub = new Hub(config, { adapters: [new MockAdapter(0)] });
const server = createBridgeServer(hub, { config, configPath });
let base = "";

beforeAll(async () => {
  await hub.start();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("server (mock devices)", () => {
  it("config created with 600 perms and defaults", async () => {
    const { statSync } = await import("node:fs");
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(config.accessToken).toMatch(/^[0-9a-f]{64}$/);
    expect(config.pairCode).toMatch(/^\d{6}$/);
  });

  it("snapshot with links and French rooms", async () => {
    const snap = await (await fetch(`${base}/api/home`)).json();
    expect(snap.home).toBe("Home");
    expect(snap.scenes).toHaveLength(5);
    const strip = snap.devices.find((d: { id: string }) => d.id === "hue:light:12");
    expect(strip).toMatchObject({ room: "Salon", itemId: "item_table_lamp", source: "mock" });
    expect(snap.devices.find((d: { kind: string }) => d.kind === "fan").itemId).toBe("item_fan");
    expect(snap.devices.find((d: { kind: string }) => d.kind === "tv").itemId).toBe("item_2");
    expect(snap.devices.find((d: { id: string }) => d.id === "hue:light:9").itemId).toBeUndefined();
  });

  it("action + SSE device event", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/home/events`, { signal: ctrl.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const nextEvent = async () => {
      for (;;) {
        const i = buf.indexOf("\n\n");
        if (i >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const { value } = await reader.read();
        buf += dec.decode(value);
      }
    };
    expect((await nextEvent()).type).toBe("snapshot");
    const r = await fetch(`${base}/api/home/devices/hue%3Alight%3A18/action`, { method: "POST", body: JSON.stringify({ type: "brightness", value: 60 }) });
    const dev = await r.json();
    expect(dev.state).toMatchObject({ on: true, brightness: 60 });
    const ev = await nextEvent();
    expect(ev).toMatchObject({ type: "device", device: { id: "hue:light:18", state: { brightness: 60 } } });
    ctrl.abort();
  });

  it("rejects invalid actions and unknown devices", async () => {
    expect((await fetch(`${base}/api/home/devices/hue%3Alight%3A18/action`, { method: "POST", body: '{"type":"brightness","value":300}' })).status).toBe(400);
    expect((await fetch(`${base}/api/home/devices/nope/action`, { method: "POST", body: '{"type":"toggle"}' })).status).toBe(404);
    expect(() => parseAction({ type: "color", hex: "red" })).toThrow();
    expect(parseAction({ type: "color", hex: "ff0000" })).toEqual({ type: "color", hex: "#ff0000" });
  });

  it("scene returns the new snapshot", async () => {
    const snap = await (await fetch(`${base}/api/home/scenes/away`, { method: "POST" })).json();
    for (const d of snap.devices) if (d.state.reachable && d.kind !== "fan") expect(d.state.on).toBe(false);
    const movie = await (await fetch(`${base}/api/home/scenes/movie`, { method: "POST" })).json();
    expect(movie.devices.find((d: { kind: string }) => d.kind === "tv").state.on).toBe(true);
    expect((await fetch(`${base}/api/home/scenes/nope`, { method: "POST" })).status).toBe(404);
  });

  it("PUT /api/home/order: shared tile order, persisted, pushed; validated", async () => {
    const put = (body: unknown) => fetch(`${base}/api/home/order`, { method: "PUT", body: JSON.stringify(body) });
    const r = await put({ order: ["ha:media_player.philips_tv", "nope", "airplay:homepod", "ha:media_player.philips_tv"] });
    expect(r.status).toBe(200);
    const snap = await r.json();
    expect(snap.devices.slice(0, 2).map((d: { id: string }) => d.id)).toEqual(["ha:media_player.philips_tv", "airplay:homepod"]);
    expect(snap.devices).toHaveLength((await (await fetch(`${base}/api/home`)).json()).devices.length);
    const { loadConfig: load } = await import("../src/config.ts");
    expect(load(configPath).config.deviceOrder).toEqual(["ha:media_player.philips_tv", "airplay:homepod"]);
    expect((await (await fetch(`${base}/api/home`)).json()).devices[0].id).toBe("ha:media_player.philips_tv");
    for (const bad of [{}, { order: "x" }, { order: [1] }, { order: Array.from({ length: 201 }, (_, i) => `d${i}`) }]) expect((await put(bad)).status).toBe(400);
    expect((await put({ order: [] })).status).toBe(200);
  });

  it("link updates config and device", async () => {
    const r = await fetch(`${base}/api/home/devices/hue%3Alight%3A9/link`, { method: "PUT", body: '{"itemId":"item_photo_7"}' });
    expect((await r.json()).itemId).toBe("item_photo_7");
    expect(loadConfig(configPath).config.links["hue:light:9"]).toBe("item_photo_7");
    const r2 = await fetch(`${base}/api/home/devices/item%3Atv/link`, { method: "PUT", body: '{"itemId":null}' });
    expect(r2.status).toBe(404);
  });

  it("pair: wrong code 403, rate limited, right code sets cookie", async () => {
    const right = await fetch(`${base}/pair?code=${config.pairCode}`, { redirect: "manual" });
    expect(right.status).toBe(302);
    expect(right.headers.get("set-cookie")).toContain(`appart3d_home=${config.accessToken}`);
    const wrong = config.pairCode === "000000" ? "111111" : "000000";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await fetch(`${base}/pair?code=${wrong}`)).status);
    expect(statuses).toEqual([403, 403, 403, 403, 403, 429]);
  });

  it("CORS for the Vite origin, healthz", async () => {
    const r = await fetch(`${base}/api/home`, { headers: { origin: "http://localhost:5173" } });
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(r.headers.get("access-control-allow-credentials")).toBe("true");
    const other = await fetch(`${base}/api/home`, { headers: { origin: "http://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    expect((await (await fetch(`${base}/healthz`)).json()).ok).toBe(true);
  });
});

describe("POST /api/pair (native apps)", () => {
  // Own server instance: its own rate limiter, independent of the /pair test above.
  const server2 = createBridgeServer(hub, { config, configPath });
  let base2 = "";
  beforeAll(async () => {
    await new Promise<void>((r) => server2.listen(0, "127.0.0.1", r));
    base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server2.closeAllConnections();
    server2.close();
  });
  const pair = (body: unknown) =>
    fetch(`${base2}/api/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("right code → token + home; wrong → 401; rate limited → 429; GET → 405", async () => {
    const r = await pair({ code: config.pairCode, deviceName: "iPhone de test" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ token: config.accessToken, home: "Home" });
    expect((await fetch(`${base2}/api/pair`)).status).toBe(405);
    const wrong = config.pairCode === "000000" ? "111111" : "000000";
    const statuses: number[] = [];
    for (const body of [{ code: wrong }, { code: "12" }, {}, { code: 123456 }, { code: wrong }, { code: config.pairCode }])
      statuses.push((await pair(body)).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    const blocked = await pair({ code: config.pairCode });
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});

describe("now playing (mock HomePod, TV on Netflix)", () => {
  it("snapshot: speaker linked to item_homepod, TV media, Ambilight color", async () => {
    const snap = await (await fetch(`${base}/api/home`)).json();
    const hp = snap.devices.find((d: { id: string }) => d.id === "airplay:homepod");
    expect(hp).toMatchObject({ kind: "speaker", room: "Salon", itemId: "item_homepod", state: { media: { app: "Musique", title: expect.any(String) } } });
    expect(hp.capabilities.media).toEqual(["play", "pause", "next", "previous"]);
    const tv = snap.devices.find((d: { kind: string }) => d.kind === "tv");
    expect(tv.state.media).toMatchObject({ app: "Netflix" });
    // The Ambilight is folded into the TV (no separate light), with the installed apps.
    expect(snap.devices.find((d: { name: string }) => d.name === "Ambilight")).toBeUndefined();
    expect(tv).toMatchObject({ itemId: "item_2", state: { ambilight: { on: true, color: "#4b1fd1", brightness: 25 } } }); // left by « Film »
    expect(tv.capabilities.ambilight.effects).toContain("FOLLOW_VIDEO: VIVID");
    expect(tv.capabilities.apps.slice(0, 3)).toEqual([
      { id: "org.droidtv.playtv", label: "TV" },
      { id: "com.google.android.youtube.tv", label: "YouTube" },
      { id: "com.netflix.ninja", label: "Netflix" },
    ]);
    expect(tv.capabilities.buttons).toContain("app:com.netflix.ninja");
  });

  it("ambilight + app actions on the mock TV; invalid ambilight bodies rejected", async () => {
    const id = encodeURIComponent("ha:media_player.philips_tv");
    const post = (body: unknown) => fetch(`${base}/api/home/devices/${id}/action`, { method: "POST", body: JSON.stringify(body) });
    let tv = await (await post({ type: "ambilight", hex: "#4b1fd1", brightness: 25 })).json();
    expect(tv.state.ambilight).toEqual({ on: true, color: "#4b1fd1", brightness: 25 });
    tv = await (await post({ type: "ambilight", effect: "FOLLOW_AUDIO: VU_METER" })).json();
    expect(tv.state.ambilight).toEqual({ on: true, effect: "FOLLOW_AUDIO: VU_METER" });
    tv = await (await post({ type: "ambilight", on: false })).json();
    expect(tv.state.ambilight).toEqual({ on: false });
    tv = await (await post({ type: "button", name: "app:com.google.android.youtube.tv" })).json();
    expect(tv.state.media.app).toBe("YouTube");
    for (const bad of [{ type: "ambilight", hex: "red" }, { type: "ambilight", brightness: 0 }, { type: "ambilight", on: "yes" }, { type: "ambilight", effect: 3 }])
      expect((await post(bad)).status).toBe(400);
    expect((await post({ type: "button", name: "app:com.evil.app" })).status).toBe(400);
  });

  it("artwork: PNG, immutable when ?h= matches, 304 on etag, 404 without cover / unknown device", async () => {
    const snap = await (await fetch(`${base}/api/home`)).json();
    const url = snap.devices.find((d: { id: string }) => d.id === "airplay:homepod").state.media.artworkUrl as string;
    const r = await fetch(`${base}${url}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toContain("immutable");
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect((await fetch(`${base}${url}`, { headers: { "if-none-match": r.headers.get("etag")! } })).status).toBe(304);
    expect((await fetch(`${base}/api/home/media/airplay%3Ahomepod/artwork?h=stale`)).headers.get("cache-control")).toBe("private, no-cache");
    expect((await fetch(`${base}/api/home/media/hue%3Alight%3A12/artwork`)).status).toBe(404);
    expect((await fetch(`${base}/api/home/media/nope/artwork`)).status).toBe(404);
  });

  it("media actions: validated, applied (mock), refused for unknown commands", async () => {
    expect(parseAction({ type: "media", command: "next" })).toEqual({ type: "media", command: "next" });
    expect(() => parseAction({ type: "media", command: "eject" })).toThrow();
    const r = await fetch(`${base}/api/home/devices/airplay%3Ahomepod/action`, { method: "POST", body: '{"type":"media","command":"pause"}' });
    expect((await r.json()).state.media.state).toBe("paused");
    await fetch(`${base}/api/home/devices/airplay%3Ahomepod/action`, { method: "POST", body: '{"type":"media","command":"play"}' });
    expect((await fetch(`${base}/api/home/devices/hue%3Alight%3A12/action`, { method: "POST", body: '{"type":"media","command":"play"}' })).status).toBe(400);
  });

  const lan = lanAddresses()[0];
  it.skipIf(!lan)("artwork needs auth from the LAN (Bearer or cookie)", async () => {
    const s = createBridgeServer(hub, { config, configPath });
    await new Promise<void>((r) => s.listen(0, "0.0.0.0", r));
    try {
      const u = `http://${lan}:${(s.address() as AddressInfo).port}/api/home/media/airplay%3Ahomepod/artwork`;
      expect((await fetch(u)).status).toBe(401);
      expect((await fetch(u, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
      expect((await fetch(u, { headers: { authorization: `Bearer ${config.accessToken}` } })).status).toBe(200);
      expect((await fetch(u, { headers: { cookie: `appart3d_home=${config.accessToken}` } })).status).toBe(200);
    } finally {
      s.closeAllConnections();
      s.close();
    }
  });
});
