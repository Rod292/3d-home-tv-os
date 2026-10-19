import { rng, type V2, type V3 } from "../parts";
import { type Build, type Ctx, Parts, clamp, darken, lighten, palette, ACCENTS } from "./common";

const SHADE = "#ffdfa0";

/* -------------------------------------------------------------------- lamps */

/** Lathe vase profile normalized to radius 1 / height 1. */
const VASE: V2[] = [
  [0, 0],
  [0.62, 0],
  [0.8, 0.12],
  [1, 0.42],
  [0.9, 0.72],
  [0.45, 0.92],
  [0.38, 1],
  [0, 1],
];

export const lampClassic: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const baseH = h * 0.42;
  const shade0 = h * 0.5;
  const br = Math.min(w, d) * 0.28;
  p.add({ kind: "lathe", pts: VASE, seg: 16 }, [0, 0, 0], color, { scale: [br, baseH, br] });
  p.cyl(0, 0, baseH - 0.005, shade0 + 0.02, 0.008, 0.008, palette.steel, { seg: 6 });
  p.cyl(0, 0, shade0, h, w / 2, d / 2, SHADE, { seg: 20, taper: 0.68, role: "glow" });
  return p;
};

export const lampGlobe: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const baseH = clamp(h * 0.18, 0.03, 0.12);
  p.cyl(0, 0, 0, baseH, (w / 2) * 0.55, (d / 2) * 0.55, color, { seg: 16, taper: 0.8 });
  p.sphere([0, baseH + (h - baseH) / 2, 0], [w / 2, (h - baseH) / 2, d / 2], SHADE, { seg: 16, role: "glow" });
  return p;
};

/** Glass "donut" lamp (IKEA VARMBLIXT style): a glowing torus standing on a small foot, facing +Z. */
export const lampDonut: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const footH = clamp(h * 0.06, 0.01, 0.03);
  const Ro = Math.min(w, h - footH) / 2; // outer radius
  const r = Math.min(Ro * 0.42, d / 2); // tube radius
  const cy = footH + (h - footH) / 2;
  // Stretched sideways when the box is wider than tall, so the ring always fills its width.
  p.add({ kind: "torus", R: Ro - r, r, seg: 32 }, [0, cy, 0], color, { role: "glow", scale: [w / 2 / Ro, 1, 1] });
  p.rbox([-Ro * 0.45, 0, -d / 2], [Ro * 0.45, footH, d / 2], darken(color, 0.45), Math.min(0.006, footH / 2), { seg: 1 });
  p.box([-Ro * 0.08, footH, -r * 0.4], [Ro * 0.08, cy - Ro + r * 0.6, r * 0.4], darken(color, 0.45));
  return p;
};

/** Wall-mounted VARMBLIXT: the same glass ring, no foot, held off the wall (-Z) by a small plate. */
export const lampDonutWall: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const Ro = Math.min(w, h) / 2;
  const plate = Math.min(0.012, d * 0.15);
  const r = Math.min(Ro * 0.42, (d - plate) / 2);
  const cy = h / 2;
  p.add({ kind: "torus", R: Ro - r, r, seg: 32 }, [0, cy, -d / 2 + plate + r], color, { role: "glow", scale: [w / 2 / Ro, 1, 1] });
  p.rbox([-Ro * 0.22, cy - Ro * 0.22, -d / 2], [Ro * 0.22, cy + Ro * 0.22, -d / 2 + plate], darken(color, 0.45), plate / 3, { seg: 1 });
  return p;
};

export const lampMushroom: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const domeH = h * 0.42;
  const stemR = Math.min(w, d) * 0.12;
  p.cyl(0, 0, 0, h * 0.05, (w / 2) * 0.55, (d / 2) * 0.55, darken(color, 0.1), { seg: 18 });
  p.cyl(0, 0, h * 0.05, h - domeH + 0.01, stemR, stemR * (d / w), color, { seg: 12, taper: 0.8 });
  // dome: lathe quarter circle
  const pts: V2[] = [[0, 0]];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  p.add({ kind: "lathe", pts, seg: 20 }, [0, h - domeH, 0], color, {
    scale: [w / 2, domeH, d / 2],
  });
  p.cyl(0, 0, h - domeH - 0.012, h - domeH + 0.001, (w / 2) * 0.8, (d / 2) * 0.8, SHADE, { seg: 20, role: "glow" });
  return p;
};

