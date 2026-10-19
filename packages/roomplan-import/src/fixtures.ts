/**
 * Synthetic RoomPlan exports that mimic Swift's JSONEncoder output for CapturedRoom /
 * CapturedStructure (iOS 17, and an iOS 16 variant). Used by the tests and shipped as
 * `fixtures/*.appart3d.json`; the web app can use `generateFixtureEnvelope()` as a "Scan exemple".
 *
 * Everything is authored in a clean plan frame ([x, z], meters, walls listed counter-clockwise so
 * that their local +Z normal points into the room, like real RoomPlan walls) and then moved by an
 * arbitrary AR-session transform (yaw + translation + floor height), with optional endpoint noise.
 * No runtime imports: this file must stay dependency-free.
 */

type P = [number, number];
type V3 = [number, number, number];

export type FixtureKind = "single" | "multi" | "ios16";

// ---------------------------------------------------------------------------- utilities

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mimics how a Swift Float is printed by JSONEncoder (shortest float32 repr, ~8 significant digits). */
const f32 = (v: number): number => {
  const r = parseFloat(Math.fround(v).toPrecision(8));
  return Object.is(r, -0) ? 0 : r;
};

interface Ctx {
  rand: () => number;
  /** AR session pose of the plan frame. */
  yaw: number;
  t: P;
  floorY: number;
  noise: number;
}

function uuid(ctx: Ctx): string {
  const hex = () => Math.floor(ctx.rand() * 16).toString(16).toUpperCase();
  const part = (n: number) => Array.from({ length: n }, hex).join("");
  return `${part(8)}-${part(4)}-4${part(3)}-${"89AB"[Math.floor(ctx.rand() * 4)]}${part(3)}-${part(12)}`;
}

/** three.js-style rotation of a plan point about +Y. */
const rot = (p: P, a: number): P => [p[0] * Math.cos(a) + p[1] * Math.sin(a), -p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const toWorld = (ctx: Ctx, p: P): P => {
  const r = rot(p, ctx.yaw);
  return [r[0] + ctx.t[0], r[1] + ctx.t[1]];
};

/** Column-major simd_float4x4 for yaw about +Y + translation, flattened like JSONEncoder does. */
function yawMatrix(yaw: number, c: V3): number[] {
  const co = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [co, 0, -s, 0, 0, 1, 0, 0, s, 0, co, 0, c[0], c[1], c[2], 1].map(f32);
}

const jitter = (ctx: Ctx): number => {
  if (ctx.noise === 0) return 0;
  const sign = ctx.rand() < 0.5 ? -1 : 1;
  return sign * ctx.noise * (0.67 + 0.33 * ctx.rand()); // 2–3 cm for noise = 0.03
};
const noisy = (ctx: Ctx, p: P): P => [p[0] + jitter(ctx), p[1] + jitter(ctx)];

type Style = "ios17" | "ios16";
type Json = Record<string, unknown>;

function surfaceFields(style: Style, s: Json): Json {
  if (style === "ios16") {
    const { story: _s, polygonCorners: _p, curve: _c, ...rest } = s;
    return { ...rest, completedEdges: [] };
  }
  return { ...s, completedEdges: [], curve: null, polygonCorners: s.polygonCorners ?? [] };
}

interface WallRef {
  id: string;
  a: P; // plan, clean
  b: P;
  json: Json;
}

function makeWall(ctx: Ctx, style: Style, a: P, b: P, height: number, confidence = "high"): WallRef {
  const wa = toWorld(ctx, noisy(ctx, a));
  const wb = toWorld(ctx, noisy(ctx, b));
  const dx = wb[0] - wa[0];
  const dz = wb[1] - wa[1];
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz / len, dx / len); // local +X along the wall
  const id = uuid(ctx);
  const json = surfaceFields(style, {
    identifier: id,
    parentIdentifier: null,
    category: { wall: {} },
    confidence: { [confidence]: {} },
    dimensions: [f32(len), f32(height), 0],
    transform: yawMatrix(yaw, [(wa[0] + wb[0]) / 2, ctx.floorY + height / 2, (wa[1] + wb[1]) / 2]),
    story: 0,
  });
  return { id, a, b, json };
}

