import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { haTvMedia, haTvState, pictureKey } from "../src/ha.ts";
import {
  HOMEPOD_ID,
  HomePodAdapter,
  homepodDevice,
  mediaCapabilities,
  parseHelperLine,
  planHomePodAction,
  type HelperState,
} from "../src/homepod.ts";
import { planScene } from "../src/scenes.ts";
import type { Device } from "@appart3d/home";

// Real lines printed by scripts/homepod.py against a HomePod mini (idle, read-only session).
const REAL_CONNECTED = '{"type": "connected", "ip": "192.168.1.120", "name": "Living Room", "model": "HomePod Mini", "identifier": "00:11:22:33:44:55"}';
const REAL_IDLE =
  '{"type": "state", "app": null, "playing": {"device_state": "idle", "media_type": "unknown", "title": null, "artist": null, "album": null, "genre": null, "position": null, "total_time": null, "hash": "0000000000000000000000000000000000000000000000000000000000000000"}, "features": {"play": false, "pause": false, "playPause": false, "next": false, "previous": false, "setVolume": true, "volume": true, "artwork": false, "app": false}, "volume": 49.0, "artworkId": null}';

const playingState = (features: HelperState["features"] = { play: true, pause: true, playPause: true, next: true, previous: false, setVolume: true, volume: true, artwork: true, app: true }): HelperState => ({
  type: "state",
  playing: { device_state: "playing", media_type: "music", title: "Lumière d'octobre", artist: "Les Voisins", album: "Rue Oberkampf", position: 62.4, total_time: 214, hash: "abc" },
  features,
  volume: 35.4,
  artworkId: "art-1",
  app: { name: "Musique", id: "com.apple.Music" },
});

const cfg = { name: "HomePod mini", room: "Salon" };

describe("helper protocol", () => {
  it("parses the real connected / idle lines", () => {
    expect(parseHelperLine(REAL_CONNECTED)).toMatchObject({ type: "connected", ip: "192.168.1.120", model: "HomePod Mini" });
    const idle = parseHelperLine(REAL_IDLE);
    expect(idle).toMatchObject({ type: "state", volume: 49, features: { setVolume: true, play: false } });
  });

  it("ignores garbage, non-JSON and unknown types", () => {
    expect(parseHelperLine("")).toBeNull();
    expect(parseHelperLine("WARNING: something")).toBeNull();
    expect(parseHelperLine("{not json")).toBeNull();
    expect(parseHelperLine('{"type":"weird"}')).toBeNull();
    expect(parseHelperLine('{"type":"reply"}')).toBeNull(); // no id
    expect(parseHelperLine('{"type":"reply","id":3,"ok":true}')).toEqual({ type: "reply", id: 3, ok: true });
  });
});

describe("HomePod device mapping", () => {
  it("idle HomePod: off, reachable, volume, no transport controls", () => {
    const st = parseHelperLine(REAL_IDLE) as HelperState;
    const d = homepodDevice({ connected: true, state: st, stateAt: new Date() }, cfg);
    expect(d).toMatchObject({ id: HOMEPOD_ID, kind: "speaker", source: "airplay", room: "Salon" });
    expect(d.state).toEqual({ on: false, reachable: true, volume: 49, media: { state: "idle" } });
    expect(d.capabilities).toEqual({ volume: true });
  });

  it("playing: metadata, position sample time, controls pyatv offers, artwork URL with content key", () => {
    const at = new Date("2026-10-14T15:00:00Z");
    const d = homepodDevice({ connected: true, state: playingState(), stateAt: at }, cfg);
    expect(d.state.on).toBe(true);
    expect(d.state.volume).toBe(35);
    expect(d.state.media).toMatchObject({ state: "playing", title: "Lumière d'octobre", artist: "Les Voisins", album: "Rue Oberkampf", app: "Musique", position: 62.4, duration: 214, updatedAt: at.toISOString() });
    expect(d.state.media!.artworkUrl).toMatch(/^\/api\/home\/media\/airplay%3Ahomepod\/artwork\?h=[0-9a-f]{16}$/);
    expect(d.capabilities.media).toEqual(["play", "pause", "next"]);
  });

  it("disconnected: unknown and unreachable", () => {
    expect(homepodDevice({ connected: false, state: null, stateAt: null }, cfg).state).toEqual({ on: null, reachable: false });
  });

  it("PlayPause alone covers play and pause", () => {
    expect(mediaCapabilities({ playPause: true })).toEqual(["play", "pause"]);
    expect(mediaCapabilities({})).toEqual([]);
  });
});

