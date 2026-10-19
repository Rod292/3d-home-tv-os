import type { Item, Scene, Vec2, Vec3 } from "@appart3d/scene";
import { add, dot, normalize, perp, scale, sub } from "./geom2d";

export const GRID_STEP = 0.05;
export const WALL_SNAP_DISTANCE = 0.25;

export interface SnapOptions {
  /** Grid step in meters (default 5 cm). */
  grid?: number;
  /** Max gap between the item's back and a wall face for the magnet to kick in. */
  wallDistance?: number;
  /** Alt held: raw position, no grid, no magnet. */
  disabled?: boolean;
}

export interface SnapResult {
  position: Vec3;
  rotationY: number;
  /** Wall the item's back was pressed against, if any. */
  wallId?: string;
  /** Second wall the item's side was slid against (corner), if any. */
  cornerWallId?: string;
}

export const snapToGrid = (v: number, step = GRID_STEP): number => Math.round(v / step) * step;

/** Rotation that makes an item's local +Z (its front) point along `dir` in the floor plane. */
export const rotationFacing = (dir: Vec2): number => Math.atan2(dir[0], dir[1]);

/** Items that never stick to walls. */
function wallMagnetEnabled(item: Item): boolean {
  return item.category !== "rug";
}

/**
 * Computes where an item dragged to (x, z) should land:
 * 1. 5 cm grid, 2. back flush against the closest wall (and rotated to face away from it),
 * 3. side flush against a perpendicular wall when close to a corner.
 */
export function snapItem(item: Item, x: number, z: number, scene: Scene, opts: SnapOptions = {}): SnapResult {
  const y = item.position[1];
  if (opts.disabled) return { position: [x, y, z], rotationY: item.rotationY };
  const grid = opts.grid ?? GRID_STEP;
  const threshold = opts.wallDistance ?? WALL_SNAP_DISTANCE;
  let p: Vec2 = [snapToGrid(x, grid), snapToGrid(z, grid)];
  let rotationY = item.rotationY;
  if (!wallMagnetEnabled(item)) return { position: [p[0], y, p[1]], rotationY };

  const [w, , d] = item.dimensions;
  let best: { gap: number; wallIdx: number; nOut: Vec2; dir: Vec2; target: Vec2 } | undefined;

  scene.walls.forEach((wall, wallIdx) => {
    if (y >= wall.height) return;
    const L = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if (L < 1e-6) return;
    const dir = normalize(sub(wall.end, wall.start));
    const n = perp(dir);
    const rel = sub(p, wall.start);
    const along = dot(rel, dir);
    if (along < 0 || along > L) return;
    const s = dot(rel, n);
    const side = s >= 0 ? 1 : -1;
    const nOut = scale(n, side);
    const D = wall.thickness / 2 + d / 2;
    const gap = Math.abs(Math.abs(s) - D);
    if (gap > threshold) return;
    if (!best || gap < best.gap) best = { gap, wallIdx, nOut, dir, target: add(add(wall.start, scale(dir, along)), scale(nOut, D)) };
  });

  if (!best) return { position: [p[0], y, p[1]], rotationY };
  const found = best;
  p = found.target;
  rotationY = rotationFacing(found.nOut);
  const result: SnapResult = { position: [p[0], y, p[1]], rotationY, wallId: scene.walls[found.wallIdx]!.id };

  // Corner: slide along the first wall until the item's side touches a perpendicular wall.
  let corner: { gap: number; shift: Vec2; id: string } | undefined;
  scene.walls.forEach((wall, idx) => {
    if (idx === found.wallIdx || y >= wall.height) return;
    const L = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if (L < 1e-6) return;
    const dir2 = normalize(sub(wall.end, wall.start));
    if (Math.abs(dot(dir2, found.dir)) > 0.1) return; // not perpendicular
    const n2 = perp(dir2);
    const rel = sub(p, wall.start);
    const along = dot(rel, dir2);
    // The item's back sits near the first wall, so its footprint spans `d` along dir2 from there.
    if (along < -d || along > L + d) return;
    const s2 = dot(rel, n2);
    const D2 = wall.thickness / 2 + w / 2;
    const gap = Math.abs(s2) - D2;
    if (Math.abs(gap) > threshold) return;
    const side = s2 >= 0 ? 1 : -1;
    const shift = scale(n2, -side * gap);
    if (!corner || Math.abs(gap) < corner.gap) corner = { gap: Math.abs(gap), shift, id: wall.id };
  });
  if (corner) {
    p = add(p, corner.shift);
    result.position = [p[0], y, p[1]];
    result.cornerWallId = corner.id;
  }
  return result;
}