/** Door / window / opening on a wall, `at` meters from wall.a to the opening CENTER. */
function makeOpening(
  ctx: Ctx,
  style: Style,
  wall: WallRef,
  kind: "door" | "window" | "opening",
  at: number,
  width: number,
  height: number,
  sill: number,
  opts: { parent?: string | null; confidence?: string; isOpen?: boolean } = {},
): Json {
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const d: P = [(wall.b[0] - wall.a[0]) / len, (wall.b[1] - wall.a[1]) / len];
  const c = toWorld(ctx, [wall.a[0] + d[0] * at, wall.a[1] + d[1] * at]);
  const wd = rot(d, ctx.yaw);
  const yaw = Math.atan2(-wd[1], wd[0]);
  return surfaceFields(style, {
    identifier: uuid(ctx),
    parentIdentifier: opts.parent === undefined ? wall.id : opts.parent,
    category: kind === "door" ? { door: { isOpen: opts.isOpen ?? false } } : { [kind]: {} },
    confidence: { [opts.confidence ?? "high"]: {} },
    dimensions: [f32(width), f32(height), 0],
    transform: yawMatrix(yaw, [c[0], ctx.floorY + sill + height / 2, c[1]]),
    story: 0,
  });
}

/** Free-floating opening (no wall) — used to exercise the orphan path. */
function makeLooseOpening(ctx: Ctx, style: Style, at: P, width: number, height: number): Json {
  const c = toWorld(ctx, at);
  return surfaceFields(style, {
    identifier: uuid(ctx),
    parentIdentifier: null,
    category: { opening: {} },
    confidence: { low: {} },
    dimensions: [f32(width), f32(height), 0],
    transform: yawMatrix(ctx.yaw + 0.6, [c[0], ctx.floorY + height / 2, c[1]]),
    story: 0,
  });
}

/**
 * iOS 17 floor: transform maps local XY (polygon plane) to world XZ and local +Z to world +Y
 * (col0 = (cos,0,-sin), col1 = (-sin,0,-cos), col2 = (0,1,0) — same layout as real exports);
 * polygonCorners are LOCAL [u, v, 0].
 */
function makeFloor(ctx: Ctx, poly: P[]): Json {
  const world = poly.map((p) => toWorld(ctx, p));
  const cx = world.reduce((s, p) => s + p[0], 0) / world.length;
  const cz = world.reduce((s, p) => s + p[1], 0) / world.length;
  const a = ctx.yaw;
  const c0: P = [Math.cos(a), -Math.sin(a)];
  const c1: P = [-Math.sin(a), -Math.cos(a)];
  const local = world.map((p) => {
    const d: P = [p[0] - cx, p[1] - cz];
    return [f32(d[0] * c0[0] + d[1] * c0[1]), f32(d[0] * c1[0] + d[1] * c1[1]), 0];
  });
  const us = local.map((p) => p[0] as number);
  const vs = local.map((p) => p[1] as number);
  return {
    identifier: uuid(ctx),
    parentIdentifier: null,
    category: { floor: {} },
    confidence: { high: {} },
    dimensions: [f32(Math.max(...us) - Math.min(...us)), f32(Math.max(...vs) - Math.min(...vs)), 0],
    transform: [c0[0], 0, c0[1], 0, c1[0], 0, c1[1], 0, 0, 1, 0, 0, cx, ctx.floorY, cz, 1].map(f32),
    polygonCorners: local,
    completedEdges: [],
    curve: null,
    story: 0,
  };
}

interface ObjSpec {
  category: string;
  at: P;
  /** Scene yaw in the clean plan frame (front = +Z at 0). */
  yaw: number;
  dims: V3;
  elevation?: number;
  confidence?: string;
  attributes?: Record<string, string>;
}

function makeObject(ctx: Ctx, style: Style, o: ObjSpec): Json {
  const c = toWorld(ctx, o.at);
  const json: Json = {
    identifier: uuid(ctx),
    parentIdentifier: null,
    category: { [o.category]: {} },
    confidence: { [o.confidence ?? "high"]: {} },
    dimensions: o.dims.map(f32),
    transform: yawMatrix(o.yaw + ctx.yaw, [c[0], ctx.floorY + (o.elevation ?? 0) + o.dims[1] / 2, c[1]]),
  };
  if (style === "ios17") {
    json.story = 0;
    json.attributes = o.attributes ?? {};
  }
  return json;
}

