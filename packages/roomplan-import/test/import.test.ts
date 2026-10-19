import { describe, expect, it } from "vitest";
import { demoScene, polygonArea, validateScene, wallLength, type Item, type Scene, type Vec2, type Wall } from "@appart3d/scene";
import {
  RoomPlanImportError,
  isRoomPlanData as isRP,
  generateFixtureEnvelope,
  importRoomPlan,
  isRoomPlanData,
  isRoomPlanEnvelope,
  kindFromName,
  objectYaw,
} from "../src";
import { parseEnum, parseMatrix } from "../src/parse";
import { refineCategory } from "../src/objects";
import { yawTranslation } from "../src/math";
import single from "../fixtures/single-room.appart3d.json";
import multi from "../fixtures/multi-room-structure.appart3d.json";
import ios16 from "../fixtures/ios16-room.appart3d.json";
import malformed from "../fixtures/malformed.appart3d.json";

const DEG = Math.PI / 180;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function pointOnWall(w: Wall, offset: number): Vec2 {
  const len = wallLength(w);
  return [w.start[0] + ((w.end[0] - w.start[0]) * offset) / len, w.start[1] + ((w.end[1] - w.start[1]) * offset) / len];
}
const near = (a: Vec2, b: Vec2, tol = 0.06) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const byCat = (s: Scene, c: Item["category"]) => s.items.filter((i) => i.category === c);
const openingCenter = (s: Scene, id: string): Vec2 => {
  const o = s.openings.find((x) => x.id === id)!;
  return pointOnWall(s.walls.find((w) => w.id === o.wallId)!, o.offset);
};

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** Every endpoint is shared with another wall (corner) or lies on another wall (T-junction). */
function openEnds(s: Scene): Vec2[] {
  const open: Vec2[] = [];
  for (const w of s.walls)
    for (const p of [w.start, w.end]) {
      const ok = s.walls.some((o) => o !== w && (near(p, o.start, 1e-9) || near(p, o.end, 1e-9) || distToSegment(p, o.start, o.end) < 1e-9));
      if (!ok) open.push(p);
    }
  return open;
}

const results = {
  single: importRoomPlan(single),
  multi: importRoomPlan(multi),
  ios16: importRoomPlan(ios16),
};

describe("envelope detection", () => {
  it("recognizes envelopes and bare captures", () => {
    expect(isRoomPlanEnvelope(single)).toBe(true);
    expect(isRoomPlanEnvelope({ walls: [] })).toBe(false);
    expect(isRoomPlanData((single as { rooms: unknown[] }).rooms[0])).toBe(true);
    expect(isRoomPlanData({ foo: 1 })).toBe(false);
  });
});

describe("validity", () => {
  for (const [name, r] of Object.entries(results)) {
    it(`${name}: passes validateScene`, () => {
      expect(validateScene(r.scene)).toEqual([]);
      expect(r.scene.meta.source).toBe("roomplan");
      expect(r.scene.walls.every((w) => w.thickness === 0.12)).toBe(true);
    });
    it(`${name}: walls are squared to the axes`, () => {
      for (const w of r.scene.walls) expect(w.start[0] === w.end[0] || w.start[1] === w.end[1], w.id).toBe(true);
    });
    it(`${name}: corners are closed`, () => {
      expect(openEnds(r.scene)).toEqual([]);
    });
    it(`${name}: footprint starts at the 0.5 m margin`, () => {
      const pts = r.scene.walls.flatMap((w) => [w.start, w.end]);
      expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(0.5, 6);
      expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(0.5, 6);
    });
  }
  it("accepts a JSON string", () => {
    expect(validateScene(importRoomPlan(JSON.stringify(single)).scene)).toEqual([]);
  });
});

