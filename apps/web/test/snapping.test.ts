import { describe, expect, it } from "vitest";
import { demoScene, itemFootprint, type Item, type Scene } from "@appart3d/scene";
import { rotationFacing, snapItem, snapToGrid } from "../src/lib/snapping";

const room: Scene = {
  ...demoScene,
  rooms: [{ id: "r", name: "R", kind: "living", floor: [[0, 0], [4, 0], [4, 4], [0, 4]], floorMaterial: "wood" }],
  walls: [
    { id: "s", start: [0, 0], end: [4, 0], height: 2.5, thickness: 0.1 },
    { id: "e", start: [4, 0], end: [4, 4], height: 2.5, thickness: 0.1 },
    { id: "n", start: [4, 4], end: [0, 4], height: 2.5, thickness: 0.1 },
    { id: "w", start: [0, 4], end: [0, 0], height: 2.5, thickness: 0.1 },
  ],
  openings: [],
  items: [],
};
const sofa: Item = { id: "i", category: "sofa", position: [2, 0, 2], rotationY: 0.3, dimensions: [2, 0.8, 0.9], source: "user" };
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("snapping", () => {
  it("snaps to the 5 cm grid away from walls", () => {
    const r = snapItem(sofa, 2.023, 1.978, room);
    close(r.position[0], 2.0);
    close(r.position[2], 2.0);
    expect(r.rotationY).toBe(0.3);
    expect(r.wallId).toBeUndefined();
    close(snapToGrid(0.124), 0.1);
  });

  it("presses the back against a nearby wall and faces away from it", () => {
    // Near the south wall (z = 0): back flush at z = 0.05 + 0.45.
    const r = snapItem(sofa, 2.0, 0.62, room);
    expect(r.wallId).toBe("s");
    close(r.position[2], 0.5);
    close(r.rotationY, 0); // front (+Z) points into the room
    // Near the north wall the sofa turns around.
    const n = snapItem(sofa, 2.0, 3.4, room);
    expect(n.wallId).toBe("n");
    close(n.position[2], 3.5);
    close(Math.abs(n.rotationY), Math.PI);
    // East wall: faces -X.
    const e = snapItem(sofa, 3.6, 2, room);
    expect(e.wallId).toBe("e");
    close(e.position[0], 3.5);
    close(e.rotationY, -Math.PI / 2);
    // Footprint really is flush: max x = inner face of the wall.
    const fp = itemFootprint({ ...sofa, position: e.position, rotationY: e.rotationY });
    close(Math.max(...fp.map((p) => p[0])), 3.95);
  });

  it("slides into a corner", () => {
    const r = snapItem(sofa, 1.15, 0.55, room);
    expect(r.wallId).toBe("s");
    expect(r.cornerWallId).toBe("w");
    close(r.position[0], 1.05); // 0.05 wall half thickness + 1.0 half width
  });

  it("is disabled with Alt and ignores rugs for walls", () => {
    const raw = snapItem(sofa, 2.013, 0.62, room, { disabled: true });
    expect(raw.position).toEqual([2.013, 0, 0.62]);
    const rug = snapItem({ ...sofa, category: "rug" }, 2.0, 0.62, room);
    expect(rug.wallId).toBeUndefined();
  });

  it("rotationFacing maps directions to three.js yaw", () => {
    close(rotationFacing([0, 1]), 0);
    close(rotationFacing([1, 0]), Math.PI / 2);
  });
});
