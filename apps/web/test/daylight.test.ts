import { describe, expect, it } from "vitest";
import type { Device } from "@appart3d/home";
import { daylightTarget, duskForElevation, nightProgressForElevation, parseDaylight } from "../src/state/night";
import {
  facingAzimuth,
  findLivingRoom,
  mainArea,
  flightTarget,
  frameRoom,
  LIVING_POLAR,
  livingFraming,
  parseEmbedCommand,
  parseFrame,
  swayOffset,
  SWAY_AMPLITUDE,
  switchedItems,
} from "../src/lib/embed";

describe("follow the sun", () => {
  it("maps the solar elevation to the night blend", () => {
    expect(nightProgressForElevation(30)).toBe(0);
    expect(nightProgressForElevation(6)).toBe(0);
    expect(nightProgressForElevation(0)).toBeCloseTo(0.5);
    expect(nightProgressForElevation(-6)).toBe(1);
    expect(nightProgressForElevation(-20)).toBe(1);
    expect(nightProgressForElevation(2)).toBeGreaterThan(0.2);
  });
  it("warms the light near the horizon only", () => {
    expect(duskForElevation(1)).toBe(1);
    expect(duskForElevation(30)).toBe(0);
    expect(duskForElevation(-20)).toBe(0);
    expect(duskForElevation(3)).toBeGreaterThan(0.5);
  });
  it("picks the blend target per mode", () => {
    expect(daylightTarget("auto", 30, true).progress).toBe(0);
    expect(daylightTarget("auto", -20, false).progress).toBe(1);
    expect(daylightTarget("auto", null, true)).toEqual({ progress: 1, dusk: 0 });
    expect(daylightTarget("day", -20, true)).toEqual({ progress: 0, dusk: 0 });
    expect(daylightTarget("night", 30, false)).toEqual({ progress: 1, dusk: 0 });
    expect(parseDaylight("auto")).toBe("auto");
    expect(parseDaylight("noon")).toBeNull();
  });
});

describe("embed commands (daylight / frame)", () => {
  it("parses setDaylight and frame", () => {
    expect(parseEmbedCommand({ type: "setDaylight", mode: "auto" })).toEqual({ type: "setDaylight", mode: "auto" });
    expect(parseEmbedCommand('{"type":"frame","target":"all"}')).toEqual({ type: "frame", target: "all" });
    expect(parseEmbedCommand({ type: "setDaylight", mode: "dusk" })).toBeNull();
    expect(parseEmbedCommand({ type: "frame", target: "kitchen" })).toBeNull();
    expect(parseFrame("living")).toBe("living");
    expect(parseFrame(null)).toBeNull();
  });
});

// A reference apartment (simplified): the living room (Séjour) with the TV on the north wall, and the bedroom.
const sejour = { id: "room_2", floor: [[9.8, 6.97], [5.83, 6.97], [5.83, 4.61], [3.49, 4.72], [3.49, 2.69], [5.83, 2.69], [5.83, 0.5], [9.8, 0.5]] as [number, number][] };
const chambre = { id: "room_1", floor: [[3.49, 6.68], [0.5, 6.85], [0.5, 3.44], [3.49, 3.55]] as [number, number][] };
const tv = { id: "item_30", category: "television", position: [7.91, 0.5, 0.73] as const, rotationY: 0, dimensions: [1.19, 0.69, 0.1] as const };
const sofa = { id: "item_2", category: "sofa", position: [7.89, 0, 3.5] as const, rotationY: -Math.PI, dimensions: [2.34, 0.8, 1.03] as const };

describe("living-room framing", () => {
  it("finds the room of the linked TV, else the largest room", () => {
    expect(findLivingRoom([sofa, tv], [chambre, sejour], [{ itemId: "item_30" }])?.room.id).toBe("room_2");
    expect(findLivingRoom([sofa], [chambre, sejour], [])).toEqual({ room: sejour, tv: null });
    expect(findLivingRoom([], [], [])).toBeNull();
  });
  it("puts the camera on the sofa side, facing the TV", () => {
    // TV on the north wall facing +z: camera at +z (azimuth 0) looking toward −z.
    expect(facingAzimuth(tv, sejour.floor, 1)).toBeCloseTo(0);
    // A TV model turned the wrong way still gets faced from the room side.
    expect(Math.cos(facingAzimuth({ ...tv, rotationY: Math.PI }, sejour.floor, 1))).toBeGreaterThan(0.5);
    expect(facingAzimuth(null, sejour.floor, 1)).toBe(1);
  });
  it("zooms so the room fills ~85 % of the view, centered", () => {
    const f = frameRoom([[0, 0], [4, 0], [4, 4], [0, 4]], 400, 4000, 0, LIVING_POLAR);
    // Width-limited: 4 m across → 0.85 × 400 / 4.
    expect(f.zoom).toBeCloseTo(85);
    expect(f.target[0]).toBeCloseTo(2);
    const lf = livingFraming([sofa, tv], [chambre, sejour], [{ itemId: "item_30" }], 390, 470, 0.7)!;
    expect(lf.az).toBeCloseTo(0);
    expect(lf.polar).toBe(LIVING_POLAR);
    expect(lf.target[0]).toBeGreaterThan(7.3);
    expect(lf.target[0]).toBeLessThan(8.3);
  });
  it("frames the TV / sofa part of an L-shaped room", () => {
    const area = mainArea(sejour.floor, tv);
    const xs = area.map((p) => p[0]);
    const zs = area.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(5.83);
    expect(Math.max(...xs)).toBeCloseTo(9.8);
    expect(Math.min(...zs)).toBeCloseTo(0.5);
    expect(Math.max(...zs)).toBeCloseTo(6.97);
    // A plain rectangle stays itself; no TV is fine too.
    expect(mainArea(chambre.floor, null).length).toBe(4);
  });
  it("sways ±35° around the default azimuth", () => {
    expect(swayOffset(0)).toBe(0);
    expect(swayOffset(10)).toBeCloseTo(SWAY_AMPLITUDE);
    expect(swayOffset(30)).toBeCloseTo(-SWAY_AMPLITUDE);
  });
});

describe("flights toward switched devices", () => {
  const dev = (id: string, on: boolean, itemId?: string, reachable = true) =>
    ({ id, kind: "light", itemId, state: { on, reachable }, capabilities: {} }) as unknown as Device;
  const isOn = (d: Device) => d.state.on === true;
  it("reports items whose device switched (not the first snapshot)", () => {
    const first = switchedItems(new Map(), [dev("a", true, "item_1"), dev("b", false, "item_2")], isOn);
    expect(first.changed).toEqual([]);
    const second = switchedItems(first.next, [dev("a", false, "item_1"), dev("b", false, "item_2"), dev("c", true)], isOn);
    expect(second.changed).toEqual(["item_1"]);
    // Unreachable devices are ignored; coming back is not a switch.
    const third = switchedItems(second.next, [dev("a", false, "item_1", false)], isOn);
    expect(third.changed).toEqual([]);
    expect(switchedItems(third.next, [dev("a", true, "item_1")], isOn).changed).toEqual([]);
  });
  it("aims a little above the item, lamps on the ceiling included", () => {
    expect(flightTarget({ position: [1, 0, 2], dimensions: [0.4, 1.5, 0.4] }).target).toEqual([1, 0.8999999999999999, 2]);
    expect(flightTarget({ position: [1, 2.2, 2], dimensions: [0.5, 0.3, 0.5] }).target[1]).toBe(1.2);
  });
});
