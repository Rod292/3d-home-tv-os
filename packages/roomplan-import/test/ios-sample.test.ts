/** The iOS app's hand-written sample envelope (read-only, owned by apps/ios) must import cleanly. */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateScene } from "@appart3d/scene";
import { importRoomPlan, isRoomPlanEnvelope } from "../src";

const url = new URL("../../../apps/ios/Appart3DScan/Resources/sample.appart3d.json", import.meta.url);

describe.runIf(existsSync(url))("apps/ios sample.appart3d.json", () => {
  const json = JSON.parse(readFileSync(url, "utf8")) as unknown;
  const { scene, warnings } = importRoomPlan(json);
  it("is an envelope and imports into a valid scene", () => {
    expect(isRoomPlanEnvelope(json)).toBe(true);
    expect(validateScene(scene)).toEqual([]);
    expect(warnings).toEqual([]);
  });
  it("has squared, closed walls, named rooms, openings and items", () => {
    for (const w of scene.walls) expect(w.start[0] === w.end[0] || w.start[1] === w.end[1]).toBe(true);
    expect(scene.rooms.map((r) => r.name)).toEqual(["Séjour", "Chambre"]);
    expect(scene.rooms.map((r) => r.kind)).toEqual(["living", "bedroom"]);
    expect(scene.openings.length).toBeGreaterThanOrEqual(5);
    expect(scene.items.length).toBeGreaterThanOrEqual(9);
    expect(scene.items.every((i) => i.roomId && i.position[1] >= 0)).toBe(true);
    const pts = scene.walls.flatMap((w) => [w.start, w.end]);
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(0.5, 6);
  });
});
