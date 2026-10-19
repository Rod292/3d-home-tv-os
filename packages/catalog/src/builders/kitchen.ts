import { mix } from "../color";
import { type Build, type Ctx, Parts, clamp, darken, lighten, palette, fronts, colsFor } from "./common";

const SCREEN = "#2c3e55";
const GLASS_DARK = "#33404d";

export const refrigerator: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const hd = 0.03;
  const ft = 0.03;
  const zf = d / 2 - hd - ft;
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h, zf + 0.002], darken(color, 0.06), 0.03, { seg: 2 });
  const door = lighten(color, 0.05);
  const handle = palette.steel;
  const g = 0.012;
  if (w >= 0.8) {
    // side by side
    const mid = 0;
    p.rbox([-w / 2 + 0.01, 0.04, zf], [mid - g / 2, h - 0.01, zf + ft], door, 0.02, { seg: 2 });
    p.rbox([mid + g / 2, 0.04, zf], [w / 2 - 0.01, h - 0.01, zf + ft], door, 0.02, { seg: 2 });
    const hl = clamp(h * 0.35, 0.2, 0.7);
    const hy = clamp(h * 0.55, hl / 2 + 0.05, h - hl / 2 - 0.05);
    for (const sx of [-1, 1]) {
      const x = sx * 0.05;
      p.rbox([x - 0.012, hy - hl / 2, zf + ft], [x + 0.012, hy + hl / 2, zf + ft + hd], handle, 0.008, { seg: 1 });
    }
    // water dispenser
    const dw = Math.min(0.16, w * 0.15);
    p.rbox([-w / 4 - dw / 2, hy - 0.05, zf + ft - 0.004], [-w / 4 + dw / 2, hy + 0.17, zf + ft + 0.004], SCREEN, 0.01, { seg: 1, role: "screen" });
  } else {
    const split = h * 0.36;
    p.rbox([-w / 2 + 0.01, 0.03, zf], [w / 2 - 0.01, split - g / 2, zf + ft], door, 0.02, { seg: 2 });
    p.rbox([-w / 2 + 0.01, split + g / 2, zf], [w / 2 - 0.01, h - 0.01, zf + ft], door, 0.02, { seg: 2 });
    const hx = w / 2 - 0.07;
    const l1 = clamp(split * 0.4, 0.1, 0.3);
    p.rbox([hx - 0.012, split - g - 0.04 - l1, zf + ft], [hx + 0.012, split - g - 0.04, zf + ft + hd], handle, 0.008, { seg: 1 });
    const l2 = clamp((h - split) * 0.3, 0.12, 0.45);
    p.rbox([hx - 0.012, split + g + 0.04, zf + ft], [hx + 0.012, split + g + 0.04 + l2, zf + ft + hd], handle, 0.008, { seg: 1 });
  }
  return p;
};

/** Burners on a cooktop surface at height `y` (top of burners = y + 0.01). */
function burners(p: Parts, x0: number, x1: number, z0: number, z1: number, y: number): void {
  const W = x1 - x0;
  const D = z1 - z0;
  const cols = W > 0.75 ? 3 : 2;
  const rows = D > 0.3 ? 2 : 1;
  const r = Math.min(W / cols, D / rows) * 0.32;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = x0 + (i + 0.5) * (W / cols);
      const z = z0 + (j + 0.5) * (D / rows);
      const rr = r * (cols === 3 && i === 1 ? 1.15 : (i + j) % 2 === 0 ? 1 : 0.8);
      p.cyl(x, z, y, y + 0.006, rr, rr, "#55575e", { seg: 16 });
      p.cyl(x, z, y + 0.006, y + 0.01, rr * 0.45, rr * 0.45, "#7b7e86", { seg: 12 });
    }
  }
}

/** Oven door with window + bar handle, between y0 and y1 on front plane z. */
function ovenDoor(p: Parts, x0: number, x1: number, y0: number, y1: number, z: number, color: string, hd: number): void {
  p.rbox([x0, y0, z], [x1, y1, z + 0.02], color, 0.01, { seg: 1 });
  const H = y1 - y0;
  p.rbox([x0 + 0.05, y0 + H * 0.15, z + 0.004], [x1 - 0.05, y1 - H * 0.28, z + 0.022], GLASS_DARK, 0.01, { seg: 1, role: "screen" });
  p.rbox([x0 + 0.06, y1 - H * 0.16, z + 0.02], [x1 - 0.06, y1 - H * 0.16 + 0.02, z + 0.02 + hd], palette.steel, 0.008, { seg: 1 });
}

