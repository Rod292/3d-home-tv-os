import { describe, expect, it } from "vitest";
import { demoScene } from "@appart3d/scene";
import { parseSceneJson, slugify } from "../src/lib/io";
import { localOpenings } from "../src/three/wallGeometry";

describe("io", () => {
  it("round-trips a scene", () => {
    const r = parseSceneJson(JSON.stringify(demoScene));
    expect(r.fromScan).toBe(false);
    expect(r.scene.items.length).toBe(demoScene.items.length);
  });
  it("rejects garbage with French messages", () => {
    expect(() => parseSceneJson("{oops")).toThrow(/JSON/);
    expect(() => parseSceneJson(JSON.stringify({ version: 1 }))).toThrow(/Scène invalide/);
  });
  it("slugifies names", () => {
    expect(slugify("Appartement démo")).toBe("appartement-demo");
  });
});

describe("wall openings", () => {
  it("treats doors as notches and windows as holes", () => {
    const wall = demoScene.walls.find((w) => w.id === "wall_mid")!;
    const ops = demoScene.openings.filter((o) => o.wallId === wall.id);
    const lo = localOpenings(wall, ops);
    expect(lo).toHaveLength(2);
    expect(lo.every((o) => o.notch)).toBe(true);
    const s = demoScene.walls.find((w) => w.id === "wall_s")!;
    const win = localOpenings(s, demoScene.openings.filter((o) => o.wallId === "wall_s"));
    expect(win.map((o) => o.notch)).toEqual([false, false]);
    expect(win[0]!.v0).toBeCloseTo(0.9);
  });
});

describe("example scan", () => {
  it("imports the importer's demo scan", async () => {
    const { loadExampleScan } = await import("../src/lib/io");
    const r = await loadExampleScan();
    expect(r.fromScan).toBe(true);
    expect(r.scene.walls.length).toBeGreaterThan(0);
  });
});