describe("single room (7° off-axis, noisy)", () => {
  const { scene, warnings } = results.single;
  it("recovers the 5 × 4 m rectangle", () => {
    expect(scene.walls).toHaveLength(4);
    const pts = scene.walls.flatMap((w) => [w.start, w.end]);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(5.5, 1);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(4.5, 1);
    // every corner shared by exactly two walls
    for (const w of scene.walls)
      for (const p of [w.start, w.end]) expect(scene.walls.filter((o) => near(o.start, p, 1e-9) || near(o.end, p, 1e-9))).toHaveLength(2);
  });
  it("puts the door on the south wall and the window on the north wall at the right offsets", () => {
    const door = scene.openings.find((o) => o.kind === "door")!;
    const win = scene.openings.find((o) => o.kind === "window")!;
    const south = scene.walls.find((w) => w.id === door.wallId)!;
    const north = scene.walls.find((w) => w.id === win.wallId)!;
    expect(south.start[1]).toBeCloseTo(0.5, 1);
    expect(south.end[1]).toBeCloseTo(0.5, 1);
    expect(north.start[1]).toBeCloseTo(4.5, 1);
    expect(near(openingCenter(scene, door.id), [1.5, 0.5])).toBe(true);
    expect(near(openingCenter(scene, win.id), [3.5, 4.5])).toBe(true);
    expect(door.sill).toBe(0);
    expect(door.width).toBeCloseTo(0.9, 3);
    expect(door.height).toBeCloseTo(2.05, 3);
    expect(win.sill).toBeCloseTo(0.9, 3);
    expect(win.width).toBeCloseTo(1.4, 3);
  });
  it("extracts object yaw so fronts face +Z at rotation 0", () => {
    const sofa = byCat(scene, "sofa")[0]!;
    expect(angleDiff(sofa.rotationY, Math.PI / 2)).toBeLessThan(2 * DEG);
    // front direction (sin θ, cos θ) points into the room (+X), away from the west wall
    expect(Math.sin(sofa.rotationY)).toBeGreaterThan(0.99);
    expect(near([sofa.position[0], sofa.position[2]], [1.05, 2.5])).toBe(true);
    expect(sofa.position[1]).toBe(0);
    expect(angleDiff(byCat(scene, "bed")[0]!.rotationY, Math.PI)).toBeLessThan(2 * DEG);
    expect(angleDiff(byCat(scene, "wardrobe")[0]!.rotationY, -Math.PI / 2)).toBeLessThan(2 * DEG);
    expect(byCat(scene, "sofa")[0]!.dimensions).toEqual([2, 0.85, 0.95]);
  });
  it("applies category heuristics", () => {
    expect(byCat(scene, "coffeeTable")).toHaveLength(1); // 0.42 m high table
    expect(byCat(scene, "table")).toHaveLength(1); // dining table
    expect(byCat(scene, "nightstand")).toHaveLength(1); // small storage next to the bed
    expect(byCat(scene, "wardrobe")).toHaveLength(1); // 2 m storage
    expect(byCat(scene, "armchair")).toHaveLength(1); // 0.8 m wide chair
    expect(byCat(scene, "storage")).toHaveLength(0);
  });
  it("labels, confidence, room and warnings", () => {
    expect(scene.rooms).toHaveLength(1);
    expect(scene.rooms[0]).toMatchObject({ name: "Séjour", kind: "living", floorMaterial: "wood" });
    expect(polygonArea(scene.rooms[0]!.floor)).toBeGreaterThan(19);
    expect(scene.items.every((i) => i.roomId === scene.rooms[0]!.id && i.source === "scan")).toBe(true);
    expect(byCat(scene, "armchair")[0]).toMatchObject({ confidence: 0.3, label: "Fauteuil" });
    expect(byCat(scene, "wardrobe")[0]).toMatchObject({ confidence: 0.6, label: "Armoire" });
    expect(byCat(scene, "bed")[0]).toMatchObject({ confidence: 0.9, label: "Lit" });
    expect(warnings).toContain("1 objet à faible confiance (à vérifier).");
  });
  it("can disable squaring", () => {
    const r = importRoomPlan(single, { squareToleranceDeg: 0 });
    expect(r.warnings.some((w) => w.includes("en biais"))).toBe(true);
    expect(validateScene(r.scene)).toEqual([]);
  });
});

