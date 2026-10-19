import { describe, expect, it } from "vitest";
import type { Device } from "@appart3d/home";
import {
  AUTO_ROTATE_RESUME_MS,
  deviceIdsForItem,
  embedFitZoom,
  isEmbedView,
  itemFocusSize,
  itemForDevice,
  parseEmbedCommand,
  shouldAutoRotate,
  parseOrbit,
  parseTilt,
  centroid,
} from "../src/lib/embed";

const dev = (id: string, itemId?: string) => ({ id, itemId }) as unknown as Device;

describe("embedded 3D view helpers", () => {
  it("detects ?view=3d", () => {
    expect(isEmbedView(new URLSearchParams("view=3d&scene=/s.json"))).toBe(true);
    expect(isEmbedView(new URLSearchParams("view=2d"))).toBe(false);
    expect(isEmbedView(new URLSearchParams(""))).toBe(false);
  });

  it("parses and validates commands", () => {
    expect(parseEmbedCommand({ type: "focusItem", itemId: "item_1" })).toEqual({ type: "focusItem", itemId: "item_1" });
    expect(parseEmbedCommand({ type: "focusItem", itemId: null })).toEqual({ type: "focusItem", itemId: null });
    expect(parseEmbedCommand('{"type":"highlightDevice","deviceId":"hue:light:12"}')).toEqual({ type: "highlightDevice", deviceId: "hue:light:12" });
    expect(parseEmbedCommand({ type: "setNight", night: true })).toEqual({ type: "setNight", night: true });
    expect(parseEmbedCommand({ type: "overview", extra: 1 })).toEqual({ type: "overview" });
    expect(parseEmbedCommand({ type: "autoRotate", enabled: false })).toEqual({ type: "autoRotate", enabled: false });
    for (const bad of [null, 3, "nope", "{", { type: "focusItem" }, { type: "focusItem", itemId: "" }, { type: "setNight", night: "1" }, { type: "autoRotate" }, { type: "boom" }])
      expect(parseEmbedCommand(bad)).toBeNull();
  });

  it("device ↔ item lookups", () => {
    const devices = [dev("a", "item_lamp"), dev("b", "item_tv"), dev("c", "item_tv"), dev("d")];
    expect(itemForDevice(devices, "b")).toBe("item_tv");
    expect(itemForDevice(devices, "d")).toBeNull();
    expect(itemForDevice(devices, "zzz")).toBeNull();
    expect(itemForDevice(devices, null)).toBeNull();
    expect(deviceIdsForItem(devices, "item_tv")).toEqual(["b", "c"]);
    expect(deviceIdsForItem(devices, "item_sofa")).toEqual([]);
  });

  it("framing", () => {
    expect(itemFocusSize([0.5, 1.5, 0.4])).toBeCloseTo(3.7);
    // Portrait phone: width-limited; the footprint fits with margins.
    const z = embedFitZoom(390, 844, 10, 0.96);
    expect(z * 10).toBeLessThan(390 * 0.95);
    expect(z * 10).toBeGreaterThan(390 * 0.85);
    expect(embedFitZoom(10, 10, 100, 0.96)).toBe(4);
  });

  it("auto-rotation pauses on touch and focus, resumes after idle", () => {
    const base = { enabled: true, focused: false, interacting: false, lastInteraction: 0, now: AUTO_ROTATE_RESUME_MS };
    expect(shouldAutoRotate(base)).toBe(true);
    expect(shouldAutoRotate({ ...base, enabled: false })).toBe(false);
    expect(shouldAutoRotate({ ...base, focused: true })).toBe(false);
    expect(shouldAutoRotate({ ...base, interacting: true })).toBe(false);
    expect(shouldAutoRotate({ ...base, lastInteraction: 1 })).toBe(false);
  });
});

describe("orbit / tilt params", () => {
  it("parses the full turn and the tilt", () => {
    expect(parseOrbit("full")).toBe("full");
    expect(parseOrbit(null)).toBe("sway");
    expect(parseTilt("64")).toBeCloseTo((64 * Math.PI) / 180);
    expect(parseTilt("10")).toBeNull();
    expect(parseTilt("abc")).toBeNull();
  });
});

describe("centroid", () => {
  it("is the area center of a polygon", () => {
    expect(centroid([[0, 0], [4, 0], [4, 2], [0, 2]])).toEqual([2, 1]);
  });
});
