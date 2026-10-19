/**
 * @appart3d/roomplan-import — public API (STABLE CONTRACT, used by apps/web).
 * Converts the iOS app's export envelope (see docs/ARCHITECTURE.md §RoomPlan envelope)
 * into an Appart3D `Scene`. Format notes: ../FORMAT.md.
 *
 * Pipeline: parse (tolerant) → pick elements (structure first, else merged rooms) → walls
 * (extract, dedupe, dominant-axis rotation, squaring, corner snapping) → translate to positive
 * coordinates → openings → rooms → items → validateScene.
 */
import { SCENE_VERSION, createId, validateScene, type OpeningKind, type Scene, type Vec2, type Wall } from "@appart3d/scene";
import { convexHull, dist2, round, toPlan, translation, type PlanFrame } from "./math";
import { RoomPlanImportError, looksLikeCapture, parseEnvelope, type ParsedCapture, type ParsedEnvelope, type ParsedObject, type ParsedSection, type ParsedSurface } from "./parse";
import { dedupeWalls, dominantAngle, extractWall, normalizeWalls, toPlanWall, type RawWall } from "./walls";
import { buildOpenings, type OpeningInput } from "./openings";
import { buildRooms, floorOutlineWorld, outlineFromWalls, type RoomCandidate } from "./rooms";
import { settleItems } from "./settle";
import { buildItems } from "./objects";
import { plural } from "./labels";

export { RoomPlanImportError } from "./parse";
export { ROOMPLAN_FRONT_AXIS, objectYaw } from "./objects";
export { kindFromName, kindFromSectionLabel } from "./labels";
export { generateFixtureEnvelope, type FixtureKind } from "./fixtures";

export interface ImportOptions {
  /** Snap walls within this many degrees of the dominant axes. Default 4. */
  squareToleranceDeg?: number;
  name?: string;
  /** Wall thickness written to the scene (RoomPlan walls have none). Default 0.12 m. */
  wallThickness?: number;
  /** Max distance for merging wall endpoints into a corner. Default 0.10 m. */
  snapDistance?: number;
  /** The plan is translated so its min corner sits at (margin, margin). Default 0.5 m. */
  margin?: number;
  /** Rotate the plan so the dominant wall direction is the X axis. Default true. */
  straighten?: boolean;
  /** Overrides the envelope's `roomNames` (aligned with `rooms` / `structure.rooms`). */
  roomNames?: (string | null)[];
}

export interface ImportResult {
  scene: Scene;
  /** Non-fatal issues to show the user (e.g. "2 objets non reconnus"). */
  warnings: string[];
}

/** True when the JSON looks like an Appart3D RoomPlan envelope. */
export function isRoomPlanEnvelope(input: unknown): boolean {
  return typeof input === "object" && input !== null && (input as { format?: unknown }).format === "appart3d.roomplan";
}

/** Lenient check: an envelope, or a bare CapturedRoom / CapturedStructure JSON (also importable). */
export function isRoomPlanData(input: unknown): boolean {
  if (isRoomPlanEnvelope(input)) return true;
  // An Appart3D Scene also has `walls`; never mistake it for a bare capture.
  const o = input as { version?: unknown; items?: unknown } | null;
  if (o && typeof o === "object" && "version" in o && Array.isArray(o.items)) return false;
  return looksLikeCapture(input);
}

// ---------------------------------------------------------------------------

interface Tagged<T> {
  x: T;
  /** Capture index (rooms[i] / structure.rooms[i]) or null when unknown. */
  cap: number | null;
}

interface Gathered {
  captures: ParsedCapture[];
  walls: Tagged<ParsedSurface>[];
  doors: Tagged<ParsedSurface>[];
  windows: Tagged<ParsedSurface>[];
  openings: Tagged<ParsedSurface>[];
  floors: Tagged<ParsedSurface>[];
  objects: Tagged<ParsedObject>[];
  sections: ParsedSection[];
  merged: boolean;
}