export const floorLampDrum: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const shadeH = clamp(h * 0.22, 0.15, 0.42);
  const br = Math.min(w, d) * 0.36;
  p.cyl(0, 0, 0, 0.03, br, br, darken(color, 0.15), { seg: 20, taper: 0.85 });
  p.cyl(0, 0, 0.03, h - shadeH * 0.4, 0.012, 0.012, color, { seg: 8 });
  p.cyl(0, 0, h - shadeH, h, w / 2, d / 2, SHADE, { seg: 24, taper: 0.9, role: "glow" });
  return p;
};

/**
 * IKEA EVEDAL floor lamp: black marble disc, light ash pole, and a smoky grey glass bell (flat top,
 * rounded shoulder, straight sides) nesting an opal white bell of the same shape — its lit rim shows
 * under the grey one. The grey glass is drawn opaque: the transparent glass role would let only the
 * white inner part read.
 */
export const floorLampEvedal: Build = (c) => {
  const p = new Parts();
  const { w, h, d } = c;
  const R = Math.min(w, d) / 2;
  const WOOD = "#d2ab80";
  const MARBLE = "#2a2b2e";
  const SMOKE = "#7f8986";
  const METAL = "#45484b";
  const baseH = clamp(h * 0.024, 0.025, 0.04);
  const shadeH = clamp(h * 0.12, 0.12, 0.22);
  const shadeR = R * 0.94;
  const shadeY = h - shadeH;
  const poleR = clamp(R * 0.08, 0.01, 0.016);
  // The disc fills the footprint (round for a square box, as the real lamp).
  p.cyl(0, 0, 0, baseH, w / 2, d / 2, MARBLE, { seg: 40, taper: 0.97 });
  p.cyl(0, 0, baseH, baseH + 0.02, poleR * 1.8, poleR * 1.8, WOOD, { seg: 16, taper: 0.75 });
  p.cyl(0, 0, baseH + 0.02, shadeY + shadeH * 0.3, poleR, poleR, WOOD, { seg: 12 });
  p.cyl(0, 0, shadeY + shadeH * 0.2, shadeY + shadeH * 0.35, poleR * 2.2, poleR * 2.2, METAL, { seg: 16 });
  // Bell profile (unit radius / height): straight sides, quarter-round shoulder, flat top.
  const bell = (shoulder: number): V2[] => {
    const pts: V2[] = [
      [1, 0],
      [1, 1 - shoulder],
    ];
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      pts.push([1 - shoulder + shoulder * Math.cos(a), 1 - shoulder + shoulder * Math.sin(a)]);
    }
    pts.push([0, 1]);
    return pts;
  };
  p.add({ kind: "lathe", pts: bell(0.42), seg: 40 }, [0, shadeY, 0], SMOKE, { scale: [shadeR, shadeH, shadeR] });
  // Opal bell inside, a little lower so its rim shows under the grey glass; plus its lit bottom edge.
  const inner = shadeR * 0.88;
  p.add({ kind: "lathe", pts: bell(0.45), seg: 40 }, [0, shadeY - shadeH * 0.08, 0], "#fbf6ec", { role: "glow", scale: [inner, shadeH * 0.9, inner] });
  p.cyl(0, 0, shadeY - shadeH * 0.08, shadeY - shadeH * 0.04, inner, inner, "#fbf6ec", { seg: 40, role: "glow" });
  // Pull cord with its wooden bead.
  p.cyl(poleR * 2.6, 0, shadeY - 0.12, shadeY + shadeH * 0.2, 0.002, 0.002, "#b9b9b9", { seg: 4 });
  p.sphere([poleR * 2.6, shadeY - 0.125, 0], [0.006, 0.009, 0.006], WOOD, { seg: 8 });
  return p;
};

