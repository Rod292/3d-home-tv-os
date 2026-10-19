import { describe, expect, it } from "vitest";
import type { Item, Wall } from "@appart3d/scene";
import { settleItems } from "../src/settle";

const wall: Wall = { id: "w", start: [0, 0], end: [4, 0], height: 2.5, thickness: 0.12 };
const item = (z: number): Item => ({ id: "i", category: "storage", position: [2, 0, z], rotationY: 0, dimensions: [1, 1, 0.6], source: "scan" });

describe("settleItems", () => {
  it("pushes an item sunk into a wall back flush against its face", () => {
    const it0 = item(0.3); // back at z=0, wall face at z=0.06
    expect(settleItems([it0], [wall])).toBe(1);
    expect(it0.position[2] - 0.3).toBeGreaterThan(0.059);
    expect(it0.position[2] - 0.3).toBeLessThan(0.07);
  });
  it("leaves items clear of walls and deep overlaps alone", () => {
    const clear = item(0.5);
    const deep = { ...item(0.0), id: "d" };
    expect(settleItems([clear, deep], [wall])).toBe(0);
  });
});
