import { describe, expect, it } from "vitest";
import { demoScene, pointInPolygon, polygonArea, type Item, type Room, type Scene, type Vec3 } from "@appart3d/scene";
import {
  buildShots,
  captionReveal,
  catmullRom,
  easeInOutSine,
  EYE,
  focusItem,
  formatArea,
  isoAzimuth,
  MIN_EYE_AREA,
  samplePathCam,
  shotVeil,
  standPoint,
  type IsoCam,
  type PathCam,
} from "../src/lib/slideshow";

const rect = (id: string, name: string, x0: number, z0: number, x1: number, z1: number): Room => ({
  id,
  name,
  kind: "other",
  floor: [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ],
  floorMaterial: "wood",
});

const item = (id: string, category: Item["category"], x: number, z: number, roomId?: string, dims: Vec3 = [1, 0.8, 1]): Item => ({
  id,
  category,
  position: [x, 0, z],
  rotationY: 0,
  dimensions: dims,
  source: "user",
  ...(roomId ? { roomId } : {}),
});

// Living 6×5 (30 m²), bedroom 3×4 (12 m²), bathroom 2×2 (4 m²), WC 1×1.5 (1.5 m²).
const scene: Pick<Scene, "name" | "items" | "rooms" | "walls"> = {
  name: "Test",
  walls: [],
  rooms: [rect("wc", "WC", 9, 0, 10, 1.5), rect("bed", "Chambre", 6, 0, 9, 4), rect("liv", "Séjour", 0, 0, 6, 5), rect("bath", "Salle de bain", 6, 4, 8, 6)],
  items: [item("sofa", "sofa", 3, 1, "liv", [2.2, 0.85, 0.95]), item("plant", "plant", 5, 4, "liv"), item("bed1", "bed", 7.5, 2, "bed", [1.6, 0.5, 2])],
};

describe("easing / paths", () => {
  it("easeInOutSine is 0 → 1, symmetric, clamped", () => {
    expect(easeInOutSine(0)).toBeCloseTo(0);
    expect(easeInOutSine(1)).toBeCloseTo(1);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
    expect(easeInOutSine(0.25) + easeInOutSine(0.75)).toBeCloseTo(1);
    expect(easeInOutSine(-1)).toBeCloseTo(0);
    expect(easeInOutSine(2)).toBeCloseTo(1);
  });

  it("catmullRom passes through every control point", () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [1, 2, 0],
      [3, 2, 1],
      [4, 0, 1],
    ];
    pts.forEach((p, i) => {
      const q = catmullRom(pts, i / (pts.length - 1));
      p.forEach((v, k) => expect(q[k]).toBeCloseTo(v));
    });
  });

  it("catmullRom is continuous (no jumps between segments)", () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [2, 1, 0],
      [2, 3, 2],
      [0, 4, 2],
    ];
    let prev = catmullRom(pts, 0);
    for (let i = 1; i <= 300; i++) {
      const q = catmullRom(pts, i / 300);
      expect(Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2])).toBeLessThan(0.05);
      prev = q;
    }
  });

  it("path cameras start and end on their first / last keys, eased (slow at both ends)", () => {
    const cam: PathCam = {
      cam: "eye",
      fov: 60,
      positions: [
        [0, 1.5, 0],
        [1, 1.5, 0],
      ],
      targets: [
        [0, 1, 5],
        [0, 1, 5],
      ],
    };
    expect(samplePathCam(cam, 0, 6).position[0]).toBeCloseTo(0);
    expect(samplePathCam(cam, 6, 6).position[0]).toBeCloseTo(1);
    const early = samplePathCam(cam, 0.3, 6).position[0];
    const mid = samplePathCam(cam, 3.3, 6).position[0] - samplePathCam(cam, 3, 6).position[0];
    expect(early).toBeLessThan(mid);
  });

  it("iso orbit sweeps exactly its angle", () => {
    const cam: IsoCam = { cam: "iso", center: [0, 0, 0], az0: 1, sweep: Math.PI * 2, polar: 1, zoomScale: 1 };
    expect(isoAzimuth(cam, 0, 10)).toBeCloseTo(1);
    expect(isoAzimuth(cam, 10, 10)).toBeCloseTo(1 + Math.PI * 2);
    expect(isoAzimuth(cam, 5, 10)).toBeCloseTo(1 + Math.PI);
  });

  it("veil is opaque at both ends of a shot and clear in the middle", () => {
    expect(shotVeil(0, 6)).toBeCloseTo(1);
    expect(shotVeil(3, 6)).toBe(0);
    expect(shotVeil(6, 6)).toBeCloseTo(1);
    expect(captionReveal(0, 6)).toBe(0);
    expect(captionReveal(3, 6)).toBeCloseTo(1);
    expect(captionReveal(6, 6)).toBe(0);
  });
});

