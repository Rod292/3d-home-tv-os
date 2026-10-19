import type { HomeEvent } from "@appart3d/home";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, mergeConfig } from "../src/config.ts";
import { forcedSunElevation, Hub } from "../src/hub.ts";
import { MockAdapter } from "../src/mock.ts";
import { computeSun, nextCrossing, shouldPushSun, solarElevation, sunFromHa } from "../src/sun.ts";

const PARIS = [48.86, 2.35] as const;

describe("solarElevation (NOAA)", () => {
  it("summer solstice noon in Paris ≈ 64–65°", () => {
    const e = solarElevation(new Date("2024-06-21T12:00:00Z"), ...PARIS);
    expect(e).toBeGreaterThan(63.5);
    expect(e).toBeLessThan(65.5);
  });
  it("winter solstice noon in Paris ≈ 18°", () => {
    const e = solarElevation(new Date("2024-12-21T12:00:00Z"), ...PARIS);
    expect(e).toBeGreaterThan(17);
    expect(e).toBeLessThan(19);
  });
  it("negative at midnight", () => {
    expect(solarElevation(new Date("2024-06-21T23:00:00Z"), ...PARIS)).toBeLessThan(0);
    expect(solarElevation(new Date("2024-12-21T00:00:00Z"), ...PARIS)).toBeLessThan(-50);
  });
  it("sunrise / sunset in Paris near the published times", () => {
    // 2024-06-21: sunrise 05:47 CEST (03:47 UTC), sunset 21:58 CEST (19:58 UTC).
    const rise = nextCrossing(new Date("2024-06-21T00:00:00Z"), ...PARIS, true)!;
    const set = nextCrossing(new Date("2024-06-21T00:00:00Z"), ...PARIS, false)!;
    expect(Math.abs(rise.getTime() - Date.parse("2024-06-21T03:47:00Z"))).toBeLessThan(4 * 60_000);
    expect(Math.abs(set.getTime() - Date.parse("2024-06-21T19:58:00Z"))).toBeLessThan(4 * 60_000);
  });
  it("computeSun fills isDay and next times", () => {
    const day = computeSun(new Date("2024-06-21T12:00:00Z"), ...PARIS);
    expect(day.isDay).toBe(true);
    expect(Date.parse(day.nextSetting!)).toBeLessThan(Date.parse(day.nextRising!));
    expect(computeSun(new Date("2024-06-21T23:00:00Z"), ...PARIS).isDay).toBe(false);
  });
});

describe("sunFromHa", () => {
  it("parses sun.sun", () => {
    expect(
      sunFromHa({
        state: "above_horizon",
        attributes: { elevation: 31.234, next_rising: "2026-10-15T06:12:00+00:00", next_setting: "2026-10-14T17:05:00+00:00" },
      }),
    ).toEqual({ elevation: 31.23, isDay: true, nextRising: "2026-10-15T06:12:00.000Z", nextSetting: "2026-10-14T17:05:00.000Z" });
    expect(sunFromHa({ state: "below_horizon", attributes: { elevation: -12 } })).toEqual({ elevation: -12, isDay: false });
  });
  it("null when unavailable or without elevation", () => {
    expect(sunFromHa(undefined)).toBeNull();
    expect(sunFromHa({ state: "unavailable", attributes: { elevation: 3 } })).toBeNull();
    expect(sunFromHa({ state: "above_horizon", attributes: {} })).toBeNull();
  });
});

describe("shouldPushSun", () => {
  it("thresholds", () => {
    const a = { elevation: 10, isDay: true };
    expect(shouldPushSun(null, a)).toBe(true);
    expect(shouldPushSun(a, { elevation: 10.4, isDay: true })).toBe(false);
    expect(shouldPushSun(a, { elevation: 10.5, isDay: true })).toBe(true);
    expect(shouldPushSun({ elevation: -0.7, isDay: true }, { elevation: -0.9, isDay: false })).toBe(true);
    expect(shouldPushSun(a, null)).toBe(false);
  });
});

describe("hub sun", () => {
  afterEach(() => vi.useRealTimers());

  it("config has Paris by default and merges a saved location", () => {
    expect(defaultConfig().location).toEqual({ latitude: 48.86, longitude: 2.35 });
    expect(mergeConfig(defaultConfig(), { location: { latitude: 43.3 } }).location).toEqual({ latitude: 43.3, longitude: 2.35 });
  });

  it("snapshot always carries a computed sun without Home Assistant", async () => {
    const hub = new Hub(defaultConfig(), { adapters: [new MockAdapter(0)], now: () => new Date("2024-06-21T12:00:00Z") });
    await hub.start();
    const sun = hub.snapshot().sun!;
    expect(sun.isDay).toBe(true);
    expect(sun.elevation).toBeGreaterThan(63);
    hub.stop();
  });

  it("pushes a snapshot when the sun moved ≥ 0.5°", async () => {
    vi.useFakeTimers();
    let now = new Date("2024-06-21T18:00:00Z").getTime();
    const hub = new Hub(defaultConfig(), { adapters: [new MockAdapter(0)], now: () => new Date(now), sunIntervalMs: 60_000 });
    await hub.start();
    const events: HomeEvent[] = [];
    hub.subscribe((e) => events.push(e));
    now += 60_000; // ~0.15° in a minute: no push
    vi.advanceTimersByTime(60_000);
    expect(events).toHaveLength(0);
    now += 10 * 60_000; // ~1.5°
    vi.advanceTimersByTime(60_000);
    expect(events).toHaveLength(1);
    expect(events[0]!.type === "snapshot" && events[0]!.snapshot.sun).toBeTruthy();
    hub.stop();
  });

  it("prefers Home Assistant's sun, unless HA's location is clearly wrong", () => {
    const now = () => new Date("2026-10-14T14:26:00Z"); // Paris ≈ 22°
    const haWith = (elevation: number) => ({ sun: () => ({ elevation, isDay: true }), name: "homeassistant" }) as never;
    const ok = new Hub(defaultConfig(), { adapters: [], ha: haWith(21.5), now });
    expect(ok.sun().elevation).toBe(21.5);
    // HA left at latitude/longitude 0 reports the equator's sky (≈ 49°): use the local computation.
    const wrong = new Hub(defaultConfig(), { adapters: [], ha: haWith(49.49), now });
    expect(wrong.sun().elevation).toBeGreaterThan(18);
    expect(wrong.sun().elevation).toBeLessThan(26);
  });

  it("forced elevation (HOME_BRIDGE_SUN_ELEVATION)", async () => {
    expect(forcedSunElevation({ HOME_BRIDGE_SUN_ELEVATION: "2.5" })).toBe(2.5);
    expect(forcedSunElevation({ HOME_BRIDGE_SUN_ELEVATION: "x" })).toBeUndefined();
    expect(forcedSunElevation({})).toBeUndefined();
    const hub = new Hub(defaultConfig(), { adapters: [], sunElevation: -20 });
    expect(hub.snapshot().sun).toEqual({ elevation: -20, isDay: false });
  });
});