describe("multi-room CapturedStructure", () => {
  const { scene, warnings } = results.multi;
  const room = (kind: string) => scene.rooms.find((r) => r.kind === kind)!;
  it("builds three named rooms with the right floor materials", () => {
    expect(scene.rooms.map((r) => [r.name, r.kind, r.floorMaterial])).toEqual([
      ["Séjour", "living", "wood"],
      ["Chambre", "bedroom", "wood"],
      ["Salle de bain", "bathroom", "tile"],
    ]);
    expect(polygonArea(room("living").floor)).toBeCloseTo(21, 0);
    expect(polygonArea(room("bedroom").floor)).toBeCloseTo(9.1, 0);
    expect(polygonArea(room("bathroom").floor)).toBeCloseTo(5.6, 0);
  });
  it("removes the duplicated shared wall", () => {
    expect(scene.walls).toHaveLength(9);
    const horizontalAt31 = scene.walls.filter((w) => w.start[1] === w.end[1] && Math.abs(w.start[1] - 3.1) < 0.05);
    expect(horizontalAt31).toHaveLength(1);
  });
  it("attaches openings (parent id, missing parent, merged parent) and drops orphans", () => {
    const doors = scene.openings.filter((o) => o.kind === "door").map((o) => openingCenter(scene, o.id));
    expect(doors.some((p) => near(p, [0.5, 3.9]))).toBe(true); // entry, west wall
    expect(doors.some((p) => near(p, [5.5, 1.8]))).toBe(true); // bedroom door: parent wall was merged away
    expect(doors.some((p) => near(p, [5.5, 3.9]))).toBe(true); // bathroom door
    const windows = scene.openings.filter((o) => o.kind === "window");
    expect(windows.map((o) => openingCenter(scene, o.id)).some((p) => near(p, [3.0, 0.5]))).toBe(true); // parentIdentifier null
    const bathWin = windows.find((o) => o.sill > 1.4)!;
    expect(bathWin).toMatchObject({ width: 0.6, height: 0.6, sill: 1.5 });
    expect(scene.openings.some((o) => o.kind === "opening")).toBe(false);
    expect(warnings).toContain("1 ouverture sans mur parent ignorée.");
  });
  it("assigns items to rooms by point-in-polygon", () => {
    const roomOf = (c: Item["category"]) => scene.rooms.find((r) => r.id === byCat(scene, c)[0]!.roomId)?.kind;
    expect(roomOf("sofa")).toBe("living");
    expect(roomOf("refrigerator")).toBe("living");
    expect(roomOf("bed")).toBe("bedroom");
    expect(roomOf("wardrobe")).toBe("bedroom");
    expect(roomOf("bathtub")).toBe("bathroom");
    expect(roomOf("toilet")).toBe("bathroom");
    expect(byCat(scene, "nightstand")).toHaveLength(2);
    expect(byCat(scene, "storage")).toHaveLength(1); // TV unit: low, not near a bed
    expect(byCat(scene, "chair")).toHaveLength(1);
    expect(byCat(scene, "sink")[0]!.label).toBe("Lavabo");
    const tv = byCat(scene, "television")[0]!;
    expect(tv.position[1]).toBeCloseTo(0.5, 2);
    expect(angleDiff(tv.rotationY, 0)).toBeLessThan(1 * DEG);
  });
  it("uses section labels when no room names are given", () => {
    const env = clone(multi) as Record<string, unknown>;
    delete env.roomNames;
    const r = importRoomPlan(env);
    expect(r.scene.rooms.map((x) => [x.name, x.kind])).toEqual([
      ["Séjour", "living"],
      ["Chambre", "bedroom"],
      ["Salle de bain", "bathroom"],
    ]);
  });
  it("roomNames option overrides the envelope", () => {
    const r = importRoomPlan(multi, { roomNames: ["Salon", "Bureau", "WC"] });
    expect(r.scene.rooms.map((x) => x.kind)).toEqual(["living", "office", "toilet"]);
    expect(r.scene.rooms[2]!.floorMaterial).toBe("tile");
  });
  it("falls back to merging individual rooms when structure is null", () => {
    const env = clone(multi) as Record<string, unknown>;
    env.structure = null;
    const r = importRoomPlan(env);
    expect(validateScene(r.scene)).toEqual([]);
    expect(r.scene.walls).toHaveLength(9); // 12 room walls − 3 shared duplicates
    expect(openEnds(r.scene)).toEqual([]);
    expect(r.scene.rooms).toHaveLength(3);
    expect(r.scene.items).toHaveLength(results.multi.scene.items.length);
  });
});

