import { describe, expect, it } from "vitest";
import type { Device } from "@appart3d/home";
import { canMedia, formatTime, isOn, lookForItem, mediaPosition, nowPlaying, predict, resolveAsset, stateWord, tvContent } from "../src/lib/home";
import { brandOf, tvCardKey, tvCardModel } from "../src/lib/tvCard";
import { mockDevices } from "../src/lib/homeClient";

const homepod = () => mockDevices().find((d) => d.kind === "speaker")!;
const tv = (state: Partial<Device["state"]>): Device => ({ id: "ha:media_player.tv", name: "TV", kind: "tv", source: "homeassistant", room: "Salon", itemId: "item_30", state: { on: true, reachable: true, ...state }, capabilities: {} });

describe("now playing", () => {
  it("speaker playing counts as on, with a readable state", () => {
    const d = homepod();
    expect(isOn(d)).toBe(true);
    expect(stateWord(d)).toBe("Lecture · Lumière d'octobre");
    const paused = predict(d, { type: "media", command: "pause" });
    expect(isOn(paused)).toBe(false);
    expect(stateWord(paused)).toMatch(/^En pause/);
    expect(stateWord({ ...d, state: { on: false, reachable: true, media: { state: "idle" } } })).toBe("En veille");
  });

  it("nowPlaying prefers a playing speaker over a paused one, ignores idle / unreachable", () => {
    const a = homepod();
    const b = { ...predict(a, { type: "media", command: "pause" }), id: "airplay:other" };
    expect(nowPlaying([b, a])?.id).toBe(a.id);
    expect(nowPlaying([b])?.id).toBe("airplay:other");
    expect(nowPlaying([{ ...a, state: { on: false, reachable: true, media: { state: "idle" } } }])).toBeUndefined();
    expect(nowPlaying([{ ...a, state: { ...a.state, reachable: false } }])).toBeUndefined();
  });

  it("position interpolated while playing, frozen when paused, clamped to the duration", () => {
    const at = Date.parse("2026-10-14T15:00:00Z");
    const m = { state: "playing" as const, position: 60, duration: 200, updatedAt: new Date(at).toISOString() };
    expect(mediaPosition(m, at + 15_000)).toBeCloseTo(75);
    expect(mediaPosition({ ...m, state: "paused" }, at + 15_000)).toBe(60);
    expect(mediaPosition(m, at + 999_000)).toBe(200);
    expect(mediaPosition({ state: "playing" }, at)).toBeUndefined();
    expect(formatTime(187)).toBe("3:07");
    expect(formatTime(3729)).toBe("1:02:09");
    expect(formatTime(undefined)).toBe("–:––");
  });

  it("transport availability and optimistic prediction", () => {
    const d = homepod();
    expect(canMedia(d, "playPause")).toBe(true);
    expect(canMedia({ ...d, capabilities: { volume: true } }, "next")).toBe(false);
    const toggled = predict(d, { type: "toggle" });
    expect(toggled.state.media?.state).toBe("paused");
    expect(predict(toggled, { type: "media", command: "playPause" }).state.media?.state).toBe("playing");
    expect(predict(d, { type: "media", command: "next" }).state.media?.position).toBe(0);
  });

  it("relative artwork URLs resolve against the bridge base", () => {
    expect(resolveAsset("/api/home/media/x/artwork?h=1", "http://mac.local:8787")).toBe("http://mac.local:8787/api/home/media/x/artwork?h=1");
    expect(resolveAsset("/api/x", "")).toBe("/api/x");
    expect(resolveAsset("data:image/png;base64,AA", "http://b")).toBe("data:image/png;base64,AA");
    expect(resolveAsset(undefined, "http://b")).toBeUndefined();
  });
});

describe("3D looks", () => {
  it("HomePod: top light + notes while playing", () => {
    expect(lookForItem("speaker", [homepod()])).toMatchObject({ music: { playing: true }, glow: { on: true } });
    const paused = predict(homepod(), { type: "media", command: "pause" });
    expect(lookForItem("speaker", [paused])).toMatchObject({ music: { playing: false }, glow: { on: false } });
  });

  it("TV screen content only when on; Ambilight without color takes the brand accent", () => {
    const on = tv({ source: "Netflix", media: { state: "playing", app: "Netflix", title: "Les Ombres du Lac" } });
    expect(lookForItem("television", [on])?.screen).toEqual({ on: true, content: { app: "Netflix", title: "Les Ombres du Lac", source: "Netflix" } });
    expect(lookForItem("television", [tv({ on: false })])?.screen).toEqual({ on: false });
    const ambi: Device = { id: "ha:light.tv_ambilight", name: "Ambilight", kind: "light", source: "homeassistant", room: "Salon", itemId: "item_30", state: { on: true, reachable: true, brightness: 80 }, capabilities: { brightness: true, color: true } };
    expect(lookForItem("television", [on, ambi])?.strip?.color).toBe("#e50914");
    const red = { ...ambi, state: { ...ambi.state, color: "#00ff00" } };
    expect(lookForItem("television", [on, red])?.strip?.color).toBe("#00ff00");
    expect(tvContent(tv({}))).toBeUndefined();
  });
});

describe("TV card", () => {
  it("recognizes apps and inputs", () => {
    expect(brandOf("Netflix")?.style).toBe("netflix");
    expect(brandOf("YouTube")?.style).toBe("youtube");
    expect(brandOf("Amazon Prime Video")?.name).toBe("Prime Video");
    expect(brandOf("Disney+")?.style).toBe("disney");
    expect(brandOf("myCANAL")?.name).toBe("Canal+");
    expect(brandOf("Apple TV")?.style).toBe("appletv");
    expect(brandOf("Spotify")?.accent).toBe("#1db954");
    expect(brandOf("HDMI 2")).toMatchObject({ style: "hdmi", name: "HDMI 2" });
    expect(brandOf("Watch TV")?.style).toBe("channel");
    expect(brandOf("Zorglub")).toBeNull();
    expect(brandOf("Molotov")?.accent).toBe("#e6007e");
    expect(brandOf("YouTube Music")?.name).toBe("YouTube Music");
    expect(brandOf("france.tv")?.name).toBe("france.tv");
    expect(brandOf("TV d'Orange")?.accent).toBe("#ff7900");
    expect(brandOf("TV")?.style).toBe("channel");
  });

  it("app first, then channel, then source; unknown app gets a generic card", () => {
    expect(tvCardModel({ app: "Netflix", source: "HDMI 1", title: "X" })).toMatchObject({ brand: { style: "netflix" }, title: "X" });
    expect(tvCardModel({ channel: "France 2", source: "Watch TV", title: "Journal" })).toMatchObject({ brand: { style: "channel", name: "France 2" }, title: "Journal" });
    expect(tvCardModel({ source: "HDMI 1" })).toMatchObject({ brand: { name: "HDMI 1" } });
    expect(tvCardModel({ app: "Molotov" })).toMatchObject({ brand: { style: "generic", name: "Molotov" } });
    expect(tvCardModel({ app: "Netflix", artworkUrl: "/a" })?.artworkUrl).toBe("/a");
    expect(tvCardModel(undefined)).toBeNull();
    expect(tvCardKey(tvCardModel({ app: "Netflix" }))).not.toBe(tvCardKey(tvCardModel({ app: "Netflix", title: "Y" })));
  });
});

describe("TV with no info", () => {
  it("shows an « on » card instead of a stale image, and nothing when off", () => {
    expect(tvCardModel({})).toMatchObject({ brand: { name: "TV allumée" } });
    expect(tvCardModel(undefined)).toBeNull();
  });
});
