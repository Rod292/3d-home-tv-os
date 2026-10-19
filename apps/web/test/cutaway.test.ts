import { describe, expect, it } from "vitest";
import { demoScene } from "@appart3d/scene";
import { computeWallFacings, isWallCut, wallsOfRoom } from "../src/lib/cutaway";

describe("cutaway", () => {
  const f = computeWallFacings(demoScene);

  it("computes outward normals and exterior flags", () => {
    expect(f.get("wall_s")).toMatchObject({ exterior: true });
    expect(f.get("wall_s")!.normal[1]).toBeCloseTo(-1);
    expect(f.get("wall_n")!.normal[1]).toBeCloseTo(1);
    expect(f.get("wall_e")!.normal[0]).toBeCloseTo(1);
    expect(f.get("wall_w")!.normal[0]).toBeCloseTo(-1);
    expect(f.get("wall_mid")!.exterior).toBe(false);
  });

  it("lowers walls whose outer face turns toward the camera", () => {
    // Camera south-east of the apartment, looking north-west (toward -x, -z).
    const view: [number, number] = [-Math.SQRT1_2, -Math.SQRT1_2];
    expect(isWallCut(f.get("wall_n")!, view)).toBe(true);
    expect(isWallCut(f.get("wall_e")!, view)).toBe(true);
    expect(isWallCut(f.get("wall_s")!, view)).toBe(false);
    expect(isWallCut(f.get("wall_w")!, view)).toBe(false);
    // Camera south of the apartment, looking +z: the south wall faces it.
    const north: [number, number] = [0, 1];
    expect(isWallCut(f.get("wall_s")!, north)).toBe(true);
    expect(isWallCut(f.get("wall_n")!, north)).toBe(false);
    // Inner partition parallel to the line of sight stays up.
    expect(isWallCut(f.get("wall_mid")!, north)).toBe(false);
    expect(isWallCut(f.get("wall_mid")!, [1, 0])).toBe(true);
  });

  it("finds the walls around a room", () => {
    const bath = demoScene.rooms.find((r) => r.id === "room_bath")!;
    const ids = wallsOfRoom(demoScene, bath).map((w) => w.id).sort();
    expect(ids).toEqual(["wall_bed_bath", "wall_e", "wall_mid", "wall_n"]);
  });
});