describe("iOS 16 CapturedRoom (no floors / sections)", () => {
  const { scene, warnings } = results.ios16;
  it("traces the L-shaped room from its walls", () => {
    expect(scene.walls).toHaveLength(6);
    expect(scene.rooms).toHaveLength(1);
    expect(scene.rooms[0]).toMatchObject({ name: "Chambre", kind: "bedroom" });
    expect(scene.rooms[0]!.floor).toHaveLength(6);
    expect(polygonArea(scene.rooms[0]!.floor)).toBeCloseTo(11.75, 0);
  });
  it("places openings and items", () => {
    const door = scene.openings.find((o) => o.kind === "door")!;
    expect(near(openingCenter(scene, door.id), [1.8, 4.0])).toBe(true);
    const win = scene.openings.find((o) => o.kind === "window")!;
    expect(near(openingCenter(scene, win.id), [4.5, 1.5])).toBe(true);
    expect(byCat(scene, "wardrobe")).toHaveLength(1);
    expect(angleDiff(byCat(scene, "bed")[0]!.rotationY, 0)).toBeLessThan(2 * DEG);
    expect(warnings).toContain("1 objet non reconnu ignoré.");
  });
});

describe("parser tolerance", () => {
  it("accepts nested-column matrices, row-major matrices, string enums and {x,y,z} vectors", () => {
    const env = clone(single) as unknown as { rooms: Record<string, unknown[]>[] };
    const room = env.rooms[0]!;
    let k = 0;
    for (const key of ["walls", "doors", "windows", "objects", "floors"]) {
      for (const el of room[key] as Record<string, unknown>[]) {
        const m = el.transform as number[];
        const cols = [m.slice(0, 4), m.slice(4, 8), m.slice(8, 12), m.slice(12, 16)];
        // alternate: nested columns / row-major flat
        el.transform = k++ % 2 === 0 ? cols : [0, 1, 2, 3].flatMap((r) => cols.map((c) => c[r]!));
        const cat = el.category as Record<string, unknown>;
        if (key !== "doors") el.category = Object.keys(cat)[0];
        el.confidence = Object.keys(el.confidence as object)[0];
        const d = el.dimensions as number[];
        el.dimensions = { x: d[0], y: d[1], z: d[2] };
        el.unknownField = { foo: "bar" };
      }
    }
    const a = importRoomPlan(env).scene;
    const b = results.single.scene;
    expect(a.walls.map((w) => [w.start, w.end])).toEqual(b.walls.map((w) => [w.start, w.end]));
    expect(a.items.map((i) => [i.category, i.rotationY, i.confidence])).toEqual(b.items.map((i) => [i.category, i.rotationY, i.confidence]));
    expect(a.openings).toEqual(b.openings);
  });
  it("parses enums and matrices", () => {
    expect(parseEnum({ door: { isOpen: true } })).toEqual({ key: "door", payload: { isOpen: true } });
    expect(parseEnum("sofa")).toEqual({ key: "sofa", payload: {} });
    const m = yawTranslation(0.3, [1, 2, 3]);
    expect(parseMatrix(m)).toEqual(m);
    expect(parseMatrix({ columns: [m.slice(0, 4), m.slice(4, 8), m.slice(8, 12), m.slice(12)] })).toEqual(m);
    expect(parseMatrix([1, 2, 3])).toBeNull();
  });
});