function knobs(p: Parts, x0: number, x1: number, y: number, z: number, n: number, color: string): void {
  const W = x1 - x0;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * W) / n;
    p.cylZ(x, y, z, z + 0.02, 0.018, 0.018, color, { seg: 10 });
  }
}

export const stove: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (h < 0.3) {
    // cooktop only
    p.rbox([-w / 2, 0, -d / 2], [w / 2, h - 0.01, d / 2], palette.ink, Math.min(0.01, h / 3), { seg: 1 });
    burners(p, -w / 2 + 0.03, w / 2 - 0.03, -d / 2 + 0.03, d / 2 - 0.03, h - 0.01);
    return p;
  }
  const hd = 0.025;
  const zf = d / 2 - hd - 0.02;
  const topT = 0.03;
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h - topT + 0.002, zf + 0.002], color, 0.015, { seg: 1 });
  p.rbox([-w / 2, h - topT, -d / 2], [w / 2, h - 0.01, d / 2 - 0.005], palette.ink, 0.008, { seg: 1 });
  burners(p, -w / 2 + 0.04, w / 2 - 0.04, -d / 2 + 0.05, d / 2 - 0.05, h - 0.01);
  // control strip + oven door
  const stripH = clamp(h * 0.1, 0.05, 0.1);
  const strip0 = h - topT - stripH;
  p.box([-w / 2 + 0.02, strip0, zf], [w / 2 - 0.02, h - topT - 0.005, zf + 0.012], darken(color, 0.15));
  knobs(p, -w / 2 + 0.06, w / 2 - 0.06, strip0 + stripH / 2, zf + 0.012, w > 0.75 ? 5 : 4, palette.charcoal);
  ovenDoor(p, -w / 2 + 0.02, w / 2 - 0.02, clamp(h * 0.1, 0.06, 0.12), strip0 - 0.015, zf, lighten(color, 0.05), hd);
  return p;
};

export const oven: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const hd = 0.025;
  const zf = d / 2 - hd - 0.02;
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h, zf + 0.002], darken(color, 0.1), 0.015, { seg: 1 });
  const unit = (y0: number, y1: number) => {
    const H = y1 - y0;
    const stripH = clamp(H * 0.15, 0.05, 0.1);
    p.box([-w / 2 + 0.02, y1 - stripH, zf], [w / 2 - 0.02, y1 - 0.01, zf + 0.012], palette.charcoal);
    p.rbox([-0.06, y1 - stripH * 0.8, zf + 0.006], [0.06, y1 - stripH * 0.25, zf + 0.016], SCREEN, 0.004, { seg: 1, role: "screen" });
    knobs(p, -w / 2 + 0.04, -0.1, y1 - stripH / 2, zf + 0.012, 1, palette.steel);
    knobs(p, 0.1, w / 2 - 0.04, y1 - stripH / 2, zf + 0.012, 1, palette.steel);
    ovenDoor(p, -w / 2 + 0.02, w / 2 - 0.02, y0 + 0.02, y1 - stripH - 0.01, zf, color, hd);
  };
  if (h > 1.1) {
    // tall column: housing doors below / above, two units in the middle
    const base = clamp(h * 0.25, 0.2, 0.7);
    const u = Math.min(0.6, (h - base) * 0.4);
    fronts(p, { x0: -w / 2 + 0.01, x1: w / 2 - 0.01, y0: 0.01, y1: base, z: zf, cols: 1, rows: [{ weight: 1, kind: "door" }], color: palette.cream, handleColor: palette.steel, handle: "long", hd });
    unit(base, base + u);
    unit(base + u, base + 2 * u);
    if (h - (base + 2 * u) > 0.1)
      fronts(p, { x0: -w / 2 + 0.01, x1: w / 2 - 0.01, y0: base + 2 * u + 0.005, y1: h - 0.01, z: zf, cols: 1, rows: [{ weight: 1, kind: "door" }], color: palette.cream, handleColor: palette.steel, handle: "long", hd });
  } else {
    unit(0, h);
  }
  return p;
};