export const floorLampArc: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const br = Math.min(d / 2, 0.18, w * 0.2);
  const bx = -w / 2 + br;
  const rs = Math.min(d / 2, w * 0.22);
  const sx = w / 2 - rs;
  const tube = 0.014;
  const baseH = 0.05;
  p.cyl(bx, 0, 0, baseH, br, br, palette.stone, { seg: 20 });
  // arc: vertical, then a half-ellipse over to the shade
  const shadeH = Math.min(rs * 0.9, h * 0.22);
  const shadeTop = h - Math.min(h * 0.18, 0.35);
  const R = (sx - bx) / 2;
  const cx = bx + R;
  const ry = Math.min(R * 0.8, h * 0.3);
  const yc = h - tube - ry;
  const path: V3[] = [[bx, baseH, 0], [bx, (baseH + yc) / 2, 0]];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (i / 10) * Math.PI;
    path.push([cx + Math.cos(a) * R, yc + Math.sin(a) * ry, 0]);
  }
  path.push([sx, shadeTop + 0.01, 0]);
  p.add({ kind: "tube", path, r: tube, seg: 6, steps: 28 }, [0, 0, 0], color);
  // dome shade (hemisphere-ish) hanging, glowing rim below
  p.sphere([sx, shadeTop - shadeH * 0.5, 0], [rs, shadeH * 0.5, rs], color, { seg: 16 });
  p.cyl(sx, 0, shadeTop - shadeH * 0.75, shadeTop - shadeH * 0.45, rs * 0.8, rs * 0.8, SHADE, { seg: 16, role: "glow" });
  return p;
};

/* ------------------------------------------------------------------- plants */

const POT: V2[] = [
  [0, 0],
  [0.72, 0],
  [0.92, 0.82],
  [1, 0.84],
  [1, 1],
  [0.86, 1],
  [0.84, 0.92],
  [0, 0.92],
];

function pot(p: Parts, rx: number, rz: number, potH: number, color: string): void {
  p.add({ kind: "lathe", pts: POT, seg: 14 }, [0, 0, 0], color, { scale: [rx, potH, rz] });
  p.cyl(0, 0, potH * 0.86, potH * 0.93, rx * 0.84, rz * 0.84, "#6b4a33", { seg: 14 });
}

export const plantBush: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const potH = clamp(h * 0.32, 0.08, 0.38);
  pot(p, (w / 2) * 0.62, (d / 2) * 0.62, potH, palette.terracotta);
  const y0 = potH * 0.8;
  const H = h - y0;
  const g1 = color;
  const g2 = lighten(color, 0.18);
  const g3 = darken(color, 0.15);
  const sx = (w / 2) * 0.48;
  const sz = (d / 2) * 0.48;
  const sy = H * 0.3;
  const yMid = y0 + H * 0.42;
  p.blob([w / 2 - sx, yMid, 0], [sx, sy, sz * 1.1], g3, { role: "toon" });
  p.blob([-w / 2 + sx, yMid + H * 0.04, 0], [sx, sy, sz * 1.1], g1);
  p.blob([0, yMid - H * 0.02, d / 2 - sz], [sx * 1.1, sy, sz], g2);
  p.blob([0, yMid + H * 0.06, -d / 2 + sz], [sx * 1.1, sy, sz], g1);
  const ty = H * 0.34;
  p.blob([0, h - ty, 0], [(w / 2) * 0.62, ty, (d / 2) * 0.62], g2);
  p.blob([0, y0 + H * 0.3, 0], [(w / 2) * 0.6, H * 0.3, (d / 2) * 0.6], g3);
  return p;
};