type ListKey = "walls" | "doors" | "windows" | "openings" | "floors" | "objects";
const LIST_KEYS: ListKey[] = ["walls", "doors", "windows", "openings", "floors", "objects"];

/** Picks the elements to import: CapturedStructure first, else the individual rooms merged. */
function gather(env: ParsedEnvelope): Gathered {
  const s = env.structure;
  const useStructure = s !== null && LIST_KEYS.some((k) => s[k].length > 0 || s.rooms.some((r) => r[k].length > 0));
  const captures = useStructure ? (s!.rooms.length ? s!.rooms : [s!]) : env.rooms;
  const capOf = new Map<string, number>();
  captures.forEach((c, i) => {
    for (const k of LIST_KEYS) for (const el of c[k]) if (!capOf.has(el.id)) capOf.set(el.id, i);
  });
  // StructureBuilder may return ONE merged floor for the whole home while each room keeps its own
  // floor: per-room floors are what delimit rooms, so prefer them whenever there are more of them.
  const roomFloors = useStructure ? s!.rooms.filter((r) => r.floors.length > 0).length : 0;
  const pick = <K extends ListKey>(k: K): Tagged<ParsedCapture[K][number]>[] => {
    if (k === "floors" && roomFloors > (s?.floors.length ?? 0)) return captures.flatMap((c, i) => c.floors.map((x) => ({ x, cap: i }))) as Tagged<ParsedCapture[K][number]>[];
    if (useStructure && s![k].length > 0) return (s![k] as ParsedCapture[K][number][]).map((x) => ({ x, cap: capOf.get(x.id) ?? null }));
    return captures.flatMap((c, i) => (c[k] as ParsedCapture[K][number][]).map((x) => ({ x, cap: i })));
  };
  const sections = useStructure && s!.sections.length ? s!.sections : captures.flatMap((c) => c.sections);
  return {
    captures,
    walls: pick("walls"),
    doors: pick("doors"),
    windows: pick("windows"),
    openings: pick("openings"),
    floors: pick("floors"),
    objects: pick("objects"),
    sections,
    merged: !useStructure || s!.walls.length === 0,
  };
}

/** Same object seen by two room scans: same category, centers < 30 cm apart, different captures. */
function dedupeObjects(objs: Tagged<ParsedObject>[]): Tagged<ParsedObject>[] {
  const out: Tagged<ParsedObject>[] = [];
  for (const o of objs) {
    const [x, , z] = translation(o.x.transform);
    const dup = out.find((p) => {
      if (p.cap === o.cap || p.x.category !== o.x.category) return false;
      const [px, , pz] = translation(p.x.transform);
      return Math.hypot(px - x, pz - z) < 0.3;
    });
    if (!dup) out.push(o);
  }
  return out;
}

