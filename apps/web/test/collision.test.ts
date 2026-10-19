import { describe, expect, it } from "vitest";
import { demoScene, type Item } from "@appart3d/scene";
import { convexPenetration } from "../src/lib/geom2d";
import { hasCollision, itemCollisions } from "../src/lib/collision";

const base: Item = { id: "x", category: "armchair", position: [3, 0, 3], rotationY: 0, dimensions: [0.8, 0.8, 0.8], source: "user" };

describe("collision", () => {
  it("SAT detects overlap and separation, including rotated boxes", () => {
    const a: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(convexPenetration(a, [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]])).toBeCloseTo(0.5);
    expect(convexPenetration(a, [[2, 0], [3, 0], [3, 1], [2, 1]])).toBeLessThan(0);
    // Diamond whose corner points to the square but does not touch it.
    expect(convexPenetration(a, [[1.6, 0.5], [2.1, 0], [2.6, 0.5], [2.1, 1]])).toBeLessThan(0);
  });

  it("flags walls and furniture overlaps", () => {
    const scene = { ...demoScene, items: [] };
    expect(hasCollision(base, scene)).toBe(false);
    const inWall = { ...base, position: [6, 0, 1.5] as [number, number, number] };
    expect(itemCollisions(inWall, scene).walls).toContain("wall_mid");
    const other = { ...base, id: "y", position: [3.3, 0, 3] as [number, number, number] };
    expect(itemCollisions(base, { ...scene, items: [base, other] }).items).toEqual(["y"]);
  });

  it("ignores stacked items, rugs and chairs tucked under tables", () => {
    const scene = { ...demoScene, items: [] };
    const stand: Item = { ...base, id: "stand", category: "tvStand", dimensions: [1.6, 0.5, 0.4] };
    const tv: Item = { ...base, id: "tv", category: "television", position: [3, 0.5, 3], dimensions: [1.2, 0.7, 0.08] };
    expect(hasCollision(tv, { ...scene, items: [stand, tv] })).toBe(false);
    const rug: Item = { ...base, id: "rug", category: "rug", dimensions: [2, 0.01, 2] };
    expect(hasCollision(base, { ...scene, items: [rug, base] })).toBe(false);
    const table: Item = { ...base, id: "t", category: "table", dimensions: [1.4, 0.75, 0.8] };
    const chair: Item = { ...base, id: "c", category: "chair", position: [3, 0, 3.4], dimensions: [0.45, 0.85, 0.45] };
    expect(hasCollision(chair, { ...scene, items: [table, chair] })).toBe(false);
  });

  it("the demo's sofa and bed are not flagged", () => {
    for (const cat of ["sofa", "bed", "wardrobe"]) {
      const it = demoScene.items.find((i) => i.category === cat)!;
      expect(hasCollision(it, demoScene)).toBe(false);
    }
  });
});
