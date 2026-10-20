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
  clearAzimuth,
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

describe("clearAzimuth", () => {
  // A 4 × 4 m room with a full-height partition (2.6 m) 1 m north of a lamp, along x.
  const partition = { id: "p", start: [0, 0] as const, end: [4, 0] as const, height: 2.6 };
  const far = { id: "far", start: [0, 9] as const, end: [4, 9] as const, height: 2.6 };
  const lamp = [2, 1, 1] as const;
  const polar = 1.13;

  it("keeps the preferred angle when nothing is in the way", () => {
    // Toward +z the only wall is 8 m away: the sight line (rising ≈ 0.47 m/m) clears it.
    expect(clearAzimuth(lamp, [partition, far], 0, polar)).toBe(0);
  });

  it("turns away from a wall right in front of the item, as little as possible", () => {
    // Toward −z the partition is 1 m away: the sight line is at ≈ 1.47 m, under 2.6 m.
    const az = clearAzimuth(lamp, [partition], Math.PI, polar);
    expect(az).not.toBe(Math.PI);
    // Nearest clear angle: the sight line passes beyond the end of the partition (x > 4 m at z = 0).
    const s = -1 / Math.cos(az);
    expect(lamp[0] + s * Math.sin(az) > 4 || lamp[0] + s * Math.sin(az) < 0).toBe(true);
  });

  it("uses the height the dollhouse view gives the wall from that angle", () => {
    // Lowered to 0.35 m (wall facing the camera): no longer in the way.
    expect(clearAzimuth(lamp, [partition], Math.PI, polar, () => 0.35)).toBe(Math.PI);
  });

  it("ignores the wall the item is mounted on", () => {
    const onWall = [2, 1.3, 0.1] as const;
    expect(clearAzimuth(onWall, [partition], 0, polar)).toBe(0);
  });

  it("parses the spotlight command", () => {
    expect(parseEmbedCommand({ type: "spotlightDevice", deviceId: "hue:light:3" })).toEqual({ type: "spotlightDevice", deviceId: "hue:light:3" });
    expect(parseEmbedCommand({ type: "spotlightDevice", deviceId: null })).toEqual({ type: "spotlightDevice", deviceId: null });
  });
});
