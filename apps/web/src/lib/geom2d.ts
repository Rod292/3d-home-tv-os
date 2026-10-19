import type { Vec2, Wall } from "@appart3d/scene";

/** Small 2D helpers on floor-plan coordinates `[x, z]`. Pure, no three.js. */

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/** Left-hand perpendicular in the XZ plane. */
export const perp = (a: Vec2): Vec2 => [-a[1], a[0]];

export function centroid(poly: Vec2[]): Vec2 {
  // Area-weighted centroid, falls back to the vertex average for degenerate polygons.
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const cross = p[0] * q[1] - q[0] * p[1];
    a += cross;
    cx += (p[0] + q[0]) * cross;
    cz += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

/** The 4 corners of a wall's footprint (centerline ± thickness/2). */
export function wallFootprint(wall: Wall, extend = 0): Vec2[] {
  const d = normalize(sub(wall.end, wall.start));
  const n = perp(d);
  const h = wall.thickness / 2;
  const s = sub(wall.start, scale(d, extend));
  const e = add(wall.end, scale(d, extend));
  return [add(s, scale(n, h)), add(e, scale(n, h)), sub(e, scale(n, h)), sub(s, scale(n, h))];
}

function project(poly: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

function axesOf(poly: Vec2[]): Vec2[] {
  const axes: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const e = sub(q, p);
    if (len(e) < 1e-9) continue;
    axes.push(normalize(perp(e)));
  }
  return axes;
}

/**
 * Separating-axis test for two convex polygons.
 * Returns the minimum penetration depth (> 0 when overlapping, <= 0 when separated).
 */
export function convexPenetration(a: Vec2[], b: Vec2[]): number {
  let minOverlap = Infinity;
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const [amin, amax] = project(a, axis);
    const [bmin, bmax] = project(b, axis);
    const overlap = Math.min(amax, bmax) - Math.max(amin, bmin);
    if (overlap < minOverlap) minOverlap = overlap;
    if (minOverlap <= 0) return minOverlap;
  }
  return minOverlap === Infinity ? 0 : minOverlap;
}

/** Distance from point p to segment ab, plus the projection parameter t ∈ [0, 1]. */
export function pointSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number; closest: Vec2 } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const closest = add(a, scale(ab, t));
  return { dist: len(sub(p, closest)), t, closest };
}

export function normalizeAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}
