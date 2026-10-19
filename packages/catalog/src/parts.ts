/**
 * Pure model descriptors. Builders return `Part[]` (geometry spec + transform + color + role),
 * which keeps them testable without a WebGL context; `geometry.ts` turns specs into
 * cached three.js geometries and `FurnitureModel` renders them.
 *
 * Local frame: origin at the center of the footprint on the floor, y up, the front faces +Z.
 * x ∈ [-w/2, w/2], y ∈ [0, h], z ∈ [-d/2, d/2]  (back = -Z).
 */
import type { MaterialRole } from "./theme";

export type V3 = [number, number, number];
export type V2 = [number, number];

export type GeomSpec =
  /** Plain box centered on its origin. */
  | { kind: "box"; size: V3 }
  /** Rounded box centered on its origin (chunky bevels). */
  | { kind: "rbox"; size: V3; r: number; seg: number }
  /** Vertical cylinder / cone frustum centered on its origin. */
  | { kind: "cyl"; rTop: number; rBottom: number; h: number; seg: number }
  /** Low-poly blob (icosahedron detail 1: its bbox is exactly the unit sphere). */
  | { kind: "ico"; r: number; detail: number }
  /** Smooth UV sphere (segments multiple of 4 so the bbox is exact). */
  | { kind: "sphere"; r: number; seg: number }
  /** Lathe around Y from [radius, y] points. */
  | { kind: "lathe"; pts: V2[]; seg: number }
  /**
   * Hollow rounded-rect (or ellipse) wall, base at y = 0, centered in XZ.
   * Used for basins, bathtubs, shower trays, toilet seats.
   */
  | { kind: "ring"; w: number; d: number; h: number; wall: number; r: number; ellipse: boolean }
  /** Rounded-rect slab (rounded in plan only), base at y = 0, centered in XZ. */
  | { kind: "slab"; w: number; d: number; h: number; r: number }
  /** Generic prism: polygon in the XY plane extruded along Z, centered on z = 0. */
  | { kind: "prism"; pts: V2[]; depth: number }
  /** Torus in the XY plane (faces +Z). */
  | { kind: "torus"; R: number; r: number; seg: number }
  /** Tube along a polyline path (smoothed by a Catmull-Rom curve). */
  | { kind: "tube"; path: V3[]; r: number; seg: number; steps: number };

export interface Part {
  geo: GeomSpec;
  pos: V3;
  rot?: V3;
  scale?: V3;
  color: string;
  role?: MaterialRole;
  /** Defaults to true (glass parts set false). */
  castShadow?: boolean;
}

export interface PartOpts {
  rot?: V3;
  scale?: V3;
  role?: MaterialRole;
  castShadow?: boolean;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic PRNG (mulberry32) so procedural details are stable across renders. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small fluent helper used by every builder. Coordinates are min/max corners in local space. */
export class Parts {
  readonly list: Part[] = [];

  add(geo: GeomSpec, pos: V3, color: string, o: PartOpts = {}): this {
    const p: Part = { geo, pos, color };
    if (o.rot) p.rot = o.rot;
    if (o.scale) p.scale = o.scale;
    if (o.role) p.role = o.role;
    if (o.castShadow === false) p.castShadow = false;
    this.list.push(p);
    return this;
  }

  /** Axis-aligned plain box from its min / max corners. */
  box(min: V3, max: V3, color: string, o?: PartOpts): this {
    const size = sub(max, min);
    if (size.some((s) => s <= 1e-5)) return this;
    return this.add({ kind: "box", size }, center(min, max), color, o);
  }

  /** Axis-aligned rounded box from its min / max corners. Radius is clamped to fit. */
  rbox(min: V3, max: V3, color: string, r = 0.02, o: PartOpts & { seg?: number } = {}): this {
    const size = sub(max, min);
    if (size.some((s) => s <= 1e-5)) return this;
    const rr = Math.min(r, Math.min(...size) / 2 - 1e-4);
    if (rr <= 0.002) return this.add({ kind: "box", size }, center(min, max), color, o);
    return this.add({ kind: "rbox", size, r: rr, seg: o.seg ?? 2 }, center(min, max), color, o);
  }

  /**
   * Vertical cylinder from y0 to y1 at (x, z), elliptic when rx != rz.
   * `taper` = top radius / bottom radius.
   */
  cyl(x: number, z: number, y0: number, y1: number, rx: number, rz: number, color: string, o: PartOpts & { taper?: number; seg?: number } = {}): this {
    const h = y1 - y0;
    if (h <= 1e-5 || rx <= 1e-5 || rz <= 1e-5) return this;
    const taper = o.taper ?? 1;
    const rTop = taper <= 1 ? taper : 1;
    const rBottom = taper <= 1 ? 1 : 1 / taper;
    return this.add({ kind: "cyl", rTop, rBottom, h, seg: o.seg ?? 16 }, [x, (y0 + y1) / 2, z], color, {
      ...o,
      scale: [rx, 1, rz],
    });
  }

  /** Horizontal cylinder along X between x0 and x1 at (y, z). */
  cylX(x0: number, x1: number, y: number, z: number, r: number, color: string, o: PartOpts & { seg?: number } = {}): this {
    const h = x1 - x0;
    if (h <= 1e-5 || r <= 1e-5) return this;
    return this.add({ kind: "cyl", rTop: r, rBottom: r, h, seg: o.seg ?? 10 }, [(x0 + x1) / 2, y, z], color, {
      ...o,
      rot: [0, 0, Math.PI / 2],
    });
  }

  /** Horizontal cylinder along Z between z0 and z1 at (x, y), elliptic section allowed. */
  cylZ(x: number, y: number, z0: number, z1: number, rx: number, ry: number, color: string, o: PartOpts & { seg?: number } = {}): this {
    const h = z1 - z0;
    if (h <= 1e-5 || rx <= 1e-5 || ry <= 1e-5) return this;
    return this.add({ kind: "cyl", rTop: 1, rBottom: 1, h, seg: o.seg ?? 16 }, [x, y, (z0 + z1) / 2], color, {
      ...o,
      rot: [Math.PI / 2, 0, 0],
      scale: [rx, 1, ry],
    });
  }

  /** Low-poly blob with per-axis radii. */
  blob(c: V3, radii: V3, color: string, o: PartOpts = {}): this {
    if (radii.some((r) => r <= 1e-5)) return this;
    return this.add({ kind: "ico", r: 1, detail: 1 }, c, color, { ...o, scale: radii });
  }

  /** Smooth ellipsoid with per-axis radii. */
  sphere(c: V3, radii: V3, color: string, o: PartOpts & { seg?: number } = {}): this {
    if (radii.some((r) => r <= 1e-5)) return this;
    return this.add({ kind: "sphere", r: 1, seg: o.seg ?? 16 }, c, color, { ...o, scale: radii });
  }

  merge(other: Parts): this {
    this.list.push(...other.list);
    return this;
  }
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function center(a: V3, b: V3): V3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
