import type { Item, Opening, Scene, Vec2, Wall } from "./types";

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}

/** Unit direction from wall.start to wall.end, in floor-plan coordinates. */
export function wallDirection(wall: Wall): Vec2 {
  const len = wallLength(wall) || 1;
  return [(wall.end[0] - wall.start[0]) / len, (wall.end[1] - wall.start[1]) / len];
}

/**
 * Unit normal of the wall's LEFT face (left when walking start → end, seen from above with +X right
 * and +Z down the screen, i.e. the three.js top view). The right face normal is its opposite.
 */
export function wallNormal(wall: Wall): Vec2 {
  const [dx, dz] = wallDirection(wall);
  return [dz, -dx];
}

/** Which face of the wall a floor point is on. */
export function wallSideOf(wall: Wall, pt: Vec2): "left" | "right" {
  const [nx, nz] = wallNormal(wall);
  return (pt[0] - wall.start[0]) * nx + (pt[1] - wall.start[1]) * nz >= 0 ? "left" : "right";
}

/** Effective color of one face of a wall. */
export function wallFaceColor(wall: Wall, side: "left" | "right"): string | undefined {
  return wall.faceColors?.[side] ?? wall.color;
}

/** Rotation around Y that aligns local +X with the wall direction (three.js convention). */
export function wallAngle(wall: Wall): number {
  const [dx, dz] = wallDirection(wall);
  return -Math.atan2(dz, dx);
}

export function openingsOnWall(scene: Scene, wallId: string): Opening[] {
  return scene.openings.filter((o) => o.wallId === wallId).sort((a, b) => a.offset - b.offset);
}

/** The 4 floor-plan corners of an item's rotated footprint. */
export function itemFootprint(item: Item): Vec2[] {
  const [w, , d] = item.dimensions;
  const [cx, , cz] = item.position;
  const c = Math.cos(item.rotationY);
  const s = Math.sin(item.rotationY);
  const local: Vec2[] = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  // three.js rotation about +Y: x' = x cos + z sin, z' = -x sin + z cos
  return local.map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}

export interface Bounds2 {
  min: Vec2;
  max: Vec2;
}

export function sceneBounds(scene: Scene): Bounds2 {
  const pts: Vec2[] = [...scene.walls.flatMap((w) => [w.start, w.end]), ...scene.rooms.flatMap((r) => r.floor)];
  if (pts.length === 0) return { min: [0, 0], max: [0, 0] };
  return {
    min: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
    max: [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
  };
}

export function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function roomAt(scene: Scene, pt: Vec2) {
  return scene.rooms.find((r) => pointInPolygon(pt, r.floor));
}
