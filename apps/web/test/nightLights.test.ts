import { describe, expect, it } from "vitest";
import type { Item, Room, Scene, Vec3 } from "@appart3d/scene";
import { lampSources, localToWorld, MAX_NIGHT_LIGHTS, pickKeyLight, selectLights, type LampSource } from "../src/lib/nightLights";

const room = (id: string, x0: number, x1: number): Room => ({
  id,
  name: id,
  kind: "other",
  floor: [
    [x0, 0],
    [x1, 0],
    [x1, 4],
    [x0, 4],
  ],
  floorMaterial: "wood",
});

const item = (id: string, category: Item["category"], position: Vec3, extra: Partial<Item> = {}): Item => ({
  id,
  category,
  position,
  rotationY: 0,
  dimensions: [0.4, 1.6, 0.4],
  source: "user",
  ...extra,
});

const rooms = [room("a", 0, 4), room("b", 4, 30)];
const base: Pick<Scene, "items" | "walls" | "rooms"> = { walls: [], rooms, items: [] };

describe("lampSources", () => {
  it("only lamp-like items (and screens / fire) light up", () => {
    const s = lampSources({
      ...base,
      items: [
        item("l", "lamp", [1, 0.7, 1], { dimensions: [0.3, 0.5, 0.3] }),
        item("f", "floorLamp", [2, 0, 2]),
        item("p", "pendantLamp", [3, 1.6, 3], { dimensions: [0.35, 0.9, 0.35], mount: "ceiling" }),
        item("tv", "television", [5, 0.5, 1], { dimensions: [1.2, 0.7, 0.1] }),
        item("sofa", "sofa", [2, 0, 3]),
        item("plant", "plant", [3, 0, 1]),
      ],
    });
    expect(s.map((x) => x.itemId)).toEqual(["l", "f", "p", "tv"]);
    expect(s.find((x) => x.itemId === "p")!.overhead).toBe(true);
    expect(s.find((x) => x.itemId === "l")!.overhead).toBe(false);
  });

  it("puts the light in the shade (table lamp ~3/4 up, floor lamp near the top) and finds its room", () => {
    const [lamp, floor] = lampSources({
      ...base,
      items: [item("l", "lamp", [1, 0.7, 1], { dimensions: [0.3, 0.5, 0.3] }), item("f", "floorLamp", [5, 0, 2])],
    });
    expect(lamp!.position[1]).toBeCloseTo(0.7 + 0.5 * 0.74);
    expect(lamp!.roomId).toBe("a");
    expect(floor!.position[1]).toBeGreaterThan(1.3);
    expect(floor!.position[1]).toBeLessThan(1.6);
    expect(floor!.roomId).toBe("b");
    expect(floor!.bottomY).toBe(0);
  });

  it("arc floor lamps light from the shade at the end of the arc, following the rotation", () => {
    const [arc] = lampSources({
      ...base,
      items: [item("a", "floorLamp", [2, 0, 2], { variant: "floorLamp/arc", dimensions: [1.3, 1.9, 0.4], rotationY: Math.PI / 2 })],
    });
    // Local +X turns to world -Z with a +90° rotation about Y.
    expect(arc!.position[0]).toBeCloseTo(2);
    expect(arc!.position[2]).toBeLessThan(1.6);
  });

  it("screens light up in front of themselves", () => {
    const [tv] = lampSources({ ...base, items: [item("tv", "television", [5, 0.5, 1], { dimensions: [1.2, 0.7, 0.1] })] });
    expect(tv!.position[2]).toBeGreaterThan(1.2);
  });

  it("localToWorld matches three.js' rotation about +Y", () => {
    const p = localToWorld([1, 0, 1], Math.PI / 2, [1, 0.5, 0]);
    expect(p[0]).toBeCloseTo(1);
    expect(p[1]).toBeCloseTo(0.5);
    expect(p[2]).toBeCloseTo(0);
  });
});

describe("selectLights (capping)", () => {
  const many: LampSource[] = Array.from({ length: 16 }, (_, i) => ({
    itemId: `l${i}`,
    category: i % 3 === 0 ? "pendantLamp" : "lamp",
    position: [i * 1.5 + 0.5, 1, 2],
    bottomY: 0.6,
    color: "#fff",
    intensity: 1,
    distance: 4,
    decay: 1.5,
    roomId: i * 1.5 + 0.5 < 4 ? "a" : "b",
    weight: i % 3 === 0 ? 5 : 3,
    overhead: i % 3 === 0,
  }));

  it("keeps everything when under the cap", () => {
    expect(selectLights(many.slice(0, 5), [0, 0, 0], "a")).toHaveLength(5);
  });

  it("never exceeds the cap", () => {
    expect(MAX_NIGHT_LIGHTS).toBeLessThanOrEqual(10);
    expect(selectLights(many, [0, 0, 0], "a")).toHaveLength(MAX_NIGHT_LIGHTS);
    expect(selectLights(many, [0, 0, 0], "a", 4)).toHaveLength(4);
  });

  it("prefers lights near the camera focus and in its room", () => {
    const nearStart = selectLights(many, [0, 0, 2], "a", 4).map((s) => s.itemId);
    expect(nearStart).toContain("l0");
    expect(nearStart).toContain("l1");
    expect(nearStart).not.toContain("l15");
    const nearEnd = selectLights(many, [23, 0, 2], "b", 4).map((s) => s.itemId);
    expect(nearEnd).toContain("l15");
    expect(nearEnd).not.toContain("l0");
  });

  it("is deterministic", () => {
    expect(selectLights(many, [7, 0, 2], "b")).toEqual(selectLights(many, [7, 0, 2], "b"));
  });

  it("key light = an overhead light near the focus", () => {
    const key = pickKeyLight(selectLights(many, [9, 0, 2], "b"), [9, 0, 2]);
    expect(key?.overhead).toBe(true);
    expect(key?.itemId).toBe("l6");
    expect(pickKeyLight(many.filter((s) => !s.overhead), [0, 0, 0])).toBeUndefined();
  });
});
