import { itemFootprint, pointInPolygon, polygonArea, sceneBounds, type Item, type ItemCategory, type Room, type Scene, type Vec2, type Vec3 } from "@appart3d/scene";
import { centroid, pointSegment } from "./geom2d";

/**
 * "Diaporama": the list of cinematic shots generated from a scene, plus the easing / path helpers
 * the camera rig samples every frame. Pure logic (no three.js) so it is unit tested.
 */

export type ShotKind = "orbit" | "room" | "flyover" | "dusk";

/** Orthographic dollhouse camera turning around the apartment. */
export interface IsoCam {
  cam: "iso";
  center: Vec3;
  /** Start azimuth and total sweep (radians). */
  az0: number;
  sweep: number;
  /** Angle from vertical. */
  polar: number;
  /** Multiplier of the "fit the whole apartment" zoom. */
  zoomScale: number;
}

/** Perspective camera following Catmull-Rom paths for its position and its look-at target. */
export interface PathCam {
  cam: "eye" | "fly";
  fov: number;
  positions: Vec3[];
  targets: Vec3[];
}

export interface Caption {
  eyebrow?: string;
  title: string;
  detail?: string;
}

export interface Shot {
  kind: ShotKind;
  /** Seconds. */
  duration: number;
  caption: Caption;
  camera: IsoCam | PathCam;
  roomId?: string;
  /** Seconds into the shot at which day ↔ night flips (the "dusk" shot). */
  toggleNightAt?: number;
}

export interface ShotOptions {
  reducedMotion?: boolean;
  /** Add the final day ↔ night overview (default true). */
  dusk?: boolean;
  /** Whether the loop currently runs at night (the dusk shot is then a "dawn"). */
  night?: boolean;
}

export const EYE = 1.5;
export const MIN_ROOM_AREA = 2;
/** Below this, standing inside only shows a wall: the room is filmed from above instead. */
export const MIN_EYE_AREA = 6;
export const FADE_IN = 0.8;
export const FADE_OUT = 0.6;
const DEFAULT_AZ = Math.PI / 4;
const ISO_POLAR = 0.96;

/** Most "interesting" furniture first: what a room shot points at. */
const INTEREST: Partial<Record<ItemCategory, number>> = {
  sofa: 10,
  bed: 10,
  fireplace: 9,
  table: 8,
  bathtub: 8,
  coffeeTable: 7,
  armchair: 6,
  desk: 6,
  stove: 5,
  shower: 5,
  television: 4,
  sink: 4,
  wardrobe: 2,
  plant: 2,
};

// ---------------------------------------------------------------------------------------------
// Easing / paths

export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * Uniform Catmull-Rom through `pts` (end points duplicated), t ∈ [0, 1] over the
 * whole path. Passes through every point, C1-continuous: no jerks between segments.
 */
export function catmullRom(pts: readonly Vec3[], t: number): Vec3 {
  if (pts.length === 0) return [0, 0, 0];
  if (pts.length === 1) return [...pts[0]!] as Vec3;
  const n = pts.length - 1;
  const x = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const u = x - i;
  const p0 = pts[Math.max(0, i - 1)]!;
  const p1 = pts[i]!;
  const p2 = pts[i + 1]!;
  const p3 = pts[Math.min(n, i + 2)]!;
  const u2 = u * u;
  const u3 = u2 * u;
  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * (2 * p1[k]! + (-p0[k]! + p2[k]!) * u + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * u2 + (-p0[k]! + 3 * p1[k]! - 3 * p2[k]! + p3[k]!) * u3);
  }
  return out;
}

/** Camera pose of a path shot at `time` seconds (eased: slow start, slow end). */
export function samplePathCam(cam: PathCam, time: number, duration: number): { position: Vec3; target: Vec3 } {
  const k = easeInOutSine(time / duration);
  return { position: catmullRom(cam.positions, k), target: catmullRom(cam.targets, k) };
}

/** Azimuth of an iso shot at `time`: mostly constant speed, gently eased at both ends. */
export function isoAzimuth(cam: IsoCam, time: number, duration: number): number {
  const u = clamp01(time / duration);
  return cam.az0 + cam.sweep * (0.8 * u + 0.2 * easeInOutSine(u));
}

/** Opacity (0..1) of the fade veil over a shot: fades in from the veil, then back out to it. */
export function shotVeil(time: number, duration: number, fadeIn = FADE_IN, fadeOut = FADE_OUT): number {
  const a = time < fadeIn ? 1 - time / fadeIn : 0;
  const b = time > duration - fadeOut ? (time - (duration - fadeOut)) / fadeOut : 0;
  return smoothstep(Math.max(a, b));
}

/** Caption opacity: appears once the veil has lifted, leaves just before the shot fades out. */
export function captionReveal(time: number, duration: number): number {
  const inK = smoothstep((time - 0.5) / 0.9);
  const outK = 1 - smoothstep((time - (duration - FADE_OUT - 0.45)) / 0.5);
  return Math.min(inK, outK);
}

