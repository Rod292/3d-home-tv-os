import { getCatalogEntry } from "@appart3d/catalog";
import {
  pointInPolygon,
  roomAt,
  wallNormal,
  type Item,
  type ItemMount,
  type Room,
  type Scene,
  type Vec2,
  type Vec3,
  type Wall,
} from "@appart3d/scene";
import { centroid, dot, sub } from "./geom2d";
import { nearestRoom, wallsOfRoom } from "./cutaway";
import { snapToGrid, rotationFacing, GRID_STEP } from "./snapping";

/** Ceiling height used when a room has no walls to read it from. */
export const DEFAULT_CEILING = 2.5;
/** Max gap between a wall item's back and a wall face for that wall to count as its host. */
export const HOST_TOLERANCE = 0.15;
/** Wall items stand this far off the face (avoids z-fighting with the wall paint). */
export const WALL_GAP = 0.004;

/** Effective mount: explicit item.mount, else the catalog default for the category, else "floor". */
export function effectiveMount(item: Pick<Item, "mount" | "category">): ItemMount {
  return item.mount ?? getCatalogEntry(item.category)?.mount ?? "floor";
}

export type WallSide = "left" | "right";

/** Unit normal of one face of a wall (pointing away from the wall, into the space that face looks at). */
export function faceNormal(wall: Wall, side: WallSide): Vec2 {
  const n = wallNormal(wall);
  return side === "left" ? n : [-n[0], -n[1]];
}

function wallFrame(wall: Wall) {
  const L = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const dir: Vec2 = L > 1e-9 ? [(wall.end[0] - wall.start[0]) / L, (wall.end[1] - wall.start[1]) / L] : [1, 0];
  return { L, dir, n: wallNormal(wall) };
}

// ---------------------------------------------------------------------------------------------
// Ceiling

/** Ceiling height of a room: the tallest wall along its outline (default 2.5 m). */
export function roomCeilingHeight(scene: Pick<Scene, "walls" | "rooms">, room: Room | undefined): number {
  const walls = room ? wallsOfRoom(scene as Scene, room) : [];
  if (walls.length) return Math.max(...walls.map((w) => w.height));
  if (scene.walls.length) return Math.max(...scene.walls.map((w) => w.height));
  return DEFAULT_CEILING;
}

/** Ceiling height above a floor point (room under it, else nearest room). */
export function ceilingHeightAt(scene: Pick<Scene, "walls" | "rooms">, pt: Vec2): number {
  const room = roomAt(scene as Scene, pt) ?? nearestRoom(scene as Scene, pt);
  return roomCeilingHeight(scene, room);
}

/** position.y of a ceiling item so that its top touches the ceiling. */
export function ceilingItemY(item: Pick<Item, "dimensions">, ceiling: number): number {
  return Math.max(0, ceiling - item.dimensions[1]);
}

// ---------------------------------------------------------------------------------------------
// Wall items

export interface WallPlacement {
  wallId: string;
  side: WallSide;
  /** Outward normal of the face the item hangs on. */
  normal: Vec2;
  /** Distance along the wall from its start to the item's center. */
  along: number;
  /** Item center flush against the face, floor-plan coordinates. */
  position: Vec2;
  /** Rotation that turns the item's front away from the wall. */
  rotationY: number;
}

export interface HostWall extends WallPlacement {
  /** Gap between the item's back and the face (negative = sunk into the wall). */
  gap: number;
}

function placement(wall: Wall, side: WallSide, along: number, depth: number): WallPlacement {
  const { dir } = wallFrame(wall);
  const normal = faceNormal(wall, side);
  const off = wall.thickness / 2 + depth / 2 + WALL_GAP;
  return {
    wallId: wall.id,
    side,
    normal,
    along,
    position: [wall.start[0] + dir[0] * along + normal[0] * off, wall.start[1] + dir[1] * along + normal[1] * off],
    rotationY: rotationFacing(normal),
  };
}

/**
 * Wall an item hangs on: the closest wall, roughly parallel to the item, whose face its back touches
 * (within `HOST_TOLERANCE`; items sunk into the wall — common in scans — count too).
 */
export function findHostWall(item: Pick<Item, "position" | "rotationY" | "dimensions">, walls: readonly Wall[]): HostWall | undefined {
  const fwd: Vec2 = [Math.sin(item.rotationY), Math.cos(item.rotationY)];
  const p: Vec2 = [item.position[0], item.position[2]];
  const d = item.dimensions[2];
  let best: HostWall | undefined;
  for (const wall of walls) {
    if (item.position[1] >= wall.height) continue;
    const { L, dir, n } = wallFrame(wall);
    if (L < 1e-6) continue;
    const facing = dot(fwd, n);
    if (Math.abs(facing) < 0.9) continue; // not parallel (> ~25°)
    const rel = sub(p, wall.start);
    const along = dot(rel, dir);
    if (along < -0.1 || along > L + 0.1) continue;
    const s = dot(rel, n);
    const half = wall.thickness / 2 + d / 2;
    const gap = Math.abs(s) - half;
    if (gap > HOST_TOLERANCE || gap < -half - 0.02) continue;
    // Center clearly on one side → that side; center inside the wall → the side the item faces.
    const side: WallSide = Math.abs(s) > wall.thickness / 2 ? (s >= 0 ? "left" : "right") : facing >= 0 ? "left" : "right";
    if (best && Math.abs(gap) >= Math.abs(best.gap)) continue;
    best = { ...placement(wall, side, Math.min(Math.max(along, 0), L), d), gap };
  }
  return best;
}