export const plantLeafy: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color, seed } = c;
  const potH = clamp(h * 0.3, 0.08, 0.4);
  const prx = (Math.min(w, d) / 2) * 0.5;
  pot(p, prx, prx, potH, palette.cream);
  const rand = rng(seed + 3);
  const n = 9;
  const stem = darken(color, 0.3);
  const soil = potH * 0.9;
  for (let i = 0; i < n; i++) {
    // the four axis-aligned leaves define the footprint exactly
    const axis = i < 4;
    const a = axis ? (i * Math.PI) / 2 : (i - 4 + 0.5) * ((Math.PI * 2) / (n - 4)) + rand() * 0.3;
    const ca = Math.abs(Math.cos(a));
    const sa = Math.abs(Math.sin(a));
    const fit = Math.min(w / 2 / (ca + 0.3 * sa), d / 2 / (sa + 0.3 * ca));
    const R = axis ? (i % 2 === 0 ? w / 2 : d / 2) : fit * (0.65 + rand() * 0.3);
    const len = R * 0.55;
    const width = len * 0.5;
    const leafY = i === 4 ? h - 0.012 : potH + (h - potH) * (axis ? 0.3 + (i % 2) * 0.2 : 0.5 + rand() * 0.35);
    const bx = Math.cos(a) * (R - len);
    const bz = Math.sin(a) * (R - len);
    p.add(
      { kind: "tube", path: [[0, soil, 0], [bx * 0.25, (soil + leafY) * 0.55, bz * 0.25], [bx * 0.6, leafY - 0.005, bz * 0.6]], r: 0.007, seg: 4, steps: 4 },
      [0, 0, 0],
      stem,
    );
    p.blob([bx, leafY, bz], [len, 0.012, width], i % 3 === 0 ? lighten(color, 0.15) : i % 3 === 1 ? color : darken(color, 0.1), { rot: [0, -a, 0] });
  }
  return p;
};

export const plantCactus: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const potH = clamp(h * 0.25, 0.06, 0.3);
  pot(p, w / 2, d / 2, potH, palette.terracotta);
  const r = Math.min(w, d) * 0.2;
  const top = h - r;
  p.cyl(0, 0, potH * 0.9, top, r, r, color, { seg: 10 });
  p.sphere([0, top, 0], [r, r, r], color, { seg: 12 });
  // arms
  const armR = r * 0.65;
  for (const s of [-1, 1]) {
    const ax = s * Math.min(w / 2 - armR, r + armR * 1.8);
    const ay0 = potH + (h - potH) * (s > 0 ? 0.35 : 0.5);
    const ay1 = Math.min(top - r * 0.5, ay0 + (h - potH) * 0.3);
    p.cylX(Math.min(0, ax), Math.max(0, ax), ay0, 0, armR, color, { seg: 8 });
    p.cyl(ax, 0, ay0, ay1, armR, armR, color, { seg: 8 });
    p.sphere([ax, ay1, 0], [armR, armR, armR], color, { seg: 8 });
  }
  // a little flower
  p.sphere([0, h - r * 0.25, 0], [r * 0.35, r * 0.25, r * 0.35], palette.blush, { seg: 8 });
  return p;
};

export const plantTree: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const potH = clamp(h * 0.2, 0.1, 0.4);
  const prx = Math.min(w, d) / 2 * 0.55;
  pot(p, prx, prx, potH, palette.slate);
  const crown0 = h * 0.45;
  p.cyl(0, 0, potH * 0.9, crown0 + 0.1, 0.03, 0.03, palette.woodDark, { seg: 7, taper: 0.7 });
  const H = h - crown0;
  const sx = (w / 2) * 0.5;
  const sz = (d / 2) * 0.5;
  p.blob([w / 2 - sx, crown0 + H * 0.4, 0], [sx, H * 0.28, sz], darken(color, 0.1));
  p.blob([-w / 2 + sx, crown0 + H * 0.45, 0], [sx, H * 0.28, sz], color);
  p.blob([0, crown0 + H * 0.35, d / 2 - sz], [sx, H * 0.28, sz], lighten(color, 0.12));
  p.blob([0, crown0 + H * 0.5, -d / 2 + sz], [sx, H * 0.28, sz], color);
  p.blob([0, h - H * 0.3, 0], [(w / 2) * 0.6, H * 0.3, (d / 2) * 0.6], lighten(color, 0.15));
  p.blob([0, crown0 + H * 0.28, 0], [(w / 2) * 0.55, H * 0.28, (d / 2) * 0.55], darken(color, 0.12));
  return p;
};

