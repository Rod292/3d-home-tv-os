import { itemFootprint, type Item, type Scene } from "@appart3d/scene";
import { convexPenetration, wallFootprint } from "./geom2d";
import { effectiveMount } from "./mount";

/** Penetration tolerated before we call it a collision (scans and hand-made plans are imprecise). */
export const WALL_TOLERANCE = 0.05;
export const ITEM_TOLERANCE = 0.02;

/** Items lying flat on the floor never collide (rugs). */
export function isFlat(item: Item): boolean {
  return item.category === "rug" || item.dimensions[1] < 0.03;
}

const TUCKABLE = new Set(["chair"]);
const TUCK_UNDER = new Set(["table", "desk"]);

/** Pairs that are allowed to interpenetrate (a chair pushed under a table, curtains drawn over a radiator). */
function allowedPair(a: Item, b: Item): boolean {
  if (a.category === "curtain" || b.category === "curtain") return true;
  if (a.category === "person" || b.category === "person") return true; // people sit on seats and sink into cushions
  return (TUCKABLE.has(a.category) && TUCK_UNDER.has(b.category)) || (TUCKABLE.has(b.category) && TUCK_UNDER.has(a.category));
}

function verticalOverlap(a: Item, b: Item): boolean {
  const a0 = a.position[1];
  const a1 = a0 + a.dimensions[1];
  const b0 = b.position[1];
  const b1 = b0 + b.dimensions[1];
  return Math.min(a1, b1) - Math.max(a0, b0) > 0.01;
}

export interface CollisionReport {
  walls: string[];
  items: string[];
}

export function itemCollisions(item: Item, scene: Scene): CollisionReport {
  const report: CollisionReport = { walls: [], items: [] };
  if (isFlat(item)) return report;
  const fp = itemFootprint(item);
  const mount = effectiveMount(item);
  // Wall items hang ON a wall (often sunk into it in scans): walls are not obstacles for them.
  if (mount !== "wall")
    for (const w of scene.walls) {
      if (item.position[1] >= w.height) continue;
      if (convexPenetration(fp, wallFootprint(w)) > WALL_TOLERANCE) report.walls.push(w.id);
    }
  for (const other of scene.items) {
    if (other.id === item.id || isFlat(other) || allowedPair(item, other) || !verticalOverlap(item, other)) continue;
    // Different mounts live in different layers (a mirror above a chest of drawers, a pendant over a table).
    if (effectiveMount(other) !== mount) continue;
    if (convexPenetration(fp, itemFootprint(other)) > ITEM_TOLERANCE) report.items.push(other.id);
  }
  return report;
}

export function hasCollision(item: Item, scene: Scene): boolean {
  const r = itemCollisions(item, scene);
  return r.walls.length > 0 || r.items.length > 0;
}
