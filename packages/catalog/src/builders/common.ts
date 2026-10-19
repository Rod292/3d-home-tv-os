import * as THREE from "three";
import { darken, lighten, contrast } from "../color";
import { partsBounds } from "../geometry";
import { Parts, clamp, type Part, type V3 } from "../parts";
import { palette } from "../theme";

/** Build context: the target dimensions + resolved main color. */
export interface Ctx {
  w: number;
  h: number;
  d: number;
  color: string;
  /** Stable per-item seed for procedural details (books, art…). */
  seed: number;
  /** Free-form `Item.attributes` (appearance hints, e.g. a person's `skin` / `hair`). Never undefined. */
  attrs: Readonly<Record<string, string>>;
}

export type Build = (c: Ctx) => Parts;

export { Parts, clamp, darken, lighten, contrast, palette };

export type LegShape = "round" | "square" | "taper";

/** Legs whose CENTERS are at the given (x, z) points; `size` = (top) diameter / side. */
export function legs(p: Parts, pts: [number, number][], y0: number, y1: number, size: number, color: string, shape: LegShape = "taper"): void {
  for (const [x, z] of pts) {
    if (shape === "square") p.rbox([x - size / 2, y0, z - size / 2], [x + size / 2, y1, z + size / 2], color, size * 0.2, { seg: 1 });
    else p.cyl(x, z, y0, y1, size / 2, size / 2, color, { seg: 8, taper: shape === "taper" ? 1.6 : 1 });
  }
}

/** Four leg centers inset from a rectangle's edges so the legs touch the rectangle sides when inset = 0. */
export function cornerPts(x0: number, x1: number, z0: number, z1: number, size: number, inset = 0): [number, number][] {
  const a = x0 + inset + size / 2;
  const b = x1 - inset - size / 2;
  const c = z0 + inset + size / 2;
  const e = z1 - inset - size / 2;
  return [
    [a, c],
    [b, c],
    [a, e],
    [b, e],
  ];
}

export type FrontKind = "drawer" | "door" | "open";
export interface FrontRow {
  weight: number;
  kind: FrontKind;
  cols?: number;
  /** Column indices left open (a dark recess instead of a door/drawer). */
  openCols?: number[];
}
export interface FrontsOpts {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Plane of the body's front face; panels go from z to z + t, handles up to z + t + hd. */
  z: number;
  t?: number;
  hd?: number;
  gap?: number;
  cols: number;
  rows: FrontRow[];
  color: string;
  handleColor: string;
  handle?: "bar" | "knob" | "none" | "long";
  recessColor?: string;
}