/* --------------------------------------------------------------------- rugs */

export const rugRect: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const b = clamp(Math.min(w, d) * 0.07, 0.04, 0.14);
  // stacked layers (no coplanar faces): border < field < inner pattern
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h * 0.6, d / 2], darken(color, 0.25), Math.min(0.02, h * 0.3), { seg: 1 });
  p.box([-w / 2 + b, 0, -d / 2 + b], [w / 2 - b, h * 0.8, d / 2 - b], color);
  const b2 = b * 2.2;
  if (w > 3 * b2 && d > 3 * b2) {
    p.box([-w / 2 + b2, 0, -d / 2 + b2], [w / 2 - b2, h, d / 2 - b2], lighten(color, 0.22));
    p.box([-w / 2 + b2 * 1.5, 0, -d / 2 + b2 * 1.5], [w / 2 - b2 * 1.5, h * 0.9, d / 2 - b2 * 1.5], color);
  } else {
    p.box([-w / 2 + b * 1.5, 0, -0.02], [w / 2 - b * 1.5, h, 0.02], lighten(color, 0.22));
  }
  return p;
};

export const rugRound: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  p.cyl(0, 0, 0, h * 0.7, w / 2, d / 2, darken(color, 0.22), { seg: 40 });
  p.cyl(0, 0, 0, h * 0.9, w / 2 - 0.05, d / 2 - 0.05, color, { seg: 40 });
  p.cyl(0, 0, 0, h, (w / 2) * 0.55, (d / 2) * 0.55, lighten(color, 0.28), { seg: 32 });
  p.cyl(0, 0, 0, h * 0.95, (w / 2) * 0.62, (d / 2) * 0.62, color, { seg: 32 });
  return p;
};

export const rugStriped: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h * 0.8, d / 2], palette.cream, Math.min(0.02, h * 0.3), { seg: 1 });
  const n = clamp(Math.round(w / 0.25), 3, 16);
  const sw = w / n;
  for (let i = 0; i < n - 1; i += 2) {
    const x0 = -w / 2 + i * sw + sw * 0.5;
    p.box([x0, 0, -d / 2 + 0.02], [x0 + sw * 0.6, h, d / 2 - 0.02], i % 4 === 0 ? color : lighten(color, 0.35));
  }
  return p;
};

/* --------------------------------------------------------- artwork / mirror */

function frame(p: Parts, c: Ctx, bw: number, color: string): { x0: number; x1: number; y0: number; y1: number; zBack: number; zFront: number } {
  const { w, h, d } = c;
  p.rbox([-w / 2, 0, -d / 2], [-w / 2 + bw, h, d / 2], color, 0.006, { seg: 1 });
  p.rbox([w / 2 - bw, 0, -d / 2], [w / 2, h, d / 2], color, 0.006, { seg: 1 });
  p.rbox([-w / 2 + bw - 0.002, h - bw, -d / 2], [w / 2 - bw + 0.002, h, d / 2], color, 0.006, { seg: 1 });
  p.rbox([-w / 2 + bw - 0.002, 0, -d / 2], [w / 2 - bw + 0.002, bw, d / 2], color, 0.006, { seg: 1 });
  const zBack = -d / 2 + d * 0.35;
  p.box([-w / 2 + bw, bw, -d / 2], [w / 2 - bw, h - bw, zBack], palette.offWhite);
  return { x0: -w / 2 + bw, x1: w / 2 - bw, y0: bw, y1: h - bw, zBack, zFront: d / 2 };
}

