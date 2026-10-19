import { mix } from "../color";
import { type Build, Parts, clamp, darken, lighten, palette } from "./common";

/** Cool porcelain shading: interiors and trims read against white walls / floors. */
const inner = (c: string, t = 0.35) => mix(c, "#aebcc2", t);
const trim = (c: string) => mix(c, "#c9b9a4", 0.35);

const WATER = "#bfe1ea";

export const toilet: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const seatH = Math.min(h * 0.92, clamp(h * 0.52, 0.2, 0.42));
  const tankD = clamp(d * 0.26, 0.1, 0.22);
  // tank at the back
  if (h - seatH > 0.08) {
    p.rbox([-w / 2 + 0.01, seatH - 0.08, -d / 2], [w / 2 - 0.01, h - 0.025, -d / 2 + tankD], color, 0.03, { seg: 2 });
    p.rbox([-w / 2, h - 0.03, -d / 2], [w / 2, h - 0.006, -d / 2 + tankD + 0.008], inner(color, 0.18), 0.01, { seg: 2 });
    p.cyl(0, -d / 2 + tankD / 2, h - 0.006, h, 0.022, 0.022, palette.steel, { seg: 12 });
  }
  // bowl: tapered pedestal + seat ring + water
  const bz0 = -d / 2 + tankD * 0.55;
  const bz1 = d / 2;
  const rz = (bz1 - bz0) / 2;
  const cz = (bz0 + bz1) / 2;
  const rx = Math.min(w / 2, rz * 0.82);
  const top = h - seatH > 0.08 ? seatH : h;
  p.cyl(0, cz - rz * 0.12, 0, top - 0.06, rx * 0.88, rz * 0.82, color, { seg: 20, taper: 1.55 });
  p.add({ kind: "ring", w: rx * 2 * 0.95, d: rz * 2 * 0.95, h: 0.04, wall: rx * 0.3, r: 0, ellipse: true }, [0, top - 0.065, cz], inner(color, 0.4));
  p.cyl(0, cz + rz * 0.05, top - 0.065, top - 0.04, rx * 0.66, rz * 0.66, WATER, { seg: 20 });
  // seat
  p.add({ kind: "ring", w: rx * 2, d: rz * 2, h: 0.03, wall: rx * 0.34, r: 0, ellipse: true }, [0, top - 0.03, cz], trim(color));
  // hinge caps at the back of the seat
  for (const s of [-1, 1]) p.cyl(s * rx * 0.45, cz - rz * 0.92, top - 0.012, top, 0.014, 0.014, palette.steel, { seg: 8 });
  return p;
};

export const bathtubBuiltIn: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const long = w >= d;
  const wall = clamp(Math.min(w, d) * 0.1, 0.05, 0.11);
  p.add({ kind: "ring", w, d, h, wall, r: 0.05, ellipse: false }, [0, 0, 0], color);
  // inner soft basin: floor + a rounder inner rim
  const floorH = clamp(h * 0.18, 0.04, 0.12);
  p.add({ kind: "slab", w: w - wall, d: d - wall, h: floorH, r: 0.06 }, [0, 0, 0], inner(color, 0.3));
  const iw = w - 2 * wall;
  const id = d - 2 * wall;
  p.add({ kind: "ring", w: iw + 0.005, d: id + 0.005, h: h * 0.85 - floorH, wall: 0.03, r: Math.min(iw, id) * 0.35, ellipse: false }, [0, floorH, 0], inner(color, 0.22));
  p.add({ kind: "slab", w: iw * 0.92, d: id * 0.92, h: 0.006, r: Math.min(iw, id) * 0.4 }, [0, floorH, 0], WATER, { role: "glass" });
  // drain + spout at one narrow end
  const endA = long ? -w / 2 + wall : -d / 2 + wall;
  const dx = long ? endA + 0.12 : 0;
  const dz = long ? 0 : endA + 0.12;
  p.cyl(dx, dz, floorH, floorH + 0.004, 0.025, 0.025, palette.steel, { seg: 10 });
  if (long) p.cylX(-w / 2 + wall * 0.4, -w / 2 + wall + 0.08, h - 0.06, 0, 0.016, palette.steel);
  else p.cylZ(0, h - 0.06, -d / 2 + wall * 0.4, -d / 2 + wall + 0.08, 0.016, 0.016, palette.steel);
  // two taps on the rim (flush with the rim top)
  for (const s of [-1, 1]) {
    const tx = long ? -w / 2 + wall / 2 : s * 0.08;
    const tz = long ? s * 0.08 : -d / 2 + wall / 2;
    p.cyl(tx, tz, h - 0.002, h, 0.02, 0.02, palette.steel, { seg: 10 });
  }
  return p;
};