describe("HomePod action planning (never sends what pyatv does not offer)", () => {
  it("transport", () => {
    const st = playingState();
    expect(planHomePodAction(st, { type: "media", command: "pause" })).toEqual([{ cmd: "pause" }]);
    expect(planHomePodAction(st, { type: "media", command: "playPause" })).toEqual([{ cmd: "play_pause" }]);
    expect(planHomePodAction(st, { type: "toggle" })).toEqual([{ cmd: "play_pause" }]);
    expect(planHomePodAction(st, { type: "power", on: false })).toEqual([{ cmd: "pause" }]);
    expect(() => planHomePodAction(st, { type: "media", command: "previous" })).toThrow(/indisponible/);
  });

  it("idle HomePod: transport refused, volume allowed", () => {
    const idle = parseHelperLine(REAL_IDLE) as HelperState;
    expect(() => planHomePodAction(idle, { type: "media", command: "play" })).toThrow();
    expect(planHomePodAction(idle, { type: "power", on: false })).toEqual([]);
    expect(planHomePodAction(idle, { type: "volume", value: 120 })).toEqual([{ cmd: "set_volume", value: 100 }]);
    expect(planHomePodAction(idle, { type: "volumeStep", delta: -1 })).toEqual([{ cmd: "set_volume", value: 44 }]);
    expect(() => planHomePodAction(null, { type: "toggle" })).toThrow(/injoignable/);
    expect(() => planHomePodAction(idle, { type: "brightness", value: 3 })).toThrow();
  });

  it("only PlayPause available: pause while playing, nothing to do when paused", () => {
    const st = playingState({ playPause: true });
    expect(planHomePodAction(st, { type: "media", command: "pause" })).toEqual([{ cmd: "play_pause" }]);
    const paused = { ...st, playing: { ...st.playing!, device_state: "paused" } };
    expect(planHomePodAction(paused, { type: "media", command: "pause" })).toEqual([]);
    expect(planHomePodAction(paused, { type: "media", command: "play" })).toEqual([{ cmd: "play_pause" }]);
  });
});

/* ------------------------------------------------------------------ adapter with a fake helper */

const FAKE = `
const fs = require("node:fs");
const log = process.argv[2];
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "connected", ip: "10.0.0.9", name: "Fake", model: "HomePod Mini" });
out(${JSON.stringify({ ...playingState(), features: { play: true, pause: true, playPause: true, next: false, previous: false, setVolume: true, volume: true, artwork: true } })});
let buf = "";
process.stdin.on("data", (b) => {
  buf += b;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    fs.appendFileSync(log, m.cmd + "\\n");
    if (m.cmd === "artwork") out({ type: "reply", id: m.id, ok: true, mime: "image/png", data: Buffer.from("PNGDATA").toString("base64") });
    else out({ type: "reply", id: m.id, ok: true });
  }
});
`;

describe("HomePodAdapter with a fake helper executable", () => {
  let adapter: HomePodAdapter | null = null;
  afterEach(() => adapter?.stop());

  const setup = async () => {
    const dir = mkdtempSync(join(tmpdir(), "homepod-"));
    const script = join(dir, "fake.cjs");
    const log = join(dir, "commands.log");
    writeFileSync(script, FAKE);
    writeFileSync(log, "");
    let changes = 0;
    adapter = new HomePodAdapter({ enabled: true, host: "x.local", ip: null, id: null, name: "HomePod mini", room: "Salon", python: "/nope" }, { command: [process.execPath, script, log], backoffMs: 50 });
    await adapter.start(() => changes++);
    for (let i = 0; i < 100 && !adapter.helperState; i++) await new Promise((r) => setTimeout(r, 20));
    return { log, changes: () => changes };
  };

  it("streams the state into a device", async () => {
    const { changes } = await setup();
    const d = adapter!.devices()[0]!;
    expect(d.state).toMatchObject({ on: true, reachable: true, media: { state: "playing", title: "Lumière d'octobre" } });
    expect(d.capabilities.media).toEqual(["play", "pause"]);
    expect(changes()).toBeGreaterThan(0);
  });

  it("sends supported commands, refuses unsupported ones without contacting the device", async () => {
    const { log } = await setup();
    await adapter!.act(HOMEPOD_ID, [{ type: "media", command: "pause" }]);
    await adapter!.act(HOMEPOD_ID, [{ type: "volume", value: 20 }]);
    await expect(adapter!.act(HOMEPOD_ID, [{ type: "media", command: "next" }])).rejects.toMatchObject({ status: 409 });
    await new Promise((r) => setTimeout(r, 50));
    const sent = readFileSync(log, "utf8").trim().split("\n");
    expect(sent.filter((c) => c !== "refresh")).toEqual(["pause", "set_volume"]);
  });

  it("artwork fetched once per content key", async () => {
    const { log } = await setup();
    const a = await adapter!.artwork(HOMEPOD_ID);
    expect(a).toMatchObject({ mime: "image/png" });
    expect(a!.data.toString()).toBe("PNGDATA");
    expect(adapter!.devices()[0]!.state.media!.artworkUrl).toContain(`h=${a!.key}`);
    await adapter!.artwork(HOMEPOD_ID);
    expect(readFileSync(log, "utf8").trim().split("\n").filter((c) => c === "artwork")).toHaveLength(1);
    expect(await adapter!.artwork("other")).toBeNull();
  });

  it("missing pyatv: disabled with a warning, no spawn", async () => {
    adapter = new HomePodAdapter({ enabled: true, host: "x.local", ip: null, id: null, name: "HomePod mini", room: "Salon", python: "/nonexistent/venv/bin" });
    await adapter.start(() => undefined);
    expect(adapter.warnings()[0]).toMatch(/pyatv introuvable/);
    expect(adapter.devices()[0]!.state.reachable).toBe(false);
  });
});