export const dishwasher: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const hd = 0.025;
  const zf = d / 2 - hd - 0.02;
  p.box([-w / 2 + 0.01, 0, -d / 2 + 0.02], [w / 2 - 0.01, 0.08, zf - 0.04], palette.charcoal);
  p.rbox([-w / 2, 0.07, -d / 2], [w / 2, h, zf + 0.002], darken(color, 0.08), 0.012, { seg: 1 });
  p.rbox([-w / 2 + 0.008, 0.09, zf], [w / 2 - 0.008, h - 0.01, zf + 0.02], color, 0.01, { seg: 1 });
  const stripH = clamp(h * 0.1, 0.05, 0.09);
  p.box([-w / 2 + 0.02, h - stripH - 0.01, zf + 0.02], [w / 2 - 0.02, h - 0.015, zf + 0.024], palette.charcoal);
  p.rbox([w / 2 - 0.16, h - stripH * 0.85, zf + 0.022], [w / 2 - 0.05, h - stripH * 0.3, zf + 0.028], "#7fd6a6", 0.003, { seg: 1, role: "screen" });
  p.rbox([-w / 2 + 0.08, h - stripH - 0.06, zf + 0.02], [w / 2 - 0.08, h - stripH - 0.04, zf + 0.02 + hd], palette.steel, 0.008, { seg: 1 });
  return p;
};

/* -------------------------------------------------------------------- sinks */

/** Faucet: vertical column at (x, z) from y0 to top, spout reaching forward (+Z). */
function faucet(p: Parts, x: number, z: number, y0: number, top: number, reach: number): void {
  const r = 0.014;
  p.cyl(x, z, y0, y0 + 0.015, 0.03, 0.03, palette.steel, { seg: 10 });
  p.cyl(x, z, y0, top - r, r, r, palette.steel, { seg: 8 });
  p.cylZ(x, top - r, z - r, z + reach, r, r, palette.steel, { seg: 8 });
  p.cyl(x, z + reach - r, top - r * 2 - 0.03, top - r, r * 1.1, r * 1.1, palette.steel, { seg: 8 });
}

/** Hollow basin (ring walls + floor + drain) with its base at y0 and top at y1. */
function basin(p: Parts, cx: number, cz: number, bw: number, bd: number, y0: number, y1: number, color: string, ellipse: boolean, wall = 0.02): void {
  const H = y1 - y0;
  p.add({ kind: "ring", w: bw, d: bd, h: H, wall, r: Math.min(bw, bd) * 0.3, ellipse }, [cx, y0, cz], color);
  const floorT = Math.min(0.02, H * 0.3);
  // cooler, slightly darker interior so the bowl reads against white surroundings
  const innerC = mix(color, "#9fb0b7", 0.32);
  if (ellipse) p.cyl(cx, cz, y0, y0 + floorT, bw / 2 - wall * 0.5, bd / 2 - wall * 0.5, innerC, { seg: 24 });
  else p.add({ kind: "slab", w: bw - wall, d: bd - wall, h: floorT, r: Math.min(bw, bd) * 0.25 }, [cx, y0, cz], innerC);
  if (bw - 2 * wall > 0.02 && bd - 2 * wall > 0.02)
    p.add(
      { kind: "ring", w: bw - 2 * wall - 0.002, d: bd - 2 * wall - 0.002, h: H - 0.003, wall: 0.004, r: Math.max(Math.min(bw, bd) * 0.3 - wall, 0), ellipse },
      [cx, y0, cz],
      mix(color, "#b4c2c8", 0.25),
    );
  const dr = Math.min(0.025, bw * 0.08);
  p.cyl(cx, cz, y0 + floorT, y0 + floorT + 0.003, dr, dr, "#8d939a", { seg: 10 });
}