export const artworkAbstract: Build = (c) => {
  const p = new Parts();
  const bw = clamp(Math.min(c.w, c.h) * 0.06, 0.015, 0.05);
  const f = frame(p, c, bw, c.color);
  const rand = rng(c.seed + 11);
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const z0 = f.zBack;
  const t = Math.min(0.004, (f.zFront - f.zBack) * 0.3);
  const cols = [palette.terracotta, palette.mustard, palette.sage, palette.slate, palette.blush];
  const k = Math.floor(rand() * cols.length);
  // big circle
  const r = Math.min(W, H) * (0.22 + rand() * 0.08);
  p.cylZ(f.x0 + W * (0.35 + rand() * 0.3), f.y0 + H * (0.55 + rand() * 0.1), z0, z0 + t, r, r, cols[k] ?? palette.terracotta, { seg: 24 });
  // block
  p.box([f.x0 + W * 0.1, f.y0 + H * 0.1, z0], [f.x0 + W * (0.45 + rand() * 0.2), f.y0 + H * 0.35, z0 + t * 1.5], cols[(k + 2) % cols.length] ?? palette.sage);
  // thin line
  p.box([f.x0 + W * 0.55, f.y0 + H * 0.15, z0], [f.x0 + W * 0.58, f.y0 + H * 0.85, z0 + t * 2], palette.charcoal);
  return p;
};

/**
 * Framed photo: thin frame, optional white mat (attrs.mat = "1"), and a picture surface (role
 * "screen") on which FurnitureModel lays `attributes.image` — a real photo of the user's print.
 */
export const artworkPhoto: Build = (c) => {
  const p = new Parts();
  const bw = clamp(Math.min(c.w, c.h) * 0.035, 0.01, 0.025);
  const f = frame(p, c, bw, c.color);
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const z0 = f.zBack;
  const matW = c.attrs.mat === "1" ? Math.min(W, H) * 0.12 : 0;
  if (matW > 0) p.box([f.x0, f.y0, z0], [f.x1, f.y1, z0 + 0.001], "#f6f3ec");
  p.box([f.x0 + matW, f.y0 + matW, z0 + 0.001], [f.x1 - matW, f.y1 - matW, z0 + 0.003], "#9aa3ad", { role: "screen" });
  return p;
};

export const artworkLandscape: Build = (c) => {
  const p = new Parts();
  const bw = clamp(Math.min(c.w, c.h) * 0.06, 0.015, 0.05);
  const f = frame(p, c, bw, c.color);
  const W = f.x1 - f.x0;
  const H = f.y1 - f.y0;
  const z0 = f.zBack;
  const t = Math.min(0.004, (f.zFront - f.zBack) * 0.3);
  p.box([f.x0, f.y0, z0], [f.x1, f.y1, z0 + 0.0015], "#cfe6ee");
  p.cylZ(f.x0 + W * 0.7, f.y0 + H * 0.68, z0, z0 + t, Math.min(W, H) * 0.12, Math.min(W, H) * 0.12, palette.mustard, { seg: 20 });
  const hill = (pts: V2[], color: string, dz: number) =>
    p.add({ kind: "prism", pts, depth: t }, [0, 0, z0 + dz + t / 2], color);
  hill(
    [
      [f.x0, f.y0],
      [f.x1, f.y0],
      [f.x1, f.y0 + H * 0.3],
      [f.x0 + W * 0.65, f.y0 + H * 0.55],
      [f.x0 + W * 0.3, f.y0 + H * 0.35],
      [f.x0, f.y0 + H * 0.45],
    ],
    palette.sage,
    0.0005,
  );
  hill(
    [
      [f.x0, f.y0],
      [f.x1, f.y0],
      [f.x1, f.y0 + H * 0.18],
      [f.x0 + W * 0.45, f.y0 + H * 0.28],
      [f.x0, f.y0 + H * 0.15],
    ],
    palette.sageDark,
    t,
  );
  return p;
};

const MIRROR = "#d6e8ee";