/* ------------------------------------------------------------------ TV media (Home Assistant) */

describe("TV media from Home Assistant", () => {
  const tv = (state: string, attributes: Record<string, unknown>) => ({ entity_id: "media_player.tv", state, attributes });

  it("app, channel and title; title repeating the app is dropped", () => {
    expect(haTvMedia(tv("on", { app_name: "Netflix", media_title: "Netflix" }))).toEqual({ state: "playing", app: "Netflix" });
    expect(haTvMedia(tv("on", { media_channel: "France 2", media_title: "Journal de 20 h" }))).toEqual({ state: "playing", channel: "France 2", title: "Journal de 20 h" });
    expect(haTvMedia(tv("paused", { app_name: "YouTube", media_title: "Vélo" }))).toMatchObject({ state: "paused", app: "YouTube", title: "Vélo" });
    expect(haTvMedia(tv("on", { source: "HDMI 1" }))).toBeUndefined();
  });

  it("entity_picture proxied by the bridge, its token never exposed and left out of the key", () => {
    const pic = "/api/media_player_proxy/media_player.tv?token=SECRET123&cache=42";
    const m = haTvMedia(tv("on", { app_name: "Netflix", entity_picture: pic }))!;
    expect(m.artworkUrl).toBe(`/api/home/media/ha%3Amedia_player.tv/artwork?h=${pictureKey(pic)}`);
    expect(JSON.stringify(m)).not.toContain("SECRET");
    expect(pictureKey("/api/media_player_proxy/media_player.tv?token=OTHER&cache=42")).toBe(pictureKey(pic));
    expect(pictureKey("/api/media_player_proxy/media_player.tv?token=OTHER&cache=43")).not.toBe(pictureKey(pic));
  });

  it("no media when the TV is off; the real (attribute-less) TV maps to no media", () => {
    expect(haTvState(tv("off", { app_name: "Netflix" })).media).toBeUndefined();
    const real = haTvState(tv("on", { source_list: ["Watch TV", "HDMI 1"], volume_level: 1, device_class: "tv" }));
    expect(real).toEqual({ on: true, reachable: true, volume: 100 });
  });
});

/* ------------------------------------------------------------------ scenes */

describe("scenes pause the HomePod", () => {
  const speaker = (state: "playing" | "paused" | "idle", controls: Device["capabilities"]["media"]): Device => ({
    id: HOMEPOD_ID,
    name: "HomePod mini",
    kind: "speaker",
    source: "airplay",
    room: "Salon",
    state: { on: state === "playing", reachable: true, media: { state } },
    capabilities: controls ? { media: controls } : {},
  });
  const pauseOf = (plan: ReturnType<typeof planScene>) => plan?.find((p) => p.deviceId === HOMEPOD_ID)?.actions;

  it("Film and Absent pause a playing HomePod", () => {
    for (const scene of ["movie", "away"]) expect(pauseOf(planScene(scene, [speaker("playing", ["play", "pause"])], { ambientStrip: null }))).toEqual([{ type: "media", command: "pause" }]);
  });

  it("skipped when not playing, when pause isn't offered, and in other scenes", () => {
    expect(pauseOf(planScene("movie", [speaker("paused", ["play", "pause"])], { ambientStrip: null }))).toBeUndefined();
    expect(pauseOf(planScene("movie", [speaker("playing", [])], { ambientStrip: null }))).toBeUndefined();
    expect(pauseOf(planScene("away", [speaker("playing", undefined)], { ambientStrip: null }))).toBeUndefined();
    expect(pauseOf(planScene("cozy", [speaker("playing", ["pause"])], { ambientStrip: null }))).toBeUndefined();
  });
});