export const sinkVanity: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (h < 0.4) return sinkBasinOnly(c);
  const vesselH = clamp(h * 0.14, 0.08, 0.14);
  const counterTop = h - vesselH;
  const topT = 0.03;
  const zf = d / 2 - 0.02 - 0.018;
  const legH = clamp(counterTop * 0.15, 0.06, 0.15);
  // legs + cabinet
  for (const [x, z] of [
    [-w / 2 + 0.04, -d / 2 + 0.04],
    [w / 2 - 0.04, -d / 2 + 0.04],
    [-w / 2 + 0.04, zf - 0.03],
    [w / 2 - 0.04, zf - 0.03],
  ] as const)
    p.cyl(x, z, 0, legH + 0.01, 0.018, 0.018, palette.woodDark, { seg: 8, taper: 1.4 });
  p.rbox([-w / 2 + 0.01, legH, -d / 2], [w / 2 - 0.01, counterTop - topT + 0.002, zf], color, 0.01, { seg: 1 });
  fronts(p, {
    x0: -w / 2 + 0.02,
    x1: w / 2 - 0.02,
    y0: legH + 0.01,
    y1: counterTop - topT - 0.006,
    z: zf,
    cols: colsFor(w, 0.45, 4),
    rows: [{ weight: 1, kind: w > 0.9 ? "door" : "drawer" }],
    color: lighten(color, 0.06),
    handleColor: palette.steel,
    handle: "bar",
  });
  p.rbox([-w / 2, counterTop - topT, -d / 2], [w / 2, counterTop, d / 2], palette.stone, 0.008, { seg: 1 });
  // vessel basin(s) + faucet(s)
  const n = w > 1.3 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + ((i + 0.5) * w) / n;
    const bw = Math.min((w / n) * 0.72, 0.55);
    const bd = Math.min(d * 0.62, 0.42);
    const cz = d / 2 - 0.04 - bd / 2;
    basin(p, cx, cz, bw, bd, counterTop, h, palette.porcelain, true, 0.018);
    const fz = Math.max(-d / 2 + 0.035, cz - bd / 2 - 0.04);
    faucet(p, cx, fz, counterTop, h, Math.min(0.12, cz - fz));
  }
  return p;
};

function sinkBasinOnly(c: Ctx): Parts {
  const p = new Parts();
  const { w, h, d } = c;
  const fd = Math.min(0.07, d * 0.2);
  p.rbox([-w / 2, h * 0.5, -d / 2], [w / 2, h * 0.5 + 0.01, -d / 2 + fd], palette.porcelain, 0.004, { seg: 1 });
  basin(p, 0, fd / 2, w, d - fd, 0, h, palette.porcelain, false, 0.03);
  faucet(p, 0, -d / 2 + fd / 2, h * 0.5 + 0.01, h, Math.min(0.1, d * 0.3));
  return p;
}

export const sinkPedestal: Build = (c) => {
  const p = new Parts();
  const { w, h, d } = c;
  if (h < 0.4) return sinkBasinOnly(c);
  const bowlH = clamp(h * 0.2, 0.1, 0.2);
  const top = h - 0.0;
  const b0 = top - bowlH;
  const col = palette.porcelain;
  // pedestal column
  p.cyl(0, -d * 0.08, 0, b0 + 0.02, Math.min(w, d) * 0.16, Math.min(w, d) * 0.14, col, { seg: 14, taper: 1.5 });
  // basin bowl: solid tapered lower part + hollow rim on top
  p.cyl(0, 0, b0, top - bowlH * 0.5, w / 2 - 0.01, d / 2 - 0.01, col, { seg: 24, taper: 1.25 });
  basin(p, 0, 0, w, d, top - bowlH * 0.5, top, col, true, Math.min(0.05, w * 0.08));
  // faucet sits on the wide back rim, below the rim top
  const fz = -d / 2 + Math.min(0.05, d * 0.12);
  p.cyl(0, fz, top - 0.006, top, 0.025, 0.025, palette.steel, { seg: 10 });
  p.cylZ(0, top - 0.012, fz, fz + Math.min(0.1, d * 0.25), 0.012, 0.012, palette.steel, { seg: 8 });
  return p;
};