export const bathtubFreestanding: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const footH = clamp(h * 0.12, 0.04, 0.09);
  const wall = clamp(Math.min(w, d) * 0.07, 0.035, 0.07);
  // tapered outer shell (solid lower part) + hollow rim
  const mid = footH + (h - footH) * 0.35;
  p.cyl(0, 0, footH, mid + 0.01, w / 2 - 0.02, d / 2 - 0.02, color, { seg: 32, taper: 1.12 });
  p.add({ kind: "ring", w, d, h: h - mid, wall, r: 0, ellipse: true }, [0, mid, 0], color);
  p.cyl(0, 0, mid + 0.01, mid + 0.016, w / 2 - wall - 0.01, d / 2 - wall - 0.01, WATER, { seg: 32, role: "glass" });
  p.cyl(0, 0, mid + 0.01, mid + 0.014, w / 2 - wall, d / 2 - wall, inner(color, 0.3), { seg: 32 });
  p.add({ kind: "ring", w: w - 2 * wall - 0.002, d: d - 2 * wall - 0.002, h: h - mid - 0.004, wall: 0.004, r: 0, ellipse: true }, [0, mid, 0], inner(color, 0.22));
  // claw-ish feet
  const fr = 0.03;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) p.sphere([sx * (w / 2) * 0.6, footH / 2 + 0.003, sz * (d / 2) * 0.55], [fr, footH / 2 + 0.003, fr], palette.mustard, { seg: 8 });
  // drain
  p.cyl(-w * 0.3, 0, mid + 0.014, mid + 0.018, 0.022, 0.022, palette.steel, { seg: 10 });
  return p;
};

export const shower: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const trayH = Math.min(0.07, h * 0.1);
  // tray with a raised lip
  p.add({ kind: "ring", w, d, h: trayH, wall: 0.04, r: 0.03, ellipse: false }, [0, 0, 0], color);
  p.add({ kind: "slab", w: w - 0.04, d: d - 0.04, h: trayH * 0.6, r: 0.03 }, [0, 0, 0], inner(color, 0.35));
  p.cyl(0, 0, trayH * 0.6, trayH * 0.6 + 0.004, 0.04, 0.04, palette.steel, { seg: 12 });
  // glass: front (+Z) and right (+X) panels, with a slim top frame
  const gt = 0.01;
  const glass = "#cfe8f0";
  p.box([-w / 2 + 0.02, trayH, d / 2 - gt - 0.005], [w / 2 - 0.02, h - 0.02, d / 2 - 0.005], glass, { role: "glass", castShadow: false });
  p.box([w / 2 - gt - 0.005, trayH, -d / 2 + 0.02], [w / 2 - 0.005, h - 0.02, d / 2 - 0.02], glass, { role: "glass", castShadow: false });
  const fr = palette.steel;
  p.box([-w / 2, h - 0.02, d / 2 - 0.02], [w / 2, h, d / 2], fr);
  p.box([w / 2 - 0.02, h - 0.02, -d / 2], [w / 2, h, d / 2 - 0.02], fr);
  p.box([-w / 2, trayH, d / 2 - 0.02], [-w / 2 + 0.02, h - 0.02, d / 2], fr);
  p.box([w / 2 - 0.02, trayH, -d / 2], [w / 2, h - 0.02, -d / 2 + 0.02], fr);
  // door handle
  p.box([w * 0.1 - 0.008, h * 0.45, d / 2 - 0.035], [w * 0.1 + 0.008, h * 0.6, d / 2 - 0.016], fr);
  // shower column on the back wall + rain head
  const pz = -d / 2 + 0.035;
  const px = -w * 0.15;
  p.cyl(px, pz, trayH, h - 0.06, 0.014, 0.014, fr, { seg: 8 });
  const arm = Math.min(0.3, d * 0.35);
  p.cylZ(px, h - 0.07, pz, pz + arm, 0.012, 0.012, fr, { seg: 8 });
  const hr = Math.min(0.12, w * 0.15, d * 0.15);
  p.cyl(px, pz + arm, h - 0.1, h - 0.08, hr, hr, fr, { seg: 16 });
  // mixer
  p.cylZ(px, h * 0.45, -d / 2 + 0.02, -d / 2 + 0.06, 0.03, 0.03, fr, { seg: 10 });
  return p;
};