export function importRoomPlan(input: unknown, options: ImportOptions = {}): ImportResult {
  const squareToleranceDeg = options.squareToleranceDeg ?? 4;
  const thickness = options.wallThickness ?? 0.12;
  const snapDistance = options.snapDistance ?? 0.1;
  const margin = options.margin ?? 0.5;

  const env = parseEnvelope(input);
  const warnings: string[] = [...env.issues];
  const roomNames = options.roomNames ?? env.roomNames;
  const g = gather(env);

  // --- story filter (multi-storey homes: keep the lowest storey) --------------------------------
  const stories = g.walls.map((w) => w.x.story);
  const story = stories.length ? Math.min(...stories) : 0;
  let otherStory = 0;
  const sameStory = <T extends { x: { story: number } }>(arr: T[]): T[] =>
    arr.filter((e) => {
      if (e.x.story === story) return true;
      otherStory++;
      return false;
    });
  const wallsIn = sameStory(g.walls);
  const floorsIn = sameStory(g.floors);
  const doorsIn = sameStory(g.doors);
  const windowsIn = sameStory(g.windows);
  const openingsIn = sameStory(g.openings);
  const objectsIn = dedupeObjects(sameStory(g.objects));
  const sectionsIn = g.sections.filter((s) => s.story === story);
  if (otherStory > 0) warnings.push(`${plural(otherStory, "élément")} d'un autre étage ignoré${otherStory > 1 ? "s" : ""} (seul l'étage le plus bas est importé).`);

  // --- walls -------------------------------------------------------------------------------------
  let curved = 0;
  const rawWalls: RawWall[] = [];
  for (const { x, cap } of wallsIn) {
    const w = extractWall(x, new Set(cap === null ? [] : [cap]));
    if (!w) continue;
    if (w.curved) curved++;
    rawWalls.push(w);
  }
  if (rawWalls.length === 0) throw new RoomPlanImportError("Aucun mur exploitable dans le scan : impossible de reconstruire le plan.");
  if (curved > 0) warnings.push(`${plural(curved, "mur courbe")} approximé${curved > 1 ? "s" : ""} par un segment droit.`);

  const floorOutlines = floorsIn.map((f) => ({ pts: floorOutlineWorld(f.x), cap: f.cap }));
  const floorY = floorOutlines.length
    ? Math.min(...floorOutlines.flatMap((f) => f.pts.map((p) => p[1])))
    : Math.min(...rawWalls.map((w) => w.bottom));

  const { walls: uniqueWalls, alias } = dedupeWalls(rawWalls);
  const phi = options.straighten === false ? 0 : dominantAngle(uniqueWalls);
  const planWalls = normalizeWalls(
    uniqueWalls.map((w) => toPlanWall(w, phi, floorY)),
    { squareToleranceDeg, snapDistance },
  );
  if (planWalls.length === 0) throw new RoomPlanImportError("Aucun mur exploitable dans le scan : impossible de reconstruire le plan.");
  const skew = planWalls.filter((w) => !w.square).length;
  if (skew > 0) warnings.push(`${plural(skew, "mur")} en biais conservé${skew > 1 ? "s" : ""} tel${skew > 1 ? "s" : ""} quel${skew > 1 ? "s" : ""} (non orthogonal${skew > 1 ? "aux" : ""}).`);

  // --- frame: translate so that the min corner sits at (margin, margin) ---------------------------
  // Walls define the footprint (floor outlines get snapped onto them later).
  const boundPts: Vec2[] = planWalls.flatMap((w) => [w.start, w.end]);
  const minX = Math.min(...boundPts.map((p) => p[0]));
  const minZ = Math.min(...boundPts.map((p) => p[1]));
  const frame: PlanFrame = { phi, offset: [margin - minX, margin - minZ], floorY };

  const counters = new Map<string, number>();
  const id = (prefix: string) => () => {
    const k = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, k);
    return `${prefix}_${k}`;
  };
  const walls: Wall[] = [];
  const wallIdByRoomPlanId = new Map<string, string>();
  const wallCaptures = new Map<string, Set<number>>();
  for (const w of planWalls) {
    const start: Vec2 = [round(w.start[0] + frame.offset[0]), round(w.start[1] + frame.offset[1])];
    const end: Vec2 = [round(w.end[0] + frame.offset[0]), round(w.end[1] + frame.offset[1])];
    if (dist2(start, end) < 0.05) continue;
    const wall: Wall = { id: id("wall")(), start, end, height: round(w.height, 3), thickness };
    walls.push(wall);
    wallIdByRoomPlanId.set(w.id, wall.id);
    wallCaptures.set(wall.id, w.captures);
  }
  for (const [from, to] of alias) {
    const target = wallIdByRoomPlanId.get(to);
    if (target) wallIdByRoomPlanId.set(from, target);
  }

  // --- openings ------------------------------------------------------------------------------------
  const openingInputs: OpeningInput[] = [
    ...doorsIn.map(({ x }) => ({ surface: x, kind: "door" as OpeningKind })),
    ...windowsIn.map(({ x }) => ({ surface: x, kind: "window" as OpeningKind })),
    ...openingsIn.map(({ x }) => ({ surface: x, kind: "opening" as OpeningKind })),
  ];
  const op = buildOpenings(openingInputs, walls, wallIdByRoomPlanId, frame, id("opening"));
  if (op.orphans > 0) warnings.push(`${plural(op.orphans, "ouverture")} sans mur parent ignorée${op.orphans > 1 ? "s" : ""}.`);
  if (op.clamped > 0) warnings.push(`${plural(op.clamped, "ouverture")} redimensionnée${op.clamped > 1 ? "s" : ""} pour tenir dans son mur.`);

  // --- rooms -----------------------------------------------------------------------------------------
  let candidates: RoomCandidate[] = floorOutlines.map((f) => ({
    polygon: f.pts.map((p) => toPlan(frame, [p[0], p[2]])),
    capture: f.cap,
  }));
  if (candidates.length === 0) {
    candidates = g.captures.flatMap((_, i) => {
      const capWalls = walls.filter((w) => wallCaptures.get(w.id)?.has(i));
      const raw = rawWalls.filter((w) => w.captures.has(i)).flatMap((w) => [w.start, w.end].map((p) => toPlan(frame, p)));
      const poly = capWalls.length ? outlineFromWalls(capWalls, raw) : null;
      return poly ? [{ polygon: poly, capture: i }] : [];
    });
  }
  // A user name only applies when its capture produced exactly one outline.
  const perCapture = new Map<number, number>();
  for (const c of candidates) if (c.capture !== null) perCapture.set(c.capture, (perCapture.get(c.capture) ?? 0) + 1);
  candidates = candidates.map((c) => (c.capture !== null && perCapture.get(c.capture)! > 1 ? { ...c, capture: null } : c));

  let rooms = buildRooms({ candidates, sections: sectionsIn, roomNames, walls, frame, nextId: id("room") });
  if (rooms.length === 0) {
    const hull = convexHull(walls.flatMap((w) => [w.start, w.end]));
    if (hull.length >= 3) {
      rooms = buildRooms({ candidates: [{ polygon: hull, capture: roomNames.length === 1 ? 0 : null }], sections: sectionsIn, roomNames, walls, frame, nextId: id("room") });
      warnings.push("Aucune pièce délimitée dans le scan : un sol unique a été créé à partir des murs.");
    }
  }

  // --- items -------------------------------------------------------------------------------------------
  const it = buildItems(objectsIn.map((o) => o.x), rooms, frame, id("item"));
  if (it.unknown > 0) warnings.push(`${plural(it.unknown, "objet")} non reconnu${it.unknown > 1 ? "s" : ""} ignoré${it.unknown > 1 ? "s" : ""}.`);
  if (it.lowConfidence > 0) warnings.push(`${plural(it.lowConfidence, "objet")} à faible confiance (à vérifier).`);
  settleItems(it.items, walls);
  const outside = it.items.filter((i) => !i.roomId).length;
  if (outside > 0 && rooms.length > 0) warnings.push(`${plural(outside, "objet")} hors de toute pièce.`);

  // --- scene ---------------------------------------------------------------------------------------------
  const now = new Date().toISOString();
  const notes = [
    "Scan RoomPlan",
    env.device && `appareil ${env.device}`,
    env.appVersion && `app ${env.appVersion}`,
    env.capturedAt && `capturé le ${env.capturedAt}`,
    g.merged && g.captures.length > 1 ? `${g.captures.length} pièces fusionnées` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const scene: Scene = {
    version: SCENE_VERSION,
    id: createId("scene"),
    name: options.name ?? "Appartement scanné",
    units: "m",
    rooms,
    walls,
    openings: op.openings,
    items: it.items,
    meta: { createdAt: env.capturedAt ?? now, updatedAt: now, source: "roomplan", notes },
  };
  const errors = validateScene(scene);
  if (errors.length) throw new RoomPlanImportError(`Le scan a été converti mais la maquette obtenue est invalide :\n- ${errors.join("\n- ")}`);
  return { scene, warnings };
}