// ---------------------------------------------------------------------------------------------
// Shot list

export const formatArea = (m2: number): string => `${m2 >= 10 ? Math.round(m2) : Math.round(m2 * 10) / 10} m²`.replace(".", ",");

const roomArea = (r: Room) => Math.abs(polygonArea(r.floor));

function edgeDistance(pt: Vec2, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, pointSegment(pt, poly[i]!, poly[(i + 1) % poly.length]!).dist);
  return d;
}

function itemsInRoom(scene: Pick<Scene, "items">, room: Room): Item[] {
  return scene.items.filter((it) => it.roomId === room.id || (!it.roomId && pointInPolygon([it.position[0], it.position[2]], room.floor)));
}

/** The room's most interesting item (sofa, bed, table…), if any. */
export function focusItem(scene: Pick<Scene, "items">, room: Room): Item | undefined {
  let best: Item | undefined;
  let bestScore = 0;
  for (const it of itemsInRoom(scene, room)) {
    const s = (INTEREST[it.category] ?? 0) + Math.min(1, it.dimensions[0] * it.dimensions[2]) * 0.5;
    if ((INTEREST[it.category] ?? 0) > 0 && s > bestScore) [best, bestScore] = [it, s];
  }
  return best;
}

/**
 * Where to stand in a room to look at `focus`: the free interior point (≥ 45 cm from walls, not
 * inside tall furniture) that sees it from furthest away — preferably in front of the focus item.
 */
export function standPoint(scene: Pick<Scene, "items">, room: Room, focus: Vec2, front?: Vec2): Vec2 {
  const xs = room.floor.map((p) => p[0]);
  const zs = room.floor.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const blockers = itemsInRoom(scene, room)
    .filter((it) => it.dimensions[1] > 0.6 && (it.mount ?? "floor") === "floor")
    .map(itemFootprint);
  const N = 16;
  let best: Vec2 | undefined;
  let bestScore = -Infinity;
  for (let i = 1; i < N; i++)
    for (let j = 1; j < N; j++) {
      const p: Vec2 = [x0 + ((x1 - x0) * i) / N, z0 + ((z1 - z0) * j) / N];
      if (!pointInPolygon(p, room.floor)) continue;
      const edge = edgeDistance(p, room.floor);
      if (edge < 0.45) continue;
      if (blockers.some((fp) => pointInPolygon(p, fp))) continue;
      const dx = p[0] - focus[0];
      const dz = p[1] - focus[1];
      const dist = Math.hypot(dx, dz);
      let score = Math.min(dist, 5) + Math.min(edge, 1) * 0.3;
      if (front && dist > 1e-6) score += ((dx * front[0] + dz * front[1]) / dist) * 1.6;
      if (score > bestScore) [best, bestScore] = [p, score];
    }
  return best ?? centroid(room.floor);
}

function roomShot(scene: Pick<Scene, "items" | "rooms">, room: Room, reduced: boolean): Shot {
  const area = roomArea(room);
  const it = focusItem(scene, room);
  const c = centroid(room.floor);
  const focus2: Vec2 = it ? [it.position[0], it.position[2]] : c;
  const front: Vec2 | undefined = it ? [Math.sin(it.rotationY), Math.cos(it.rotationY)] : undefined;
  const focusY = it ? Math.min(0.95, Math.max(0.55, it.position[1] + it.dimensions[1] * 0.75)) : 0.95;
  const start = standPoint(scene, room, focus2, front);
  const dx = focus2[0] - start[0];
  const dz = focus2[1] - start[1];
  const dist = Math.hypot(dx, dz) || 1;
  const ux = dx / dist;
  const uz = dz / dist;
  // Lateral axis (right of the view direction) for a gentle arc / pan.
  const rx = -uz;
  const rz = ux;
  const push = reduced ? 0 : Math.min(1.1, dist * 0.28);
  const sway = reduced ? 0 : Math.min(0.35, dist * 0.08);
  const p0: Vec3 = [start[0] - rx * sway, EYE, start[1] - rz * sway];
  const p1: Vec3 = [start[0] + ux * push * 0.5, EYE - (reduced ? 0 : 0.03), start[1] + uz * push * 0.5];
  const p2: Vec3 = [start[0] + ux * push + rx * sway * 0.6, EYE - (reduced ? 0 : 0.05), start[1] + uz * push + rz * sway * 0.6];
  const pan = reduced ? 0 : Math.min(0.7, dist * 0.18);
  const t0: Vec3 = [focus2[0] + rx * pan, focusY + (reduced ? 0 : 0.08), focus2[1] + rz * pan];
  const t1: Vec3 = [focus2[0], focusY, focus2[1]];
  return {
    kind: "room",
    duration: 6.5,
    roomId: room.id,
    caption: { title: room.name || "Pièce", detail: formatArea(area) },
    camera: { cam: "eye", fov: area < 10 ? 70 : 64, positions: [p0, p1, p2], targets: [t0, t1] },
  };
}