export const mirrorRect: Build = (c) => {
  const p = new Parts();
  const { w, h, d } = c;
  const bw = clamp(Math.min(w, h) * 0.05, 0.015, 0.05);
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.004], c.color, Math.min(0.012, d / 3), { seg: 2 });
  p.box([-w / 2 + bw, bw, -d / 2], [w / 2 - bw, h - bw, d / 2], MIRROR, { role: "mirror" });
  // two diagonal glints
  const W = w - 2 * bw;
  const H = h - 2 * bw;
  const L = Math.min(W, H) * 0.35;
  for (const [fx, fy, k] of [
    [0.3, 0.7, 1],
    [0.42, 0.62, 0.6],
  ] as const)
    p.add({ kind: "box", size: [L * k, Math.min(0.025, H * 0.04), 0.002] }, [-w / 2 + bw + W * fx, bw + H * fy, d / 2 - 0.001], "#ffffff", {
      rot: [0, 0, Math.PI / 4],
      role: "mirror",
    });
  return p;
};

export const mirrorRound: Build = (c) => {
  const p = new Parts();
  const { w, h, d } = c;
  const bw = clamp(Math.min(w, h) * 0.05, 0.015, 0.05);
  p.cylZ(0, h / 2, -d / 2, d / 2 - 0.004, w / 2, h / 2, c.color, { seg: 32 });
  p.cylZ(0, h / 2, -d / 2 + 0.002, d / 2, w / 2 - bw, h / 2 - bw, MIRROR, { seg: 32, role: "mirror" });
  const L = Math.min(w, h) * 0.3;
  p.add({ kind: "box", size: [L, Math.min(0.025, h * 0.04), 0.002] }, [-w * 0.12, h * 0.62, d / 2 + 0.0005], "#ffffff", { rot: [0, 0, Math.PI / 4], role: "mirror" });
  return p;
};

/* --------------------------------------------------------------- television */

export const television: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const pt = Math.max(0.006, Math.min(0.045, d - 0.004));
  const hasStand = d >= 0.1 && h > 0.25;
  const standH = hasStand ? clamp(h * 0.09, 0.04, 0.09) : 0;
  const pz = hasStand ? 0 : -d / 2 + pt / 2;
  if (hasStand) {
    p.rbox([-Math.min(w * 0.22, 0.35), 0, -d / 2], [Math.min(w * 0.22, 0.35), 0.018, d / 2], color, 0.008, { seg: 1 });
    p.box([-0.03, 0.015, pz - pt / 2 - 0.0], [0.03, standH + 0.02, pz - pt / 2 + 0.015], color);
  } else if (d > pt + 0.005) {
    // wall bracket
    p.box([-0.1, h * 0.3, -d / 2 + pt], [0.1, h * 0.6, d / 2], darken(color, 0.2));
  }
  const z0 = hasStand ? pz - pt / 2 : -d / 2;
  const z1 = z0 + pt;
  p.rbox([-w / 2, standH, z0], [w / 2, h, z1], color, Math.min(0.012, pt / 2), { seg: 2 });
  const bez = clamp(Math.min(w, h) * 0.02, 0.008, 0.025);
  const zs = Math.min(z1 + 0.003, d / 2);
  p.box([-w / 2 + bez, standH + bez * 1.6, z1 - 0.004], [w / 2 - bez, h - bez, zs], "#2b3d58", { role: "screen" });
  // soft reflection band
  p.add({ kind: "box", size: [Math.min(w, h) * 0.5, (h - standH) * 0.05, 0.001] }, [-w * 0.22, standH + (h - standH) * 0.72, zs + 0.0005 > d / 2 ? zs - 0.0005 : zs + 0.0005], "#4d6a8f", {
    rot: [0, 0, Math.PI / 5],
    role: "screen",
  });
  return p;
};

/* ---------------------------------------------------------------- fireplace */