/** Cabinet doors / drawers grid on a front face, rows listed top to bottom. */
export function fronts(p: Parts, o: FrontsOpts): void {
  const t = o.t ?? 0.018;
  const hd = o.handle === "none" ? 0 : (o.hd ?? 0.02);
  const gap = o.gap ?? 0.008;
  const total = o.rows.reduce((s, r) => s + r.weight, 0);
  let yTop = o.y1;
  const H = o.y1 - o.y0;
  for (const row of o.rows) {
    const rh = (H * row.weight) / total;
    const ry0 = yTop - rh;
    const ry1 = yTop;
    yTop = ry0;
    const cols = row.cols ?? o.cols;
    const cw = (o.x1 - o.x0) / cols;
    for (let i = 0; i < cols; i++) {
      const cx0 = o.x0 + i * cw + gap / 2;
      const cx1 = o.x0 + (i + 1) * cw - gap / 2;
      const cy0 = ry0 + gap / 2;
      const cy1 = ry1 - gap / 2;
      if (row.kind === "open" || row.openCols?.includes(i)) {
        p.box([cx0 + 0.01, cy0 + 0.01, o.z], [cx1 - 0.01, cy1 - 0.01, o.z + 0.002], o.recessColor ?? darken(o.color, 0.55));
        continue;
      }
      p.rbox([cx0, cy0, o.z], [cx1, cy1, o.z + t], o.color, Math.min(0.008, t / 2), { seg: 1 });
      if (hd <= 0) continue;
      const hz0 = o.z + t;
      const hz1 = o.z + t + hd;
      const pw = cx1 - cx0;
      const ph = cy1 - cy0;
      if (o.handle === "knob") {
        let kx = (cx0 + cx1) / 2;
        let ky = (cy0 + cy1) / 2;
        if (row.kind === "door") {
          // knob near the inner edge (pairs open from the middle)
          const leftOfPair = cols > 1 && i % 2 === 0 && i < cols - (cols % 2);
          kx = leftOfPair || (cols === 1) ? cx1 - Math.min(0.05, pw * 0.2) : cx0 + Math.min(0.05, pw * 0.2);
          ky = cy1 - Math.min(ph * 0.25, 0.12);
        }
        const kr = clamp(Math.min(pw, ph) * 0.06, 0.008, 0.016);
        p.cylZ(kx, ky, hz0, hz1, kr, kr, o.handleColor, { seg: 8 });
      } else if (row.kind === "drawer" || o.handle === "long") {
        const len = row.kind === "drawer" ? clamp(pw * 0.4, 0.05, 0.3) : pw * 0.7;
        const hy = row.kind === "drawer" ? (ph > 0.25 ? cy1 - 0.06 : (cy0 + cy1) / 2) : cy1 - 0.035;
        const hh = 0.014;
        const cx = (cx0 + cx1) / 2;
        p.rbox([cx - len / 2, hy - hh / 2, hz0], [cx + len / 2, hy + hh / 2, hz1], o.handleColor, 0.005, { seg: 1 });
      } else {
        // vertical bar near the inner edge
        const leftOfPair = cols > 1 && i % 2 === 0 && i < cols - (cols % 2);
        const hx = leftOfPair || cols === 1 ? cx1 - 0.04 : cx0 + 0.04;
        const len = clamp(ph * 0.3, 0.06, 0.35);
        const hy =
          ph > 1.2
            ? clamp(1.0, cy0 + len / 2 + 0.02, cy1 - len / 2 - 0.02)
            : cy1 - len / 2 - Math.min(0.05, ph * 0.1);
        const ww = 0.014;
        p.rbox([hx - ww / 2, hy - len / 2, hz0], [hx + ww / 2, hy + len / 2, hz1], o.handleColor, 0.005, { seg: 1 });
      }
    }
  }
}

/** Number of equal columns of roughly `target` meters across `span`. */
export function colsFor(span: number, target: number, max = 8): number {
  return clamp(Math.round(span / target), 1, max);
}

/** Some cheerful accent colors for small procedural details. */
export const ACCENTS = [palette.terracotta, palette.mustard, palette.sage, palette.slate, palette.blush, palette.cream, palette.sageDark];

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

/**
 * Affinely remaps parts designed at a nominal size so their exact bounds become the target box
 * (x ∈ [-w/2, w/2], y ∈ [0, h], z ∈ [-d/2, d/2]). Exact for axis-aligned parts and for rotations by
 * multiples of 90° (axis permutations); other rotations get an approximate per-axis scale.
 * Tubes must be authored in world space (pos = origin, no rot / scale): their path is remapped and
 * their radius scaled by the mean factor — keep them away from the bounds.
 */
export function fitToBox(src: Parts, w: number, h: number, d: number): Parts {
  const b = partsBounds(src.list);
  const out = new Parts();
  if (b.isEmpty()) return out;
  const s: V3 = [w / Math.max(b.max.x - b.min.x, 1e-6), h / Math.max(b.max.y - b.min.y, 1e-6), d / Math.max(b.max.z - b.min.z, 1e-6)];
  const map = (v: V3): V3 => [-w / 2 + (v[0] - b.min.x) * s[0], (v[1] - b.min.y) * s[1], -d / 2 + (v[2] - b.min.z) * s[2]];
  const mean = (s[0] + s[1] + s[2]) / 3;
  for (const part of src.list) {
    if (part.geo.kind === "tube") {
      const q: Part = { ...part, geo: { ...part.geo, path: part.geo.path.map((v) => map([v[0] + part.pos[0], v[1] + part.pos[1], v[2] + part.pos[2]])), r: part.geo.r * mean }, pos: [0, 0, 0] };
      out.list.push(q);
      continue;
    }
    const base = part.scale ?? [1, 1, 1];
    let f: V3 = s;
    if (part.rot) {
      _m.makeRotationFromEuler(_e.set(...part.rot));
      const e = _m.elements; // column-major: column i = world direction of local axis i
      f = [0, 1, 2].map((i) => Math.hypot((e[i * 4] as number) * s[0], (e[i * 4 + 1] as number) * s[1], (e[i * 4 + 2] as number) * s[2])) as V3;
    }
    out.list.push({ ...part, pos: map(part.pos), scale: [base[0] * f[0], base[1] * f[1], base[2] * f[2]] });
  }
  return out;
}
