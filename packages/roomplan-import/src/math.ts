/**
 * Tiny linear-algebra helpers (no three.js dependency).
 *
 * Matrices are stored the way simd_float4x4 is encoded by Swift's JSONEncoder:
 * a flat array of 16 numbers, COLUMN-major (columns[0..3] one after another).
 *   m[0..3]   = column 0 = local +X axis in world
 *   m[4..7]   = column 1 = local +Y axis
 *   m[8..11]  = column 2 = local +Z axis
 *   m[12..15] = column 3 = translation (x, y, z, 1)
 */
import type { Vec2 } from "@appart3d/scene";

export type Mat4 = readonly number[]; // length 16, column-major
export type V3 = [number, number, number];

export const DEG = Math.PI / 180;

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function translation(m: Mat4): V3 {
  return [m[12]!, m[13]!, m[14]!];
}

export function column(m: Mat4, i: 0 | 1 | 2 | 3): V3 {
  return [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!];
}

/** Transforms a local point (w = 1). */
export function transformPoint(m: Mat4, p: V3): V3 {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

export function transpose(m: Mat4): number[] {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = m[r * 4 + c]!;
  return out;
}

/** Column-major matrix for a rotation of `yaw` radians about +Y (three.js convention) then a translation. */
export function yawTranslation(yaw: number, t: V3): number[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, t[0], t[1], t[2], 1];
}

/**
 * Yaw (three.js rotationY) of a local axis lying in the XZ plane.
 * For rotationY = θ, three.js maps local +Z to world (sin θ, 0, cos θ), hence θ = atan2(x, z).
 */
export function yawOfDirection(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Wraps an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

/** Wraps an angle to (-45°, 45°] — the residual of a direction w.r.t. the nearest axis. */
export function axisResidual(a: number): number {
  const q = Math.PI / 2;
  let r = a % q;
  if (r <= -q / 2) r += q;
  if (r > q / 2) r -= q;
  return r;
}

// ---------------------------------------------------------------------------
// 2D (floor plan, [x, z])

/**
 * Rotates a plan point about the origin exactly like a three.js rotation of `phi` about +Y:
 * x' = x cos φ + z sin φ, z' = -x sin φ + z cos φ. A plan direction angle atan2(dz, dx) becomes (angle - φ).
 */
export function rotatePlan(p: Vec2, phi: number): Vec2 {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
}

export const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const scale2 = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dot2 = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const len2 = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function norm2(a: Vec2): Vec2 {
  const l = len2(a) || 1;
  return [a[0] / l, a[1] / l];
}

/** Plan-direction angle atan2(dz, dx) of segment a→b. */
export function segAngle(a: Vec2, b: Vec2): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/** Distance from p to segment [a, b] and the clamped parameter t ∈ [0, 1]. */
export function pointSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number } {
  const ab = sub2(b, a);
  const l2 = dot2(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot2(sub2(p, a), ab) / l2));
  return { dist: dist2(p, add2(a, scale2(ab, t))), t };
}

/** Signed area (positive = counter-clockwise in the scene's convention, matching polygonArea). */
export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function centroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

/** Andrew's monotone chain convex hull, returned counter-clockwise (positive signedArea). */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Removes consecutive duplicates and collinear vertices; ensures CCW (positive area). */
export function cleanPolygon(poly: Vec2[], eps = 0.02): Vec2[] {
  let pts = poly.filter((p, i) => dist2(p, poly[(i + 1) % poly.length]!) > eps);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      if (pointSegment(b, a, c).dist < eps / 2) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  if (signedArea(pts) < 0) pts = pts.reverse();
  return pts;
}

/** Distance from p to an oriented rectangle (0 when inside). */
export function pointRectDistance(p: Vec2, center: Vec2, halfW: number, halfD: number, yaw: number): number {
  // Express p in the rectangle's local frame (inverse of three.js rotation about Y).
  const local = rotatePlan(sub2(p, center), -yaw);
  const dx = Math.max(0, Math.abs(local[0]) - halfW);
  const dz = Math.max(0, Math.abs(local[1]) - halfD);
  return Math.hypot(dx, dz);
}

export const round = (v: number, decimals = 4): number => {
  const k = 10 ** decimals;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};

/** World → plan mapping used by the whole importer. */
export interface PlanFrame {
  /** Rotation about +Y applied to the world (three.js sense), see rotatePlan. */
  phi: number;
  /** Translation applied after the rotation. */
  offset: Vec2;
  /** World Y of the floor; plan elevations are relative to it. */
  floorY: number;
}

export function toPlan(frame: PlanFrame, worldXZ: Vec2): Vec2 {
  return add2(rotatePlan(worldXZ, frame.phi), frame.offset);
}