function makeSection(ctx: Ctx, label: string, at: P): Json {
  const c = toWorld(ctx, at);
  return { label, center: [f32(c[0]), f32(ctx.floorY + 1.2), f32(c[1])], story: 0 };
}

interface RoomSpec {
  poly: P[]; // counter-clockwise (positive shoelace area)
  height: number;
  label?: string; // section label
  build?: (walls: WallRef[]) => { doors?: Json[]; windows?: Json[]; openings?: Json[] };
  objects?: ObjSpec[];
}

function makeRoom(ctx: Ctx, style: Style, spec: RoomSpec, wallsOverride?: WallRef[]): { json: Json; walls: WallRef[] } {
  const walls =
    wallsOverride ?? spec.poly.map((a, i) => makeWall(ctx, style, a, spec.poly[(i + 1) % spec.poly.length]!, spec.height));
  const extra = spec.build?.(walls) ?? {};
  const cx = spec.poly.reduce((s, p) => s + p[0], 0) / spec.poly.length;
  const cz = spec.poly.reduce((s, p) => s + p[1], 0) / spec.poly.length;
  const json: Json = {
    identifier: uuid(ctx),
    story: 0,
    version: 2,
    walls: walls.map((w) => w.json),
    doors: extra.doors ?? [],
    windows: extra.windows ?? [],
    openings: extra.openings ?? [],
    floors: style === "ios17" ? [makeFloor(ctx, spec.poly)] : [],
    objects: (spec.objects ?? []).map((o) => makeObject(ctx, style, o)),
    sections: style === "ios17" && spec.label ? [makeSection(ctx, spec.label, [cx, cz])] : [],
    referenceOriginTransform: yawMatrix(ctx.yaw, [ctx.t[0], 0, ctx.t[1]]),
  };
  if (style === "ios16") {
    delete json.floors;
    delete json.sections;
    delete json.story;
    delete json.referenceOriginTransform;
    json.version = 1;
  }
  return { json, walls };
}

function envelope(structure: Json | null, rooms: Json[], roomNames: string[]): Json {
  return {
    format: "appart3d.roomplan",
    version: 1,
    capturedAt: "2026-10-09T12:00:00Z",
    device: "iPhone16,1",
    appVersion: "0.1.0",
    structure,
    rooms,
    roomNames,
  };
}

const PI = Math.PI;

// ---------------------------------------------------------------------------- fixtures

/**
 * (a) Studio 5 × 4 m, plan rotated 7° off-axis in the AR frame, 2–3 cm noise on wall endpoints.
 * Ground truth (clean plan, before the importer's +0.5 m margin):
 *  - door on the south wall (0,0)→(5,0), center x = 1.0, 0.9 × 2.05
 *  - window on the north wall (5,4)→(0,4), center x = 3.0, 1.4 × 1.3, sill 0.9
 *  - sofa at (0.55, 2.0) facing +X; coffee table (low table); dining table; bed against the north
 *    wall facing -Z; small storage next to the bed (→ nightstand); tall storage (→ wardrobe);
 *    wide chair (→ armchair, low confidence).
 */
export function singleRoomFixture(): Json {
  const ctx: Ctx = { rand: rng(7), yaw: 7 * (PI / 180), t: [0.42, -1.9], floorY: -1.38, noise: 0.03 };
  const { json } = makeRoom(ctx, "ios17", {
    poly: [
      [0, 0],
      [5, 0],
      [5, 4],
      [0, 4],
    ],
    height: 2.5,
    label: "livingRoom",
    build: (w) => ({
      doors: [makeOpening(ctx, "ios17", w[0]!, "door", 1.0, 0.9, 2.05, 0)],
      windows: [makeOpening(ctx, "ios17", w[2]!, "window", 2.0, 1.4, 1.3, 0.9)],
    }),
    objects: [
      { category: "sofa", at: [0.55, 2.0], yaw: PI / 2, dims: [2.0, 0.85, 0.95], attributes: { SofaType: "rectangular" } },
      { category: "table", at: [1.8, 2.0], yaw: PI / 2, dims: [1.0, 0.42, 0.55], attributes: { TableType: "unidentified" } },
      { category: "table", at: [3.3, 1.0], yaw: 0, dims: [1.4, 0.75, 0.8], attributes: { TableType: "dining" } },
      { category: "bed", at: [3.6, 3.0], yaw: PI, dims: [1.6, 0.5, 2.0] },
      { category: "storage", at: [4.7, 3.75], yaw: PI, dims: [0.45, 0.55, 0.4], attributes: { StorageType: "cabinet" } },
      { category: "storage", at: [4.68, 1.2], yaw: -PI / 2, dims: [1.0, 2.0, 0.6], confidence: "medium", attributes: { StorageType: "cabinet" } },
      { category: "chair", at: [1.0, 3.3], yaw: (3 * PI) / 4, dims: [0.8, 0.8, 0.8], confidence: "low" },
    ],
  });
  return envelope(null, [json], ["Séjour"]);
}