describe("buildShots", () => {
  const shots = buildShots(scene);

  it("orbit first, rooms by decreasing area (tiny rooms skipped), fly-over, then dusk", () => {
    expect(shots.map((s) => s.kind)).toEqual(["orbit", "room", "room", "room", "flyover", "dusk"]);
    expect(shots.filter((s) => s.kind === "room").map((s) => s.roomId)).toEqual(["liv", "bed", "bath"]);
    expect(shots.find((s) => s.roomId === "wc")).toBeUndefined();
  });

  it("captions: project name on the first shot, room name + area for rooms", () => {
    expect(shots[0]!.caption).toEqual({ eyebrow: "Appart3D", title: "Test", detail: "4 pièces · 48 m²" });
    expect(shots[1]!.caption).toEqual({ title: "Séjour", detail: "30 m²" });
    expect(shots[3]!.caption.detail).toBe("4 m²");
  });

  it("shots last 5–7 s (the opening orbit and the dusk shot a little longer)", () => {
    for (const s of shots) {
      if (s.kind === "room" || s.kind === "flyover") {
        expect(s.duration).toBeGreaterThanOrEqual(5);
        expect(s.duration).toBeLessThanOrEqual(7);
      }
    }
    expect(shots.at(-1)!.toggleNightAt).toBeGreaterThan(0);
    expect(buildShots(scene, { dusk: false }).some((s) => s.kind === "dusk")).toBe(false);
  });

  it("room shots stand inside the room at eye height and look at its main item", () => {
    const liv = shots[1]!.camera as PathCam;
    expect(liv.cam).toBe("eye");
    for (const p of liv.positions) {
      expect(Math.abs(p[1] - EYE)).toBeLessThanOrEqual(0.06);
      expect(pointInPolygon([p[0], p[2]], scene.rooms[2]!.floor)).toBe(true);
    }
    const t = liv.targets.at(-1)!;
    expect([t[0], t[2]]).toEqual([3, 1]); // the sofa
  });

  it("small rooms are filmed from above", () => {
    const bath = shots[3]!;
    expect(Math.abs(polygonArea(scene.rooms[3]!.floor))).toBeLessThan(MIN_EYE_AREA);
    expect((bath.camera as PathCam).cam).toBe("fly");
    expect((bath.camera as PathCam).positions[0]![1]).toBeGreaterThan(4);
  });

  it("reduced motion: no dolly (static room cameras), slower orbit", () => {
    const r = buildShots(scene, { reducedMotion: true });
    const liv = r[1]!.camera as PathCam;
    expect(liv.positions[0]).toEqual(liv.positions.at(-1));
    expect((r[0]!.camera as IsoCam).sweep).toBeLessThan(Math.PI);
  });

  it("never mutates the scene", () => {
    const before = JSON.stringify(scene);
    buildShots(scene);
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("works on the demo scene and on an empty one", () => {
    expect(buildShots(demoScene).length).toBeGreaterThan(3);
    const empty = buildShots({ name: "", items: [], rooms: [], walls: [] });
    expect(empty.map((s) => s.kind)).toEqual(["orbit", "flyover", "dusk"]);
  });
});

describe("room helpers", () => {
  it("focusItem prefers sofa / bed over plants", () => {
    expect(focusItem(scene, scene.rooms[2]!)?.id).toBe("sofa");
    expect(focusItem(scene, scene.rooms[1]!)?.id).toBe("bed1");
    expect(focusItem(scene, scene.rooms[0]!)).toBeUndefined();
  });

  it("standPoint keeps clear of walls and sees the focus from afar, in front of it", () => {
    const room = scene.rooms[2]!;
    const p = standPoint(scene, room, [3, 1], [0, 1]);
    expect(pointInPolygon(p, room.floor)).toBe(true);
    expect(p[1]).toBeGreaterThan(2.5); // in front of the sofa (+Z)
    expect(Math.hypot(p[0] - 3, p[1] - 1)).toBeGreaterThan(2.5);
  });

  it("formatArea rounds big areas, keeps one decimal for small ones (French comma)", () => {
    expect(formatArea(29.6)).toBe("30 m²");
    expect(formatArea(3.62)).toBe("3,6 m²");
  });
});
