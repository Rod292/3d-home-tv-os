/**
 * Walls: extraction from RoomPlan surfaces, de-duplication, plan normalization
 * (dominant-axis rotation, squaring, collinear alignment, corner snapping).
 */
import type { Vec2 } from "@appart3d/scene";
import {
  DEG,
  add2,
  axisResidual,
  column,
  cross2,
  dist2,
  dot2,
  len2,
  norm2,
  pointSegment,
  rotatePlan,
  scale2,
  segAngle,
  sub2,
  translation,
} from "./math";
import type { ParsedSurface } from "./parse";

export interface RawWall {
  /** RoomPlan identifier (or synthetic). */
  id: string;
  start: Vec2;
  end: Vec2;
  /** World Y of the top edge. */
  top: number;
  /** World Y of the bottom edge. */
  bottom: number;
  /** Indices of the captures (rooms) this wall belongs to. */
  captures: Set<number>;
  curved: boolean;
}

/**
 * A RoomPlan wall is a zero-thickness rectangle: `transform` is its center, local +X runs along the
 * wall, local +Y is up, local +Z is the normal (observed to point into the room). dimensions = [width, height, 0].
 */
export function extractWall(s: ParsedSurface, captures: Set<number>): RawWall | null {
  const [cx, cy, cz] = translation(s.transform);
  const [ax, , az] = column(s.transform, 0);
  const dir = norm2([ax, az]);
  const half = s.dimensions[0] / 2;
  const h = s.dimensions[1];
  if (!(half > 0.005) || !(h > 0) || len2([ax, az]) < 1e-6) return null;
  const c: Vec2 = [cx, cz];
  return {
    id: s.id,
    start: sub2(c, scale2(dir, half)),
    end: add2(c, scale2(dir, half)),
    top: cy + h / 2,
    bottom: cy - h / 2,
    captures,
    curved: s.curved,
  };
}

const wallLen = (w: { start: Vec2; end: Vec2 }) => dist2(w.start, w.end);

/** Smallest angle between two undirected lines, in [0, π/2]. */
function lineAngleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/**
 * Removes walls that describe the same physical wall twice (adjacent rooms scanned separately,
 * or a structure that kept both faces). Two walls merge when they are near-parallel (< 5°),
 * close (≤ 15 cm apart) and overlap by ≥ 50 % of the shorter one. The longer wall is extended
 * to cover both. Returns an alias map removedId → keptId.
 */
export function dedupeWalls(input: RawWall[]): { walls: RawWall[]; alias: Map<string, string>; removed: number } {
  const walls = input.map((w) => ({ ...w, captures: new Set(w.captures) }));
  const alias = new Map<string, string>();
  let removed = 0;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const a = walls[i]!;
        const b = walls[j]!;
        if (lineAngleDiff(segAngle(a.start, a.end), segAngle(b.start, b.end)) > 5 * DEG) continue;
        const [keep, drop] = wallLen(a) >= wallLen(b) ? [a, b] : [b, a];
        const dir = norm2(sub2(keep.end, keep.start));
        const nrm: Vec2 = [-dir[1], dir[0]];
        const off = (p: Vec2) => Math.abs(dot2(sub2(p, keep.start), nrm));
        if (off(drop.start) > 0.15 || off(drop.end) > 0.15) continue;
        const t = (p: Vec2) => dot2(sub2(p, keep.start), dir);
        const k0 = 0;
        const k1 = wallLen(keep);
        const d0 = Math.min(t(drop.start), t(drop.end));
        const d1 = Math.max(t(drop.start), t(drop.end));
        const overlap = Math.min(k1, d1) - Math.max(k0, d0);
        if (overlap < 0.5 * Math.min(k1 - k0, d1 - d0)) continue;
        const n0 = Math.min(k0, d0);
        const n1 = Math.max(k1, d1);
        const origin = keep.start;
        keep.start = add2(origin, scale2(dir, n0));
        keep.end = add2(origin, scale2(dir, n1));
        keep.top = Math.max(keep.top, drop.top);
        keep.bottom = Math.min(keep.bottom, drop.bottom);
        for (const c of drop.captures) keep.captures.add(c);
        alias.set(drop.id, keep.id);
        for (const [k, v] of alias) if (v === drop.id) alias.set(k, keep.id);
        walls.splice(walls.indexOf(drop), 1);
        removed++;
        changed = true;
        break outer;
      }
    }
  }
  return { walls, alias, removed };
}

/**
 * Dominant wall direction modulo 90°, returned in (-45°, 45°]. Length-weighted histogram
 * (0.5° bins, ±3° window) for robustness against diagonal walls, refined with a weighted
 * circular mean of the walls near the peak.
 */
