import { describe, expect, it } from "vitest";
import { demoScene, itemFootprint, roomAt, validateScene, wallFaceColor, wallSideOf } from "../src";

describe("scene contract", () => {
  it("demo scene is valid", () => {
    expect(validateScene(demoScene)).toEqual([]);
  });
  it("every demo item sits inside its declared room", () => {
    for (const it of demoScene.items) {
      expect(roomAt(demoScene, [it.position[0], it.position[2]])?.id, it.id).toBe(it.roomId);
    }
  });
  it("footprint rotates by 90°", () => {
    const fp = itemFootprint({ ...demoScene.items[0]!, position: [0, 0, 0], dimensions: [2, 1, 1], rotationY: Math.PI / 2 });
    const xs = fp.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1);
  });
});

describe("wall faces", () => {
  const wall = { id: "w", start: [0, 0] as [number, number], end: [1, 0] as [number, number], height: 2.5, thickness: 0.1 };
  it("left/right are opposite sides", () => {
    expect(wallSideOf(wall, [0.5, 1])).not.toBe(wallSideOf(wall, [0.5, -1]));
  });
  it("face color falls back to wall color", () => {
    expect(wallFaceColor({ ...wall, color: "#111111", faceColors: { left: "#222222" } }, "left")).toBe("#222222");
    expect(wallFaceColor({ ...wall, color: "#111111", faceColors: { left: "#222222" } }, "right")).toBe("#111111");
  });
});
