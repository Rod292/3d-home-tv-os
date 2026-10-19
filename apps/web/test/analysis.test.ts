import { describe, expect, it } from "vitest";
import { demoScene, type Item, type Scene } from "@appart3d/scene";
import { findConflicts, groupItemsByRoom, matchesQuery, needsReview, normalizeText } from "../src/state/analysis";
import { defaultElevationFor, effectiveMount, maxElevation } from "../src/state/mount";

const item = (over: Partial<Item>): Item => ({
  id: "i",
  category: "sofa",
  position: [0, 0, 0],
  rotationY: 0,
  dimensions: [1, 1, 1],
  source: "user",
  ...over,
});

describe("search", () => {
  it("ignores accents and case", () => {
    expect(normalizeText("Étagère")).toBe("etagere");
    expect(matchesQuery("etagere", "Étagère murale")).toBe(true);
    expect(matchesQuery("REFRIG", "Réfrigérateur")).toBe(true);
  });
  it("requires every word, across fields", () => {
    expect(matchesQuery("canape salon", "Canapé", "Salon")).toBe(true);
    expect(matchesQuery("canape cuisine", "Canapé", "Salon")).toBe(false);
    expect(matchesQuery("   ", "x")).toBe(true);
  });
});

describe("needsReview", () => {
  it("flags only low-confidence scanned items", () => {
    expect(needsReview(item({ source: "scan", confidence: 0.3 }))).toBe(true);
    expect(needsReview(item({ source: "scan", confidence: 0.5 }))).toBe(false);
    expect(needsReview(item({ source: "scan" }))).toBe(false);
    expect(needsReview(item({ source: "user", confidence: 0.1 }))).toBe(false);
  });
});

describe("conflicts", () => {
  it("lists both overlapping items", () => {
    const scene: Scene = { ...demoScene, walls: [], items: [item({ id: "a" }), item({ id: "b", position: [0.3, 0, 0] }), item({ id: "c", position: [5, 0, 5] })] };
    expect(findConflicts(scene).map((c) => c.id).sort()).toEqual(["a", "b"]);
  });
});

describe("groupItemsByRoom", () => {
  it("groups by room in plan order, orphans last", () => {
    const room = demoScene.rooms[0]!;
    const scene: Scene = {
      ...demoScene,
      items: [item({ id: "far", position: [999, 0, 999] }), item({ id: "in", roomId: room.id })],
    };
    const groups = groupItemsByRoom(scene);
    expect(groups[0]!.roomId).toBe(room.id);
    expect(groups.at(-1)!.roomId).toBeNull();
    expect(groups.at(-1)!.items[0]!.id).toBe("far");
  });
});

describe("mount helpers", () => {
  const walls = [{ id: "w", start: [0, 0], end: [4, 0], height: 2.6, thickness: 0.1 }] as Scene["walls"];
  it("explicit mount wins over the catalog default", () => {
    expect(effectiveMount(item({ category: "sofa" }))).toBe("floor");
    expect(effectiveMount(item({ category: "sofa", mount: "wall" }))).toBe("wall");
  });
  it("picks a sensible elevation per mount", () => {
    expect(defaultElevationFor(item({ mount: "floor", dimensions: [1, 0.5, 0.1] }), { walls })).toBe(0);
    expect(defaultElevationFor(item({ mount: "ceiling", dimensions: [1, 0.5, 1] }), { walls })).toBeCloseTo(2.1);
    const wallY = defaultElevationFor(item({ mount: "wall", dimensions: [1, 0.5, 0.05] }), { walls });
    expect(wallY).toBeGreaterThan(0);
    expect(wallY + 0.5).toBeLessThanOrEqual(2.6);
    expect(maxElevation(item({ dimensions: [1, 0.6, 1] }), { walls })).toBeCloseTo(2.0);
  });
});