export function dominantAngle(walls: { start: Vec2; end: Vec2 }[]): number {
  if (walls.length === 0) return 0;
  const BIN = 0.5;
  const N = Math.round(90 / BIN);
  const hist = new Array<number>(N).fill(0);
  const residuals = walls.map((w) => ({ r: axisResidual(segAngle(w.start, w.end)), w: wallLen(w) }));
  for (const { r, w } of residuals) {
    const deg = ((r / DEG) % 90 + 90) % 90;
    hist[Math.floor(deg / BIN) % N]! += w;
  }
  const WIN = Math.round(3 / BIN);
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -WIN; k <= WIN; k++) s += hist[(i + k + N) % N]!;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  const peak = ((best + 0.5) * BIN) * DEG;
  // Weighted circular mean (period 90° → multiply angles by 4) of residuals near the peak.
  let sx = 0;
  let sy = 0;
  for (const { r, w } of residuals) {
    if (Math.abs(axisResidual(r - peak)) > 6 * DEG) continue;
    sx += w * Math.cos(4 * r);
    sy += w * Math.sin(4 * r);
  }
  const mean = sx === 0 && sy === 0 ? peak : Math.atan2(sy, sx) / 4;
  return axisResidual(mean);
}

export interface PlanWall {
  id: string;
  start: Vec2;
  end: Vec2;
  /** Height above the floor. */
  height: number;
  captures: Set<number>;
  /** True when snapped to an axis. */
  square: boolean;
}

export interface NormalizeOptions {
  squareToleranceDeg: number;
  snapDistance: number;
}

type Axis = "h" | "v" | null;
const axisOf = (w: PlanWall): Axis => {
  if (!w.square) return null;
  return Math.abs(w.end[1] - w.start[1]) <= Math.abs(w.end[0] - w.start[0]) ? "h" : "v";
};

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

function lineIntersection(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): Vec2 | null {
  const r = sub2(a1, a0);
  const s = sub2(b1, b0);
  const den = cross2(r, s);
  if (Math.abs(den) < 1e-9 * len2(r) * len2(s) || Math.abs(den) < 1e-12) return null;
  const t = cross2(sub2(b0, a0), s) / den;
  return add2(a0, scale2(r, t));
}

/**
 * Squares, aligns and snaps walls that are ALREADY rotated into the dominant frame.
 * Returns walls whose corners close exactly (shared endpoints are bit-identical).
 */