/**
 * (b) Apartment 8.5 × 4.2 m captured as a CapturedStructure (living 5 × 4.2, bedroom 3.5 × 2.6,
 * bathroom 3.5 × 1.6), rotated -20° in the AR frame, small noise. `structure.walls` keeps one
 * shared wall twice (bedroom/bathroom), `structure.rooms` carry each room's own walls.
 */
export function multiRoomFixture(): Json {
  const ctx: Ctx = { rand: rng(42), yaw: -20 * (PI / 180), t: [1.3, -0.8], floorY: -1.35, noise: 0.01 };
  const H = 2.55;
  const living: P[] = [
    [0, 0],
    [5, 0],
    [5, 4.2],
    [0, 4.2],
  ];
  const bedroom: P[] = [
    [5, 0],
    [8.5, 0],
    [8.5, 2.6],
    [5, 2.6],
  ];
  const bath: P[] = [
    [5, 2.6],
    [8.5, 2.6],
    [8.5, 4.2],
    [5, 4.2],
  ];
  const lw = living.map((a, i) => makeWall(ctx, "ios17", a, living[(i + 1) % 4]!, H));
  const bw = bedroom.map((a, i) => makeWall(ctx, "ios17", a, bedroom[(i + 1) % 4]!, H));
  const tw = bath.map((a, i) => makeWall(ctx, "ios17", a, bath[(i + 1) % 4]!, H));
  // Living east wall lw[1] (5,0)→(5,4.2) is shared with bw[3] (5,2.6)→(5,0) and tw[3] (5,4.2)→(5,2.6).
  const livingRoom = makeRoom(
    ctx,
    "ios17",
    {
      poly: living,
      height: H,
      label: "livingRoom",
      build: (w) => ({
        doors: [makeOpening(ctx, "ios17", w[3]!, "door", 0.8, 0.9, 2.05, 0)], // entry, west wall, center z = 3.4
        windows: [makeOpening(ctx, "ios17", w[0]!, "window", 2.5, 1.6, 1.35, 0.9, { parent: null })], // no parent
        openings: [makeLooseOpening(ctx, "ios17", [2.5, 2.0], 1.0, 2.0)], // orphan
      }),
      objects: [
        { category: "sofa", at: [2.5, 3.7], yaw: PI, dims: [2.2, 0.85, 0.95], attributes: { SofaType: "lShaped" } },
        { category: "television", at: [2.5, 0.25], yaw: 0, dims: [1.2, 0.7, 0.1], elevation: 0.5 },
        { category: "storage", at: [2.5, 0.22], yaw: 0, dims: [1.6, 0.5, 0.4], attributes: { StorageType: "cabinet" } },
        { category: "table", at: [1.0, 1.4], yaw: PI / 2, dims: [1.2, 0.74, 0.8], attributes: { TableType: "dining" } },
        { category: "chair", at: [0.45, 1.4], yaw: PI / 2, dims: [0.45, 0.85, 0.5], attributes: { ChairType: "dining" } },
        { category: "refrigerator", at: [4.6, 0.38], yaw: 0, dims: [0.7, 1.8, 0.7] },
        { category: "stove", at: [3.9, 0.32], yaw: 0, dims: [0.6, 0.9, 0.6] },
      ],
    },
    lw,
  );
  const bedRoom = makeRoom(
    ctx,
    "ios17",
    {
      poly: bedroom,
      height: H,
      label: "bedroom",
      build: (w) => ({
        doors: [makeOpening(ctx, "ios17", w[3]!, "door", 1.3, 0.83, 2.04, 0, { isOpen: true })], // to living, center z = 1.3
        windows: [makeOpening(ctx, "ios17", w[0]!, "window", 1.75, 1.2, 1.3, 0.95)],
      }),
      objects: [
        { category: "bed", at: [6.75, 1.0], yaw: 0, dims: [1.6, 0.5, 2.0] },
        { category: "storage", at: [5.65, 0.25], yaw: 0, dims: [0.45, 0.5, 0.4] },
        { category: "storage", at: [7.85, 0.25], yaw: 0, dims: [0.45, 0.5, 0.4] },
        { category: "storage", at: [8.18, 1.9], yaw: -PI / 2, dims: [1.2, 2.1, 0.6] },
      ],
    },
    bw,
  );
  const bathRoom = makeRoom(
    ctx,
    "ios17",
    {
      poly: bath,
      height: H,
      label: "bathroom",
      build: (w) => ({
        doors: [makeOpening(ctx, "ios17", w[3]!, "door", 0.8, 0.75, 2.0, 0, { parent: lw[1]!.id })], // center z = 3.4
        windows: [makeOpening(ctx, "ios17", w[1]!, "window", 0.8, 0.6, 0.6, 1.5)],
      }),
      objects: [
        { category: "bathtub", at: [7.6, 3.82], yaw: PI, dims: [1.7, 0.55, 0.75] },
        { category: "toilet", at: [5.95, 3.85], yaw: PI, dims: [0.4, 0.8, 0.65] },
        { category: "sink", at: [6.6, 3.95], yaw: PI, dims: [0.6, 0.85, 0.45] },
        { category: "washerDryer", at: [5.4, 2.95], yaw: 0, dims: [0.6, 0.85, 0.6], confidence: "low" },
      ],
    },
    tw,
  );
  const rooms = [livingRoom.json, bedRoom.json, bathRoom.json];
  const all = (k: string) => rooms.flatMap((r) => r[k] as Json[]);
  // StructureBuilder output: merged lists. Shared walls appear once, except bedroom-north / bath-south.
  const shared = new Set([bw[3]!.id, tw[3]!.id]);
  const structure: Json = {
    identifier: uuid(ctx),
    version: 1,
    walls: [...lw, ...bw, ...tw].filter((w) => !shared.has(w.id)).map((w) => w.json),
    doors: all("doors"),
    windows: all("windows"),
    openings: all("openings"),
    floors: all("floors"),
    objects: all("objects"),
    sections: all("sections"),
    rooms,
  };
  return envelope(structure, rooms, ["Séjour", "Chambre", "Salle de bain"]);
}