/** Small room (bathroom, WC…): a slow descent looking down into it from above, walls cut away. */
function roomTopShot(room: Room, apartmentCenter: Vec3, reduced: boolean): Shot {
  const c = centroid(room.floor);
  const area = roomArea(room);
  // Come from the apartment's center side so the cut walls face the camera.
  let dx = c[0] - apartmentCenter[0];
  let dz = c[1] - apartmentCenter[2];
  const l = Math.hypot(dx, dz);
  if (l < 0.3) [dx, dz] = [Math.SQRT1_2, Math.SQRT1_2];
  else [dx, dz] = [dx / l, dz / l];
  const r = Math.sqrt(area);
  const back = 0.9 + r * 0.3;
  const h0 = 6 + r * 0.4;
  const p0: Vec3 = [c[0] - dx * back, h0, c[1] - dz * back];
  const p1: Vec3 = reduced ? p0 : [c[0] - dx * back * 0.8 - dz * 0.35, h0 - 1.1, c[1] - dz * back * 0.8 + dx * 0.35];
  const t: Vec3 = [c[0], 0.4, c[1]];
  return {
    kind: "room",
    duration: 6,
    roomId: room.id,
    caption: { title: room.name || "Pièce", detail: formatArea(area) },
    camera: { cam: "fly", fov: 44, positions: [p0, p1], targets: [t, t] },
  };
}

/** The whole loop: overview orbit, each room (largest first), fly-over, then day ↔ night. */
export function buildShots(scene: Pick<Scene, "name" | "items" | "rooms" | "walls">, opts: ShotOptions = {}): Shot[] {
  const reduced = !!opts.reducedMotion;
  const b = sceneBounds(scene as Scene);
  const empty = b.max[0] - b.min[0] < 0.5 && b.max[1] - b.min[1] < 0.5;
  const cx = empty ? 0 : (b.min[0] + b.max[0]) / 2;
  const cz = empty ? 0 : (b.min[1] + b.max[1]) / 2;
  const diag = empty ? 8 : Math.max(4, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]));
  const center: Vec3 = [cx, 0, cz];
  // Iso shots aim a little above the floor so walls + floor sit centered on screen.
  const isoCenter: Vec3 = [cx, 1, cz];
  const rooms = scene.rooms.filter((r) => roomArea(r) >= MIN_ROOM_AREA).sort((a, c) => roomArea(c) - roomArea(a));
  const total = scene.rooms.reduce((s, r) => s + roomArea(r), 0);
  const n = scene.rooms.length;
  const summary = [n > 0 ? `${n} pièce${n > 1 ? "s" : ""}` : null, total > 0 ? formatArea(total) : null].filter(Boolean).join(" · ");

  const shots: Shot[] = [
    {
      kind: "orbit",
      duration: reduced ? 12 : 14,
      caption: { eyebrow: "Appart3D", title: scene.name || "Mon appartement", detail: summary || undefined },
      camera: { cam: "iso", center: isoCenter, az0: DEFAULT_AZ, sweep: reduced ? Math.PI / 3 : Math.PI * 2, polar: ISO_POLAR, zoomScale: 1 },
    },
  ];
  for (const r of rooms) shots.push(roomArea(r) >= MIN_EYE_AREA ? roomShot(scene, r, reduced) : roomTopShot(r, center, reduced));

  // Fly-over: high above one corner, gliding across while looking down at the middle.
  const dir = (a: number, k: number): [number, number] => [Math.sin(a) * k, Math.cos(a) * k];
  const a = DEFAULT_AZ + Math.PI * 0.85;
  const sweep = reduced ? 0.15 : 0.9;
  const pos = (i: number, k: number, h: number): Vec3 => {
    const [x, z] = dir(a + sweep * i, diag * k);
    return [cx + x, diag * h, cz + z];
  };
  shots.push({
    kind: "flyover",
    duration: 7,
    caption: { title: "Vue d'ensemble", detail: summary || undefined },
    camera: {
      cam: "fly",
      fov: 42,
      positions: reduced ? [pos(0, 0.5, 0.95), pos(1, 0.5, 0.95)] : [pos(0, 0.62, 1.0), pos(0.5, 0.45, 0.88), pos(1, 0.3, 0.78)],
      targets: reduced ? [center, center] : [[cx - dir(a, 0.08 * diag)[0], 0, cz - dir(a, 0.08 * diag)[1]], center],
    },
  });

  if (opts.dusk !== false) {
    shots.push({
      kind: "dusk",
      duration: 9,
      toggleNightAt: 1.6,
      caption: { title: opts.night ? "Au petit matin" : "À la nuit tombée", detail: scene.name || undefined },
      // Same side as the editor's default view: the moon stays behind the apartment.
      camera: { cam: "iso", center: isoCenter, az0: DEFAULT_AZ - Math.PI / 4, sweep: reduced ? Math.PI / 10 : Math.PI / 2, polar: 0.9, zoomScale: 1.12 },
    });
  }
  return shots;
}