export const sinkKitchen: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = 0.04;
  const kick = clamp(h * 0.11, 0.05, 0.12);
  const zf = d / 2 - 0.03 - 0.02 - 0.018;
  p.box([-w / 2 + 0.005, 0, -d / 2 + 0.02], [w / 2 - 0.005, kick + 0.005, zf - 0.06], palette.charcoal);
  p.rbox([-w / 2 + 0.003, kick, -d / 2], [w / 2 - 0.003, h - topT + 0.002, zf], darken(color, 0.08), 0.006, { seg: 1 });
  fronts(p, {
    x0: -w / 2 + 0.006,
    x1: w / 2 - 0.006,
    y0: kick + 0.005,
    y1: h - topT - 0.004,
    z: zf,
    cols: colsFor(w, 0.5, 6),
    rows: [{ weight: 1, kind: "door" }],
    color,
    handleColor: palette.steel,
    handle: "long",
  });
  // countertop framed around the basin opening
  const nB = w > 1.0 ? 2 : 1;
  const bw = Math.min(w * 0.75, nB * 0.45 + 0.05);
  const bd = Math.min(d * 0.68, 0.45);
  const bz = -d / 2 + 0.04 + 0.06 + bd / 2;
  const bx = 0;
  const y0 = h - topT;
  const stone = palette.stone;
  p.box([-w / 2, y0, -d / 2], [w / 2, h, bz - bd / 2], stone);
  p.box([-w / 2, y0, bz + bd / 2], [w / 2, h, d / 2], stone);
  p.box([-w / 2, y0, bz - bd / 2], [bx - bw / 2, h, bz + bd / 2], stone);
  p.box([bx + bw / 2, y0, bz - bd / 2], [w / 2, h, bz + bd / 2], stone);
  const depth = Math.min(0.18, h - topT - kick - 0.05);
  const each = (bw - (nB - 1) * 0.03) / nB;
  for (let i = 0; i < nB; i++) {
    const cx = bx - bw / 2 + each / 2 + i * (each + 0.03);
    basin(p, cx, bz, each, bd, h - depth, h, palette.steel, false, 0.012);
  }
  if (nB === 2) p.box([bx - 0.015, h - depth, bz - bd / 2], [bx + 0.015, h, bz + bd / 2], palette.steel);
  // low-profile tap (fits under the top plane of the bounding box)
  p.cyl(bx, -d / 2 + 0.06, h - 0.004, h, 0.03, 0.03, palette.steel, { seg: 10 });
  return p;
};

/* ---------------------------------------------------------- washer / dryer */

function washerUnit(p: Parts, c: Ctx, y0: number, y1: number, zf: number): void {
  const { w, color } = c;
  const H = y1 - y0;
  const body = color;
  p.rbox([-w / 2, y0, -c.d / 2], [w / 2, y1, zf + 0.002], body, 0.03, { seg: 2 });
  const panelH = clamp(H * 0.14, 0.06, 0.12);
  p.box([-w / 2 + 0.02, y1 - panelH, zf], [w / 2 - 0.02, y1 - 0.02, zf + 0.01], lighten(color, 0.3));
  p.rbox([-w / 2 + 0.05, y1 - panelH * 0.8, zf + 0.006], [-w / 2 + 0.2, y1 - panelH * 0.4, zf + 0.014], SCREEN, 0.004, { seg: 1, role: "screen" });
  p.cylZ(w / 2 - 0.08, y1 - panelH * 0.55, zf + 0.01, zf + 0.025, 0.025, 0.025, palette.steel, { seg: 12 });
  const doorY = y0 + (H - panelH) * 0.5;
  const R = Math.min(w * 0.3, (H - panelH) * 0.36);
  const tube = clamp(R * 0.14, 0.015, 0.03);
  p.add({ kind: "torus", R, r: tube, seg: 24 }, [0, doorY, zf + 0.03 - tube], palette.steel);
  p.cylZ(0, doorY, zf, zf + 0.03 - tube * 0.5, R - tube * 0.5, R - tube * 0.5, GLASS_DARK, { seg: 24, role: "screen" });
}

export const washerDryer: Build = (c) => {
  const p = new Parts();
  const { h, d } = c;
  const zf = d / 2 - 0.03;
  if (h > 1.3) {
    washerUnit(p, c, 0, h / 2, zf);
    washerUnit(p, c, h / 2, h, zf);
  } else {
    washerUnit(p, c, 0, h, zf);
  }
  return p;
};