/**
 * (c) iOS 16-style CapturedRoom: no floors, sections, story, polygonCorners, curve or attributes.
 * L-shaped bedroom rotated 33°, includes one object with an unknown category.
 */
export function ios16Fixture(): Json {
  const ctx: Ctx = { rand: rng(16), yaw: 33 * (PI / 180), t: [-2.1, 0.7], floorY: -1.2, noise: 0.015 };
  const { json } = makeRoom(ctx, "ios16", {
    poly: [
      [0, 0],
      [4, 0],
      [4, 2],
      [2.5, 2],
      [2.5, 3.5],
      [0, 3.5],
    ],
    height: 2.4,
    build: (w) => ({
      doors: [makeOpening(ctx, "ios16", w[4]!, "door", 1.2, 0.8, 2.0, 0)], // (2.5,3.5)→(0,3.5), center x = 1.3
      windows: [makeOpening(ctx, "ios16", w[1]!, "window", 1.0, 1.0, 1.2, 1.0)], // east wall (4,0)→(4,2)
    }),
    objects: [
      { category: "bed", at: [1.25, 1.0], yaw: 0, dims: [1.4, 0.5, 1.9] },
      { category: "storage", at: [3.5, 1.65], yaw: PI, dims: [0.9, 1.9, 0.55] },
      { category: "plant", at: [3.7, 0.3], yaw: 0, dims: [0.4, 1.0, 0.4] },
    ],
  });
  return envelope(null, [json], ["Chambre"]);
}

/** Example envelope for the web app ("Scan exemple"). Default: the multi-room apartment. */
export function generateFixtureEnvelope(kind: FixtureKind = "multi"): Record<string, unknown> {
  switch (kind) {
    case "single":
      return singleRoomFixture();
    case "ios16":
      return ios16Fixture();
    default:
      return multiRoomFixture();
  }
}