export const fireplace: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const hearthH = clamp(h * 0.05, 0.03, 0.07);
  const shelfT = clamp(h * 0.06, 0.04, 0.08);
  const front = d / 2 - clamp(d * 0.12, 0.03, 0.08);
  const sideW = clamp(w * 0.18, 0.12, 0.3);
  const ow = w - 0.04 * 2 - sideW * 2;
  const oh = Math.min((h - hearthH - shelfT) * 0.65, ow * 0.9);
  const inner = darken(color, 0.75);
  p.rbox([-w / 2, 0, -d / 2], [w / 2, hearthH, d / 2], darken(color, 0.25), 0.01, { seg: 1 });
  p.rbox([-w / 2, h - shelfT, -d / 2], [w / 2, h, d / 2], palette.wood, 0.012, { seg: 2 });
  // surround: two pillars + lintel + dark firebox
  const x0 = -w / 2 + 0.04;
  const x1 = w / 2 - 0.04;
  p.rbox([x0, hearthH, -d / 2], [x0 + sideW, h - shelfT, front], color, 0.01, { seg: 1 });
  p.rbox([x1 - sideW, hearthH, -d / 2], [x1, h - shelfT, front], color, 0.01, { seg: 1 });
  p.rbox([-ow / 2 - 0.01, hearthH + oh, -d / 2], [ow / 2 + 0.01, h - shelfT, front], color, 0.01, { seg: 1 });
  p.box([-ow / 2, hearthH, -d / 2], [ow / 2, hearthH + oh, -d / 2 + (front + d / 2) * 0.35], inner);
  p.box([-ow / 2, hearthH + oh - 0.02, -d / 2], [ow / 2, hearthH + oh, front - 0.02], inner);
  // logs + flames
  const lz = -d / 2 + (front + d / 2) * 0.55;
  const lr = Math.min(0.045, oh * 0.12);
  p.cylX(-ow * 0.35, ow * 0.3, hearthH + lr, lz, lr, palette.woodDark, { seg: 8 });
  p.cylX(-ow * 0.25, ow * 0.38, hearthH + lr * 2.6, lz - lr * 0.4, lr * 0.9, palette.wood, { seg: 8 });
  const fh = oh * 0.5;
  p.cyl(-ow * 0.1, lz, hearthH + lr, hearthH + lr + fh, ow * 0.12, lr * 1.6, palette.terracotta, { taper: 0, seg: 8, role: "glow" });
  p.cyl(ow * 0.12, lz, hearthH + lr, hearthH + lr + fh * 0.75, ow * 0.09, lr * 1.4, "#f2a65a", { taper: 0, seg: 8, role: "glow" });
  p.cyl(0, lz + lr * 0.5, hearthH + lr, hearthH + lr + fh * 0.5, ow * 0.07, lr, palette.glow, { taper: 0, seg: 8, role: "glow" });
  // a little decor on the mantel? (keeps inside the box: no)
  return p;
};

/* ------------------------------------------------------------------- stairs */

export const stairs: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const n = clamp(Math.round(h / 0.18), 2, 24);
  const rise = h / n;
  const run = d / n;
  const sw = clamp(w * 0.04, 0.03, 0.06);
  const riser = palette.offWhite;
  const nose = Math.min(0.025, rise * 0.25);
  for (let i = 0; i < n; i++) {
    const z1 = d / 2 - i * run;
    const z0 = d / 2 - (i + 1) * run;
    const top = (i + 1) * rise;
    p.box([-w / 2 + sw, i * rise, z0], [w / 2 - sw, top - nose, i === n - 1 ? z1 : z1 - 0.01], riser);
    p.rbox([-w / 2 + sw, top - nose, z0], [w / 2 - sw, top, z1], color, Math.min(0.008, nose / 2), { seg: 1 });
  }
  // stringers (sloped side panels), profile in the ZY plane
  const off = Math.min(0.06, rise * 0.5);
  const zh = -d / 2 + run + (off * run) / rise;
  const prof: V2[] = [
    [d / 2, 0],
    [d / 2, rise + off],
    [Math.max(zh, -d / 2), h],
    [-d / 2, h],
    [-d / 2, 0],
  ];
  for (const s of [-1, 1]) {
    p.add({ kind: "prism", pts: prof.map(([z, y]) => [-z, y] as V2), depth: sw }, [s * (w / 2 - sw / 2), 0, 0], palette.offWhite, {
      rot: [0, Math.PI / 2, 0],
    });
  }
  return p;
};

export { ACCENTS };
