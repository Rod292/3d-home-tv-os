import { describe, expect, it } from "vitest";
import { briToPercent, hexToXy, kelvinToHex, parseHex, percentToBri, xyToHex } from "../src/color.ts";
import { hueActionsToBody, hueLightToDevice, hueRoomIndex, type HueLight } from "../src/hue.ts";

// Shapes copied from the real bridge (read-only GET).
const strip: HueLight = {
  name: "lightstrip",
  type: "Extended color light",
  modelid: "LCX004",
  state: { on: true, bri: 127, hue: 9134, sat: 114, xy: [0.4363, 0.4087], ct: 332, colormode: "xy", reachable: true },
  capabilities: { control: { ct: { min: 153, max: 500 }, colorgamuttype: "C" } },
};
const ikea: HueLight = {
  name: "IKEA lampe",
  type: "Extended color light",
  state: { on: false, bri: 254, xy: [0.4364, 0.4087], ct: 370, colormode: "ct", reachable: false },
  capabilities: { control: { ct: { min: 250, max: 454 }, colorgamuttype: "other" } },
};
const plug: HueLight = { name: "IKEA donut", type: "On/Off plug-in unit", state: { on: false, reachable: true } };

const dist = (a: string, b: string) => {
  const x = parseHex(a)!;
  const y = parseHex(b)!;
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]!)));
};

describe("color conversions", () => {
  it("bri <-> percent", () => {
    expect(briToPercent(254)).toBe(100);
    expect(briToPercent(1)).toBe(1);
    expect(briToPercent(127)).toBe(50);
    expect(percentToBri(100)).toBe(254);
    expect(percentToBri(0)).toBe(1);
    for (const p of [1, 25, 45, 50, 77, 100]) expect(briToPercent(percentToBri(p))).toBe(p);
  });

  it("hex -> xy -> hex round-trips colors (brightness normalised to full)", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ff8a1f", "#ffffff", "#ff00ff"]) {
      const [x, y] = hexToXy(hex);
      expect(dist(xyToHex(x, y), hex)).toBeLessThanOrEqual(3);
    }
    // darker input comes back at full brightness, same hue
    const [x, y] = hexToXy("#4b1fd1");
    const [r, g, b] = [0x4b, 0x1f, 0xd1].map((c) => (c * 255) / 0xd1);
    expect(dist(xyToHex(x, y), `#${[r, g, b].map((c) => Math.round(c!).toString(16).padStart(2, "0")).join("")}`)).toBeLessThanOrEqual(3);
  });

  it("white point maps to near white", () => {
    expect(dist(xyToHex(0.3127, 0.329), "#ffffff")).toBeLessThan(25);
  });

  it("kelvin -> hex is warm at 2700K, neutral at 6500K", () => {
    const [r, , b] = parseHex(kelvinToHex(2700))!;
    expect(r).toBe(255);
    expect(b).toBeLessThan(180);
    expect(dist(kelvinToHex(6500), "#ffffff")).toBeLessThan(12);
  });
});

describe("Hue light -> Device", () => {
  it("maps a reachable color strip (xy mode)", () => {
    const d = hueLightToDevice("12", strip, "Living room");
    expect(d).toMatchObject({ id: "hue:light:12", name: "lightstrip", kind: "light", source: "hue", room: "Living room" });
    expect(d.state).toMatchObject({ on: true, reachable: true, brightness: 50 });
    expect(d.state.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(d.state.kelvin).toBeUndefined();
    expect(d.capabilities).toEqual({ brightness: true, color: true, kelvin: true });
  });

  it("maps ct mode to kelvin and unreachable to on:null", () => {
    const d = hueLightToDevice("18", ikea, "Living room");
    expect(d.state).toMatchObject({ on: null, reachable: false, kelvin: 2703 });
  });

  it("maps an on/off plug", () => {
    const d = hueLightToDevice("8", plug, "Bedroom");
    expect(d.kind).toBe("plug");
    expect(d.state).toEqual({ on: false, reachable: true });
    expect(d.capabilities).toEqual({});
  });

  it("indexes rooms only (not zones)", () => {
    const idx = hueRoomIndex({
      "83": { name: "Living room", type: "Room", lights: ["18", "12", "9"] },
      "84": { name: "TV chill", type: "Zone", lights: ["12", "18"] },
      "85": { name: "Kitchen", type: "Room", lights: ["17"] },
    });
    expect(idx.get("12")).toBe("Living room");
    expect(idx.get("17")).toBe("Kitchen");
  });
});

describe("DeviceAction -> Hue body", () => {
  it("brightness / kelvin / color", () => {
    expect(hueActionsToBody([{ type: "brightness", value: 45 }], strip)).toEqual({ on: true, bri: 114 });
    expect(hueActionsToBody([{ type: "kelvin", value: 2700 }], strip)).toEqual({ on: true, ct: 370 });
    const c = hueActionsToBody([{ type: "color", hex: "#ff0000" }], strip);
    expect(c.on).toBe(true);
    expect(c.xy).toEqual(hexToXy("#ff0000"));
  });

  it("clamps ct to the light's range", () => {
    expect(hueActionsToBody([{ type: "kelvin", value: 6500 }], ikea)).toEqual({ on: true, ct: 250 });
    expect(hueActionsToBody([{ type: "kelvin", value: 1800 }], ikea)).toEqual({ on: true, ct: 454 });
  });

  it("merges several actions, last color wins", () => {
    expect(
      hueActionsToBody([{ type: "power", on: true }, { type: "brightness", value: 100 }, { type: "color", hex: "#00ff00" }, { type: "kelvin", value: 4000 }], strip),
    ).toEqual({ on: true, bri: 254, ct: 250 });
  });

  it("off wins and strips other params; brightness 0 = off", () => {
    expect(hueActionsToBody([{ type: "brightness", value: 30 }, { type: "power", on: false }], strip)).toEqual({ on: false });
    expect(hueActionsToBody([{ type: "brightness", value: 0 }], strip)).toEqual({ on: false });
  });

  it("toggle uses current state; plug only takes on/off", () => {
    expect(hueActionsToBody([{ type: "toggle" }], strip)).toEqual({ on: false });
    expect(hueActionsToBody([{ type: "toggle" }], plug)).toEqual({ on: true });
    expect(hueActionsToBody([{ type: "power", on: true }, { type: "brightness", value: 50 }], plug)).toEqual({ on: true });
  });

  it("rejects actions that make no sense for a light", () => {
    expect(() => hueActionsToBody([{ type: "speed", value: 3 }], strip)).toThrow();
  });
});