/** True when a probe point just off this face lands inside a room. */
function faceLooksIntoRoom(wall: Wall, side: WallSide, along: number, rooms: readonly Room[]): boolean {
  const { dir } = wallFrame(wall);
  const nrm = faceNormal(wall, side);
  const k = wall.thickness / 2 + 0.15;
  const pt: Vec2 = [wall.start[0] + dir[0] * along + nrm[0] * k, wall.start[1] + dir[1] * along + nrm[1] * k];
  return rooms.some((r) => pointInPolygon(pt, r.floor));
}

export interface WallSnapOptions {
  /** Alt held: no grid along the wall. */
  disabled?: boolean;
  grid?: number;
}

/**
 * Where a wall item dragged to (x, z) should go: flush against the nearest wall face (preferring faces
 * that look into a room), slid along it, turned away from it, at its current height.
 */
export function snapToWall(
  item: Pick<Item, "position" | "dimensions">,
  x: number,
  z: number,
  scene: Pick<Scene, "walls" | "rooms">,
  opts: WallSnapOptions = {},
): (WallPlacement & { y: number }) | undefined {
  const [w, , d] = item.dimensions;
  const y = item.position[1];
  const p: Vec2 = [x, z];
  let best: { score: number; wall: Wall; side: WallSide; along: number } | undefined;
  for (const wall of scene.walls) {
    if (y >= wall.height) continue;
    const { L, dir, n } = wallFrame(wall);
    if (L < 1e-6) continue;
    const rel = sub(p, wall.start);
    const t = dot(rel, dir);
    const along = Math.min(Math.max(t, 0), L);
    const s = dot(rel, n);
    const outside = t < 0 ? -t : t > L ? t - L : 0;
    for (const side of ["left", "right"] as const) {
      // Distance to that face (reaching the far face means going through the wall).
      const onSide = side === "left" ? s >= 0 : s < 0;
      const across = onSide ? Math.max(0, Math.abs(s) - wall.thickness / 2) : Math.abs(s) + wall.thickness / 2;
      let score = Math.hypot(across, outside);
      // Short stubs that can't hold the item, and faces turned away from every room, come last.
      if (L < w * 0.6) score += 0.5;
      if (scene.rooms.length && !faceLooksIntoRoom(wall, side, along, scene.rooms)) score += 1;
      if (!best || score < best.score) best = { score, wall, side, along };
    }
  }
  if (!best) return undefined;
  const L = wallFrame(best.wall).L;
  let along = opts.disabled ? best.along : snapToGrid(best.along, opts.grid ?? GRID_STEP);
  const lo = Math.min(w / 2, L / 2);
  const hi = Math.max(L - w / 2, L / 2);
  along = Math.min(Math.max(along, lo), hi);
  return { ...placement(best.wall, best.side, along, d), y };
}

// ---------------------------------------------------------------------------------------------
// Rooms ↔ wall faces

export interface WallFaceRef {
  wallId: string;
  side: WallSide;
}

/** The faces of the room's walls that look INTO the room (one face per wall). */
export function roomWallFaces(scene: Scene, room: Room): WallFaceRef[] {
  const c = centroid(room.floor);
  return wallsOfRoom(scene, room).map((wall) => {
    const { L, dir } = wallFrame(wall);
    let left = 0;
    let right = 0;
    for (const f of [0.15, 0.3, 0.5, 0.7, 0.85]) {
      const base: Vec2 = [wall.start[0] + dir[0] * L * f, wall.start[1] + dir[1] * L * f];
      for (const side of ["left", "right"] as const) {
        const nrm = faceNormal(wall, side);
        const k = wall.thickness / 2 + 0.12;
        if (pointInPolygon([base[0] + nrm[0] * k, base[1] + nrm[1] * k], room.floor)) {
          if (side === "left") left++;
          else right++;
        }
      }
    }
    const side: WallSide = left === right ? (dot(sub(c, wall.start), wallNormal(wall)) >= 0 ? "left" : "right") : left > right ? "left" : "right";
    return { wallId: wall.id, side };
  });
}

/** Room a wall face looks into (probe just off the face at the wall's middle). */
export function roomOfFace(scene: Pick<Scene, "rooms">, wall: Wall, side: WallSide): Room | undefined {
  const { L, dir } = wallFrame(wall);
  const nrm = faceNormal(wall, side);
  const k = wall.thickness / 2 + 0.15;
  for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    const pt: Vec2 = [wall.start[0] + dir[0] * L * f + nrm[0] * k, wall.start[1] + dir[1] * L * f + nrm[1] * k];
    const r = scene.rooms.find((room) => pointInPolygon(pt, room.floor));
    if (r) return r;
  }
  return undefined;
}

/** Rendered transform of an item: wall items sit flush on their host, ceiling items touch the ceiling. */
export interface MountedPose {
  mount: ItemMount;
  position: Vec3;
  rotationY: number;
  hostWallId?: string;
}

export function mountedPose(item: Item, scene: Pick<Scene, "walls" | "rooms">, ceilingOf?: (pt: Vec2) => number): MountedPose {
  const mount = effectiveMount(item);
  if (mount === "wall") {
    const host = findHostWall(item, scene.walls);
    if (host) return { mount, position: [host.position[0], item.position[1], host.position[1]], rotationY: host.rotationY, hostWallId: host.wallId };
    return { mount, position: item.position, rotationY: item.rotationY };
  }
  if (mount === "ceiling") {
    const pt: Vec2 = [item.position[0], item.position[2]];
    const ceiling = ceilingOf ? ceilingOf(pt) : ceilingHeightAt(scene, pt);
    return { mount, position: [item.position[0], ceilingItemY(item, ceiling), item.position[2]], rotationY: item.rotationY };
  }
  return { mount, position: item.position, rotationY: item.rotationY };
}
