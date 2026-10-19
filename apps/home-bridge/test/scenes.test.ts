import type { Device } from "@appart3d/home";
import { describe, expect, it } from "vitest";
import { planScene, SCENE_COLORS } from "../src/scenes.ts";

const light = (id: string, room: string, on: boolean | null, extra: Partial<Device> = {}): Device => ({
  id,
  name: id,
  kind: "light",
  source: "hue",
  room,
  state: { on, reachable: on !== null },
  capabilities: { brightness: true, color: true, kelvin: true },
  ...extra,
});

const devices: Device[] = [
  light("hue:light:12", "Salon", true, { name: "lightstrip" }),
  light("hue:light:18", "Salon", false),
  light("hue:light:9", "Salon", null),
  light("hue:light:17", "Cuisine", true),
  { ...light("hue:light:8", "Chambre", false), kind: "plug", capabilities: {} },
  { id: "ha:fan.f", name: "fan", kind: "fan", source: "homeassistant", room: "Chambre", state: { on: true, reachable: true, speed: 50, lightOn: true }, capabilities: { speedSteps: 6, fanLight: true } },
  { id: "ha:media_player.tv", name: "TV", kind: "tv", source: "homeassistant", room: "Salon", state: { on: true, reachable: true }, capabilities: { volume: true } },
];
const opts = { ambientStrip: "hue:light:12" };
const byId = (plan: ReturnType<typeof planScene>) => Object.fromEntries((plan ?? []).map((p) => [p.deviceId, p.actions]));

describe("planScene", () => {
  it("unknown scene -> null", () => {
    expect(planScene("party", devices, opts)).toBeNull();
  });

  it("Lumineux: every light 100% neutral white, plug on, nothing else", () => {
    const p = byId(planScene("bright", devices, opts));
    expect(Object.keys(p).sort()).toEqual(["hue:light:12", "hue:light:17", "hue:light:18", "hue:light:8", "hue:light:9"]);
    expect(p["hue:light:17"]).toEqual([{ type: "power", on: true }, { type: "brightness", value: 100 }, { type: "kelvin", value: SCENE_COLORS.neutralKelvin }]);
    expect(p["hue:light:8"]).toEqual([{ type: "power", on: true }]);
  });

  it("Cosy: living room only, warm 2700K 45%, strip amber", () => {
    const p = byId(planScene("cozy", devices, opts));
    expect(Object.keys(p).sort()).toEqual(["hue:light:12", "hue:light:18", "hue:light:9"]);
    expect(p["hue:light:18"]).toEqual([{ type: "power", on: true }, { type: "brightness", value: 45 }, { type: "kelvin", value: 2700 }]);
    expect(p["hue:light:12"]).toEqual([{ type: "power", on: true }, { type: "brightness", value: 45 }, { type: "color", hex: SCENE_COLORS.amber }]);
  });

  it("Film: lights off except strip 25% violet, TV on, already-off lights skipped", () => {
    const p = byId(planScene("movie", devices, opts));
    expect(p["hue:light:12"]).toEqual([{ type: "power", on: true }, { type: "brightness", value: 25 }, { type: "color", hex: SCENE_COLORS.movie }]);
    expect(p["hue:light:17"]).toEqual([{ type: "power", on: false }]);
    expect(p["hue:light:18"]).toBeUndefined();
    expect(p["ha:media_player.tv"]).toEqual([{ type: "power", on: true }]);
    expect(p["ha:fan.f"]).toBeUndefined();
  });

  it("Nuit: all off except bedroom plug; TV off; fan keeps blowing, light off", () => {
    const p = byId(planScene("night", devices, opts));
    expect(p["hue:light:8"]).toEqual([{ type: "power", on: true }]);
    expect(p["hue:light:12"]).toEqual([{ type: "power", on: false }]);
    expect(p["ha:media_player.tv"]).toEqual([{ type: "power", on: false }]);
    expect(p["ha:fan.f"]).toEqual([{ type: "fanLight", on: false }]);
  });

  it("Absent: everything off including fan and TV", () => {
    const p = byId(planScene("away", devices, opts));
    expect(p["ha:fan.f"]).toEqual([{ type: "power", on: false }, { type: "fanLight", on: false }]);
    expect(p["ha:media_player.tv"]).toEqual([{ type: "power", on: false }]);
    expect(p["hue:light:8"]).toBeUndefined(); // already off
  });

  it("never sends an IR power toggle to a TV whose state is unknown", () => {
    const tv: Device = { ...devices[6]!, id: "robot:tv", source: "robot", state: { on: null, reachable: true } };
    expect(byId(planScene("away", [tv], opts))["robot:tv"]).toBeUndefined();
  });

  it("finds the strip by name when the role id is missing", () => {
    const p = byId(planScene("movie", devices, { ambientStrip: null }));
    expect(p["hue:light:12"]?.[2]).toEqual({ type: "color", hex: SCENE_COLORS.movie });
  });
});