describe("object yaw / front axis", () => {
  it("local +Z is the front: yaw θ maps to rotationY θ", () => {
    for (const a of [0, 0.5, Math.PI / 2, -2.5]) expect(angleDiff(objectYaw(yawTranslation(a, [0, 0, 0])), a)).toBeLessThan(1e-6);
    expect(angleDiff(objectYaw(yawTranslation(0.5, [0, 0, 0]), "-z"), 0.5 + Math.PI)).toBeLessThan(1e-6);
  });
  it("refines categories from attributes and size", () => {
    const draft = (dims: [number, number, number], attributes: Record<string, string> = {}) => ({
      src: { id: "x", parentId: null, category: "", transform: [], dimensions: dims, confidence: null, story: 0, attributes },
      category: "storage" as const,
      position: [0, 0] as Vec2,
      y: 0,
      yaw: 0,
      dims,
    });
    expect(refineCategory("table", draft([1, 0.7, 0.6], { TableType: "coffee" }), [])).toBe("coffeeTable");
    expect(refineCategory("table", draft([1, 0.5, 0.6]), [])).toBe("coffeeTable");
    expect(refineCategory("table", draft([1, 0.75, 0.6]), [])).toBe("table");
    expect(refineCategory("storage", draft([1, 1.8, 0.4], { StorageType: "shelf" }), [])).toBe("shelf");
    expect(refineCategory("storage", draft([0.5, 0.5, 0.4]), [])).toBe("storage");
    expect(refineCategory("sofa", draft([0.9, 0.8, 0.9], { SofaType: "singleSeat" }), [])).toBe("armchair");
    expect(refineCategory("chair", draft([0.75, 0.8, 0.7]), [])).toBe("armchair");
    expect(refineCategory("chair", draft([0.5, 0.8, 0.5]), [])).toBe("chair");
  });
});

describe("room names", () => {
  it("maps French names to kinds", () => {
    expect(kindFromName("Séjour")).toBe("living");
    expect(kindFromName("Chambre 2")).toBe("bedroom");
    expect(kindFromName("Cuisine")).toBe("kitchen");
    expect(kindFromName("Salle de bain")).toBe("bathroom");
    expect(kindFromName("Salle d'eau")).toBe("bathroom");
    expect(kindFromName("WC")).toBe("toilet");
    expect(kindFromName("Entrée")).toBe("hallway");
    expect(kindFromName("Couloir")).toBe("hallway");
    expect(kindFromName("Bureau")).toBe("office");
    expect(kindFromName("Salle à manger")).toBe("dining");
    expect(kindFromName("Grenier")).toBeNull();
  });
});

describe("malformed input", () => {
  const fails = (input: unknown, re: RegExp) => {
    try {
      importRoomPlan(input);
    } catch (e) {
      expect(e).toBeInstanceOf(RoomPlanImportError);
      expect((e as Error).message).toMatch(re);
      return;
    }
    throw new Error("expected importRoomPlan to throw");
  };
  it("rejects the malformed fixture with a clear French error", () => fails(malformed, /Aucun mur exploitable/));
  it("rejects invalid JSON text", () => fails("{ pas du json", /pas du JSON valide/));
  it("rejects non-objects", () => fails(42, /objet JSON/));
  it("rejects other formats", () => fails({ format: "autre.chose" }, /Format de fichier non reconnu/));
  it("rejects envelopes without rooms", () => fails({ format: "appart3d.roomplan", version: 1, structure: null, rooms: [] }, /aucune pièce/));
  it("rejects unrelated objects", () => fails({ hello: "world" }, /champ « format » absent/));
  it("reports unreadable elements as warnings when the rest is usable", () => {
    const env = clone(single) as { rooms: { objects: unknown[] }[] };
    env.rooms[0]!.objects.push({ category: { sofa: {} }, transform: "??" });
    const r = importRoomPlan(env);
    expect(r.warnings.some((w) => w.startsWith("1 élément du scan illisible"))).toBe(true);
  });
});

describe("demo fixture helper", () => {
  it("generateFixtureEnvelope() is importable as a scan example", () => {
    const r = importRoomPlan(generateFixtureEnvelope());
    expect(validateScene(r.scene)).toEqual([]);
    expect(r.scene.rooms).toHaveLength(3);
    expect(r.scene.items.length).toBeGreaterThan(10);
  });
});

describe("isRoomPlanData", () => {
  it("does not mistake an Appart3D scene for a capture", () => {
    expect(isRP(demoScene)).toBe(false);
  });
});
