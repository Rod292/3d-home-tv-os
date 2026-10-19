/** Scanned furniture often sinks a few cm into walls (bounding boxes are loose): push it back out. */
import { itemFootprint, wallDirection, wallLength, type Item, type Wall } from "@appart3d/scene";

/** Deeper than this, the overlap is not scan noise (e.g. an object really straddling a partition). */
const MAX_PUSH = 0.25;
const CLEARANCE = 0.002;

/** Moves each floor item out of the walls it penetrates (two passes for corners). Returns how many moved. */
export function settleItems(items: Item[], walls: Wall[]): number {
  const moved = new Set<string>();
  for (let pass = 0; pass < 2; pass++) {
    for (const item of items) {
      if (item.position[1] > 0.3) continue; // wall cabinets & co. sit above the floor on purpose
      for (const w of walls) {
        const push = wallPush(item, w);
        if (!push) continue;
        item.position = [item.position[0] + push[0], item.position[1], item.position[2] + push[1]];
        moved.add(item.id);
      }
    }
  }
  return moved.size;
}

function wallPush(item: Item, w: Wall): [number, number] | null {
  const len = wallLength(w);
  if (len === 0) return null;
  const [dx, dz] = wallDirection(w);
  const [nx, nz] = [dz, -dx];
  const rel = (x: number, z: number) => [(x - w.start[0]) * dx + (z - w.start[1]) * dz, (x - w.start[0]) * nx + (z - w.start[1]) * nz] as const;
  const [along, side] = rel(item.position[0], item.position[2]);
  if (along < 0 || along > len || Math.abs(side) < 1e-6) return null;
  const s = Math.sign(side);
  // Corners lying alongside the wall, measured as distance from the wall's center line on the item's side.
  let minDist = Infinity;
  for (const [x, z] of itemFootprint(item)) {
    const [a, d] = rel(x, z);
    if (a < -0.01 || a > len + 0.01) continue;
    minDist = Math.min(minDist, d * s);
  }
  const depth = w.thickness / 2 - minDist;
  if (!(depth > 0) || depth > MAX_PUSH) return null;
  const k = (depth + CLEARANCE) * s;
  return [nx * k, nz * k];
}