export function normalizeWalls(walls: PlanWall[], opts: NormalizeOptions): PlanWall[] {
  const tol = opts.squareToleranceDeg * DEG;
  const snap = opts.snapDistance;

  // 1. Square: rotate near-axis walls about their midpoint onto the axis.
  let ws: PlanWall[] = walls.map((w) => {
    const ang = segAngle(w.start, w.end);
    const res = axisResidual(ang);
    if (Math.abs(res) > tol) return { ...w, square: false };
    const target = ang - res;
    const mid = scale2(add2(w.start, w.end), 0.5);
    const half = wallLen(w) / 2;
    let dir: Vec2 = [Math.cos(target), Math.sin(target)];
    dir = [Math.round(dir[0]), Math.round(dir[1])]; // exact axis
    return { ...w, start: sub2(mid, scale2(dir, half)), end: add2(mid, scale2(dir, half)), square: true };
  });

  // 2. Align collinear axis walls (same line within 5 cm, gap ≤ 50 cm) onto one length-weighted line.
  for (const axis of ["h", "v"] as const) {
    const idx = ws.map((w, i) => (axisOf(w) === axis ? i : -1)).filter((i) => i >= 0);
    const coord = (w: PlanWall) => (axis === "h" ? w.start[1] : w.start[0]);
    const range = (w: PlanWall): [number, number] => {
      const a = axis === "h" ? w.start[0] : w.start[1];
      const b = axis === "h" ? w.end[0] : w.end[1];
      return [Math.min(a, b), Math.max(a, b)];
    };
    const uf = new UnionFind(ws.length);
    for (const i of idx)
      for (const j of idx) {
        if (j <= i) continue;
        const a = ws[i]!;
        const b = ws[j]!;
        if (Math.abs(coord(a) - coord(b)) > 0.05) continue;
        const [a0, a1] = range(a);
        const [b0, b1] = range(b);
        const gap = Math.max(a0, b0) - Math.min(a1, b1);
        if (gap <= 0.5) uf.union(i, j);
      }
    const groups = new Map<number, number[]>();
    for (const i of idx) {
      const r = uf.find(i);
      groups.set(r, [...(groups.get(r) ?? []), i]);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      let sw = 0;
      let sc = 0;
      for (const i of g) {
        sw += wallLen(ws[i]!);
        sc += wallLen(ws[i]!) * coord(ws[i]!);
      }
      const c = sc / sw;
      for (const i of g) {
        const w = ws[i]!;
        ws[i] = axis === "h" ? { ...w, start: [w.start[0], c], end: [w.end[0], c] } : { ...w, start: [c, w.start[1]], end: [c, w.end[1]] };
      }
    }
  }

  // 3. Corner snapping: cluster endpoints that are close, or whose walls' lines intersect close to both.
  const ends: { w: number; k: 0 | 1 }[] = [];
  ws.forEach((_, i) => ends.push({ w: i, k: 0 }, { w: i, k: 1 }));
  const pt = (e: { w: number; k: 0 | 1 }) => (e.k === 0 ? ws[e.w]!.start : ws[e.w]!.end);
  const uf = new UnionFind(ends.length);
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const ei = ends[i]!;
      const ej = ends[j]!;
      if (ei.w === ej.w) continue;
      const p = pt(ei);
      const q = pt(ej);
      if (dist2(p, q) <= snap) {
        uf.union(i, j);
        continue;
      }
      if (dist2(p, q) > 3 * snap) continue;
      const wi = ws[ei.w]!;
      const wj = ws[ej.w]!;
      if (lineAngleDiff(segAngle(wi.start, wi.end), segAngle(wj.start, wj.end)) < 20 * DEG) continue;
      const x = lineIntersection(wi.start, wi.end, wj.start, wj.end);
      if (x && dist2(x, p) <= snap && dist2(x, q) <= snap) uf.union(i, j);
    }
  const clusters = new Map<number, number[]>();
  ends.forEach((_, i) => {
    const r = uf.find(i);
    clusters.set(r, [...(clusters.get(r) ?? []), i]);
  });
  const newPts = ends.map((e) => pt(e));
  const singleton = new Set<number>();
  for (const members of clusters.values()) {
    if (members.length < 2) {
      singleton.add(members[0]!);
      continue;
    }
    const mw = members.map((m) => ws[ends[m]!.w]!);
    const vs = members.filter((_, k) => axisOf(mw[k]!) === "v").map((m) => pt(ends[m]!));
    const hs = members.filter((_, k) => axisOf(mw[k]!) === "h").map((m) => pt(ends[m]!));
    const all = members.map((m) => pt(ends[m]!));
    const mean = (arr: Vec2[], i: 0 | 1) => arr.reduce((s, p) => s + p[i], 0) / arr.length;
    let rep: Vec2 = [vs.length ? mean(vs, 0) : mean(all, 0), hs.length ? mean(hs, 1) : mean(all, 1)];
    // Two non-axis walls meeting: use their line intersection when it is close.
    if (!vs.length && !hs.length && members.length === 2) {
      const [a, b] = mw;
      const x = lineIntersection(a!.start, a!.end, b!.start, b!.end);
      if (x && dist2(x, rep) <= snap) rep = x;
    }
    for (const m of members) newPts[m] = rep;
  }
  ws = ws.map((w, i) => ({ ...w, start: newPts[2 * i]!, end: newPts[2 * i + 1]! }));

  // 4. T-junctions: a free endpoint close to another wall's interior is projected onto it.
  for (const m of singleton) {
    const e = ends[m]!;
    const p = e.k === 0 ? ws[e.w]!.start : ws[e.w]!.end;
    let best: { d: number; q: Vec2 } | null = null;
    ws.forEach((o, j) => {
      if (j === e.w) return;
      const { dist, t } = pointSegment(p, o.start, o.end);
      if (dist <= snap && dist > 1e-9 && t > 0 && t < 1 && (!best || dist < best.d)) {
        const own = ws[e.w]!;
        // Slide along our own axis when we are square, to keep the wall straight.
        let q = add2(o.start, scale2(sub2(o.end, o.start), t));
        const ax = axisOf(own);
        const oax = axisOf(o);
        if (ax === "h" && oax === "v") q = [o.start[0], p[1]];
        if (ax === "v" && oax === "h") q = [p[0], o.start[1]];
        best = { d: dist, q };
      }
    });
    if (best) {
      const w = ws[e.w]!;
      ws[e.w] = e.k === 0 ? { ...w, start: (best as { q: Vec2 }).q } : { ...w, end: (best as { q: Vec2 }).q };
    }
  }

  return ws.filter((w) => wallLen(w) >= 0.05);
}

/** Rotates a raw wall into the plan frame (angle φ, see rotatePlan) and converts heights relative to the floor. */
export function toPlanWall(w: RawWall, phi: number, floorY: number): PlanWall {
  return {
    id: w.id,
    start: rotatePlan(w.start, phi),
    end: rotatePlan(w.end, phi),
    height: Math.max(0.1, w.top - floorY),
    captures: w.captures,
    square: false,
  };
}
