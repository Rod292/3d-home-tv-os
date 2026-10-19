/**
 * "Divers" / mounted pieces: bicycle, coat rack, pendant lamps, ceiling fan, radiator, curtains.
 *
 * Mounted items still use the standard local frame (origin = center of the footprint at the
 * item's BOTTOM, y up, front +Z): wall pieces have their back on z = -d/2, ceiling pieces touch
 * the ceiling at y = h.
 */
import type { V2, V3 } from "../parts";
import { type Build, Parts, clamp, darken, lighten, palette } from "./common";

/** Warm "lit" color for bulbs / shades (the glow role adds the emissive). */
const BULB = "#ffe7b0";
const CORD = palette.charcoal;

/** Guard for degenerate sizes: a plain block keeps the bounds without fragile thin tubes. */
function tiny(p: Parts, w: number, h: number, d: number, color: string): Parts {
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h, d / 2], color, Math.min(w, h, d) * 0.2, { seg: 1 });
  return p;
}

/* ------------------------------------------------------------------ bicycle */

/**
 * Road bike seen from the side along local X (front wheel at +X); its side profile faces +Z.
 * Handlebar drops define the depth, tires the length, the saddle the height.
 */
export const bicycle: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (w < 0.4 || h < 0.3 || d < 0.08) return tiny(p, w, h, d, color);
  const R = Math.min(h * 0.36, w * 0.19);
  const tr = clamp(R * 0.06, 0.008, 0.022);
  const xr = -w / 2 + R;
  const xf = w / 2 - R;
  const L = xf - xr;
  const tube = clamp(R * 0.05, 0.008, 0.02);
  const tire = palette.ink;
  const rim = palette.steel;
  const metal = "#8d939a";

  // wheels: tire + rim + 3 spoke bars (6 spokes) + hub
  for (const x of [xr, xf]) {
    p.add({ kind: "torus", R: R - tr, r: tr, seg: 28 }, [x, R, 0], tire);
    p.add({ kind: "torus", R: R - tr * 2.4, r: tr * 0.55, seg: 24 }, [x, R, 0], rim);
    const sl = (R - tr * 2.6) * 2;
    for (let i = 0; i < 4; i++)
      p.add({ kind: "box", size: [sl, 0.004, 0.004] }, [x, R, 0], lighten(metal, 0.2), { rot: [0, 0, (i * Math.PI) / 4 + 0.2] });
    p.cylZ(x, R, -0.03, 0.03, tube * 1.3, tube * 1.3, metal, { seg: 10 });
  }

  // frame key points (XY, z = 0)
  const bb: V2 = [xr + L * 0.42, R * 0.8];
  const sadTop = h;
  const sadY = sadTop - 0.035;
  const seatAng = 0.3; // seat tube lean (rad) towards the back
  const sadX = bb[0] - Math.tan(seatAng) * (sadY - bb[1]);
  const cl: V2 = [bb[0] - Math.tan(seatAng) * (h * 0.78 - bb[1]), h * 0.78];
  const htTop: V2 = [xf - L * 0.16, h * 0.8];
  const htBot: V2 = [xf - L * 0.12, h * 0.64];
  const v = (q: V2, z = 0): V3 => [q[0], q[1], z];
  const bar = (a: V2, b: V2, r = tube, col = color) =>
    p.add({ kind: "tube", path: [v(a), v(b)], r, seg: 6, steps: 1 }, [0, 0, 0], col);
  bar(bb, cl); // seat tube
  bar(cl, htTop); // top tube
  bar(bb, htBot, tube * 1.25); // down tube
  bar(htBot, htTop, tube * 1.3); // head tube
  // chain stays / seat stays: doubled each side of the rear wheel
  for (const s of [-1, 1]) {
    const z = s * 0.035;
    p.add({ kind: "tube", path: [[xr, R, z], [bb[0], bb[1], s * 0.02]], r: tube * 0.7, seg: 5, steps: 1 }, [0, 0, 0], color);
    p.add({ kind: "tube", path: [[xr, R, z], [cl[0], cl[1] - 0.02, s * 0.012]], r: tube * 0.65, seg: 5, steps: 1 }, [0, 0, 0], color);
    // fork blades, slightly raked
    p.add(
      { kind: "tube", path: [[htBot[0], htBot[1], s * 0.015], [(htBot[0] + xf) / 2 + 0.01, (htBot[1] + R) / 2, s * 0.03], [xf, R, z]], r: tube * 0.75, seg: 5, steps: 6 },
      [0, 0, 0],
      color,
    );
  }
  // seat post + saddle
  p.add({ kind: "tube", path: [v(cl), [sadX, sadY - 0.02, 0]], r: tube * 0.7, seg: 6, steps: 1 }, [0, 0, 0], metal);
  const sl = clamp(R * 0.42, 0.06, 0.16);
  p.add({ kind: "sphere", r: 1, seg: 12 }, [sadX + sl * 0.15, sadTop - 0.02, 0], palette.ink, { scale: [sl, 0.02, clamp(d * 0.16, 0.025, 0.07)] });

  // stem + drop handlebar spanning the depth
  const hb: V2 = [htTop[0] + clamp(L * 0.08, 0.03, 0.1), htTop[1] + 0.035];
  p.add({ kind: "tube", path: [v(htTop), v(hb)], r: tube * 0.9, seg: 6, steps: 1 }, [0, 0, 0], metal);
  const hr = clamp(tube * 0.8, 0.007, 0.014);
  const zb = d / 2 - hr;
  const drop = clamp(R * 0.38, 0.06, 0.14);
  const reach = clamp(R * 0.24, 0.04, 0.09);
  p.cylZ(hb[0], hb[1], -zb * 0.85, zb * 0.85, hr, hr, palette.ink, { seg: 8 });
  for (const s of [-1, 1]) {
    const z = s * zb;
    p.add(
      {
        kind: "tube",
        path: [
          [hb[0], hb[1], s * zb * 0.82],
          [hb[0] + reach * 0.6, hb[1], z],
          [hb[0] + reach, hb[1] - drop * 0.35, z],
          [hb[0] + reach * 0.7, hb[1] - drop * 0.85, z],
          [hb[0] - reach * 0.3, hb[1] - drop, z],
        ],
        r: hr,
        seg: 6,
        steps: 10,
      },
      [0, 0, 0],
      palette.ink,
    );
    // brake hood
    p.sphere([hb[0] + reach * 0.75, hb[1] + hr * 0.6, z], [0.02, 0.025, hr * 1.1], palette.charcoal, { seg: 8 });
  }

  // drivetrain: chainring, crank arms + pedals, chain hint
  const cr = clamp(R * 0.28, 0.05, 0.12);
  p.add({ kind: "torus", R: cr, r: 0.006, seg: 20 }, [bb[0], bb[1], 0.045], metal);
  p.cylZ(bb[0], bb[1], -0.05, 0.05, 0.022, 0.022, metal, { seg: 10 });
  const ca = clamp(R * 0.5, 0.06, 0.17);
  const pz = Math.min(0.1, d / 2 - 0.02);
  for (const s of [-1, 1]) {
    const ang = s > 0 ? -1.2 : 1.94;
    const ex = bb[0] + Math.cos(ang) * ca;
    const ey = bb[1] + Math.sin(ang) * ca;
    p.add({ kind: "box", size: [ca, 0.016, 0.01] }, [(bb[0] + ex) / 2, (bb[1] + ey) / 2, s * 0.055], palette.charcoal, { rot: [0, 0, ang] });
    p.box([ex - 0.04, ey - 0.008, s * 0.055 - (s > 0 ? -0.004 : 0.05)], [ex + 0.04, ey + 0.008, s * 0.055 + (s > 0 ? Math.max(0.05, pz - 0.055) : 0.004)], palette.ink);
  }
  p.add({ kind: "tube", path: [[bb[0], bb[1] + cr, 0.045], [xr, R + 0.03, 0.045]], r: 0.004, seg: 4, steps: 1 }, [0, 0, 0], palette.charcoal);
  p.add({ kind: "tube", path: [[bb[0], bb[1] - cr, 0.045], [xr, R - 0.03, 0.045]], r: 0.004, seg: 4, steps: 1 }, [0, 0, 0], palette.charcoal);
  p.cylZ(xr, R, 0.03, 0.05, 0.035, 0.035, metal, { seg: 12 });
  return p;
};

/* ---------------------------------------------------------------- coat rack */

function coatRackBase(p: Parts, w: number, h: number, d: number, color: string): { hookY: number; poleR: number; hookR: number } {
  const poleR = clamp(Math.min(w, d) * 0.045, 0.012, 0.025);
  const baseH = clamp(h * 0.03, 0.025, 0.06);
  // weighted round base: low dome + ring
  p.cyl(0, 0, 0, baseH * 0.45, w / 2, d / 2, darken(color, 0.15), { seg: 28 });
  p.cyl(0, 0, baseH * 0.45, baseH, (w / 2) * 0.8, (d / 2) * 0.8, color, { seg: 28, taper: 0.55 });
  const knobR = poleR * 1.6;
  p.cyl(0, 0, baseH * 0.9, h - knobR * 1.6, poleR, poleR, color, { seg: 10 });
  p.sphere([0, h - knobR, 0], [knobR, knobR, knobR], darken(color, 0.12), { seg: 12 });
  // collar under the hooks
  const hookY = h - knobR * 2 - 0.13;
  p.cyl(0, 0, hookY - 0.03, hookY + 0.01, poleR * 1.5, poleR * 1.5, darken(color, 0.12), { seg: 10 });
  const hookR = Math.min(w, d) / 2 * 0.62;
  // 6 hooks: alternating long low / short high, curling upwards
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const k = i % 2 === 0 ? 1 : 0.7;
    const y = hookY + (i % 2 === 0 ? 0 : 0.07);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const r1 = hookR * k;
    p.add(
      {
        kind: "tube",
        path: [
          [ca * poleR, y - 0.02, sa * poleR],
          [ca * r1 * 0.6, y - 0.005, sa * r1 * 0.6],
          [ca * r1, y + 0.025, sa * r1],
          [ca * r1 * 1.02, y + 0.07, sa * r1 * 1.02],
        ],
        r: 0.007,
        seg: 5,
        steps: 6,
      },
      [0, 0, 0],
      palette.charcoal,
    );
    p.sphere([ca * r1 * 1.02, y + 0.075, sa * r1 * 1.02], [0.011, 0.011, 0.011], palette.charcoal, { seg: 8 });
  }
  return { hookY, poleR, hookR };
}

export const coatRackPole: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (w < 0.1 || h < 0.4) return tiny(p, w, h, d, color);
  coatRackBase(p, w, h, d, color);
  return p;
};

/** A soft coat hanging from a hook: flat-ish body facing outwards, shoulders, collar, sleeves. */
function coat(p: Parts, x: number, z: number, top: number, len: number, r: number, color: string, ang: number): void {
  const body0 = top - len;
  const rot: V3 = [0, -(ang + Math.PI / 2), 0];
  const tx = -Math.sin(ang);
  const tz = Math.cos(ang);
  const thick = 0.5;
  p.add({ kind: "cyl", rTop: 0.72, rBottom: 1, h: len - r * 0.5, seg: 14 }, [x, body0 + (len - r * 0.5) / 2, z], color, { rot, scale: [r, 1, r * thick] });
  p.add({ kind: "sphere", r: 1, seg: 12 }, [x, top - r * 0.5, z], color, { rot, scale: [r * 0.8, r * 0.42, r * thick * 0.8] });
  // hem + front placket
  p.add({ kind: "cyl", rTop: 1, rBottom: 1, h: 0.035, seg: 14 }, [x, body0 + 0.0175, z], darken(color, 0.14), { rot, scale: [r * 1.005, 1, r * thick * 1.01] });
  const ox = Math.cos(ang) * r * thick * 0.92;
  const oz = Math.sin(ang) * r * thick * 0.92;
  p.add({ kind: "box", size: [0.012, len * 0.75, 0.01] }, [x + ox, top - r * 0.5 - len * 0.375, z + oz], darken(color, 0.2), { rot });
  // collar
  p.cyl(x, z, top - r * 0.3, top, r * 0.26, r * 0.26, darken(color, 0.18), { seg: 8, taper: 1.3 });
  // sleeves hanging along the sides
  for (const s of [-1, 1])
    p.cyl(x + s * tx * r * 0.78, z + s * tz * r * 0.78, top - len * 0.6, top - r * 0.6, r * 0.2, r * 0.2, darken(color, 0.07), { seg: 8, taper: 0.85 });
}

export const coatRackHanging: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (w < 0.2 || h < 0.6) return tiny(p, w, h, d, color);
  const { hookY, hookR } = coatRackBase(p, w, h, d, color);
  const m = Math.min(w, d) / 2;
  const r = clamp(m * 0.42, 0.06, 0.17);
  const off = Math.min(hookR * 0.9, m - r - 0.005);
  // two coats + a scarf + a tote bag, hanging from the low hooks
  const hooks = [0, 2, 4].map((i) => (i / 6) * Math.PI * 2 + Math.PI / 6);
  const [a0, a1, a2] = hooks as [number, number, number];
  const at = (a: number, k = 1): [number, number] => [Math.cos(a) * off * k * (w / 2 / m), Math.sin(a) * off * k * (d / 2 / m)];
  const top = hookY + 0.03;
  {
    const [x, z] = at(a0);
    coat(p, x, z, top, Math.min(h * 0.48, 0.95), r, palette.slate, a0);
  }
  {
    const [x, z] = at(a1);
    coat(p, x, z, top - 0.02, Math.min(h * 0.36, 0.7), r * 0.92, palette.mustard, a1);
  }
  {
    // tote bag + strap
    const [x, z] = at(a2, 0.95);
    const bw = r * 1.4;
    const bh = clamp(h * 0.18, 0.18, 0.36);
    const strap = clamp(h * 0.12, 0.1, 0.25);
    const by1 = top - strap;
    const ca = Math.cos(a2);
    const sa = Math.sin(a2);
    const t = 0.05;
    const tx = -sa * bw * 0.5;
    const tz = ca * bw * 0.5;
    p.add({ kind: "box", size: [bw, bh, t] }, [x, by1 - bh / 2, z], palette.terracotta, { rot: [0, Math.PI / 2 - a2, 0] });
    p.add({ kind: "tube", path: [[x + tx * 0.6, by1, z + tz * 0.6], [x, top, z], [x - tx * 0.6, by1, z - tz * 0.6]], r: 0.008, seg: 4, steps: 6 }, [0, 0, 0], darken(palette.terracotta, 0.25));
    // scarf draped on the high hook next to it
    const a3 = a2 + Math.PI / 3;
    const sxz = [Math.cos(a3) * off * 0.7, Math.sin(a3) * off * 0.7 * (d / w)] as const;
    p.add(
      { kind: "tube", path: [[sxz[0], top + 0.07, sxz[1]], [sxz[0] * 1.15, top - 0.15, sxz[1] * 1.15], [sxz[0] * 1.05, top - 0.42, sxz[1] * 1.05]], r: 0.022, seg: 6, steps: 8 },
      [0, 0, 0],
      palette.blush,
    );
  }
  return p;
};

/* ------------------------------------------------------------ pendant lamps */

/** Ceiling canopy + cord down to `y`. Returns nothing; touches y = h. */
function canopyAndCord(p: Parts, h: number, y: number, w: number, d: number, color = CORD): void {
  const cr = Math.min(0.055, (Math.min(w, d) / 2) * 0.9);
  const ch = Math.min(0.03, h * 0.05);
  p.cyl(0, 0, h - ch, h, cr, cr, palette.offWhite, { seg: 16, taper: 0.85 });
  p.cyl(0, 0, h - ch - 0.01, h - ch, cr * 0.2, cr * 0.2, darken(palette.offWhite, 0.2), { seg: 8 });
  if (h - ch - 0.01 > y) p.cyl(0, 0, y, h - ch - 0.005, 0.004, 0.004, color, { seg: 5 });
}

export const pendantCage: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const shadeH = Math.min(h * 0.45, Math.max(w, d) * 1.0);
  const rx = w / 2;
  const rz = d / 2;
  canopyAndCord(p, h, shadeH, w, d);
  // glowing core (the light seen through the weave)
  p.cyl(0, 0, shadeH * 0.04, shadeH * 0.96, rx * 0.86, rz * 0.86, BULB, { seg: 16, role: "glow" });
  // woven body: vertical ribs + horizontal rings
  const n = 14;
  const rr = clamp(Math.min(w, d) * 0.02, 0.004, 0.009);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.cyl(Math.cos(a) * (rx - rr), Math.sin(a) * (rz - rr), 0, shadeH, rr, rr, color, { seg: 4 });
  }
  const rings = clamp(Math.round(shadeH / 0.07), 3, 7);
  for (let i = 0; i < rings; i++) {
    const y = rr + ((shadeH - 2 * rr) * i) / (rings - 1);
    p.add({ kind: "torus", R: rx - rr, r: rr, seg: 20 }, [0, y, 0], i === 0 || i === rings - 1 ? darken(color, 0.15) : color, {
      rot: [Math.PI / 2, 0, 0],
      scale: [1, rz / rx, 1],
    });
  }
  // top cap
  p.cyl(0, 0, shadeH - 0.012, shadeH + 0.01, rx * 0.45, rz * 0.45, darken(color, 0.2), { seg: 14, taper: 0.4 });
  return p;
};

export const pendantGlobe: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const ry = Math.min(h * 0.4, Math.max(w, d) / 2) * 0.92;
  canopyAndCord(p, h, ry * 2 - 0.004, w, d);
  p.sphere([0, ry, 0], [w / 2, ry, d / 2], color, { seg: 20, role: "glow" });
  // paper ribs (latitudes, never at the equator so the bounds stay exact)
  for (const t of [-0.62, -0.25, 0.25, 0.62]) {
    const y = ry + t * ry;
    const k = Math.sqrt(1 - t * t);
    p.add({ kind: "torus", R: (w / 2) * k, r: 0.0035, seg: 20 }, [0, y, 0], darken(color, 0.12), {
      rot: [Math.PI / 2, 0, 0],
      scale: [1, d / w, 1],
    });
  }
  p.cyl(0, 0, ry * 2 - 0.02, ry * 2 + 0.002, Math.min(w, d) * 0.12, Math.min(w, d) * 0.12, palette.offWhite, { seg: 10 });
  return p;
};

export const pendantDome: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const domeH = Math.min(h * 0.4, Math.max(w, d) * 0.5);
  canopyAndCord(p, h, domeH, w, d);
  // metal dome: lathe outer profile (bottom lip → top neck)
  const pts: V2[] = [[0.98, 0], [1, 0.03]];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([0.16 + 0.84 * Math.cos(a), 0.03 + 0.82 * Math.sin(a)]);
  }
  pts.push([0.14, 1], [0, 1]);
  p.add({ kind: "lathe", pts, seg: 24 }, [0, 0, 0], color, { scale: [w / 2, domeH, d / 2] });
  // glowing underside + bulb peeking out
  p.cyl(0, 0, domeH * 0.08, domeH * 0.1, (w / 2) * 0.93, (d / 2) * 0.93, lighten(BULB, 0.2), { seg: 24, role: "glow" });
  p.sphere([0, domeH * 0.12, 0], [Math.min(w, d) * 0.14, domeH * 0.12, Math.min(w, d) * 0.14], BULB, { seg: 12, role: "glow" });
  p.cyl(0, 0, domeH * 0.96, domeH + 0.012, Math.min(w, d) * 0.07, Math.min(w, d) * 0.07, darken(color, 0.25), { seg: 10 });
  return p;
};

export const pendantBulb: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const br = Math.min(w, d) / 2;
  const bulbH = Math.min(h * 0.4, br * 2.6);
  const sockH = Math.min(h * 0.12, bulbH * 0.55);
  canopyAndCord(p, h, bulbH + sockH, w, d);
  // pear bulb: sphere + tapered neck
  const sr = bulbH * 0.36;
  p.sphere([0, sr, 0], [w / 2, sr, d / 2], BULB, { seg: 16, role: "glow" });
  p.cyl(0, 0, sr, bulbH, (w / 2) * 0.45, (d / 2) * 0.45, BULB, { seg: 14, taper: 1.8, role: "glow" });
  // filament hint
  p.cyl(0, 0, sr * 0.6, sr * 1.5, 0.003, 0.003, "#ff9d3a", { seg: 4, role: "glow" });
  // brass socket
  p.cyl(0, 0, bulbH - 0.004, bulbH + sockH, (w / 2) * 0.42, (d / 2) * 0.42, color, { seg: 14 });
  p.cyl(0, 0, bulbH + sockH * 0.35, bulbH + sockH * 0.5, (w / 2) * 0.46, (d / 2) * 0.46, darken(color, 0.2), { seg: 14 });
  return p;
};

/* -------------------------------------------------------------- ceiling fan */

/**
 * Downrod + motor + 3 wooden blades + light dish. The blade sweep circle spans w × d
 * (with 3 blades the bounding box of the blades themselves is ~87% × 75% of it).
 */
export const ceilingFan: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (h < 0.12 || w < 0.3) return tiny(p, w, h, d, color);
  const body = palette.offWhite;
  const trim = darken(palette.offWhite, 0.22);
  const motorR = clamp(Math.min(w, d) * 0.1, 0.07, 0.14);
  const lightH = clamp(h * 0.18, 0.04, 0.09);
  const motorH = clamp(h * 0.25, 0.06, 0.14);
  const m0 = lightH * 0.75;
  const m1 = m0 + motorH;
  // canopy + downrod
  const canH = Math.min(0.05, h * 0.12);
  p.cyl(0, 0, h - canH, h, motorR * 0.65, motorR * 0.65, body, { seg: 16, taper: 0.8 });
  p.cyl(0, 0, m1 - 0.01, h - canH + 0.005, 0.012, 0.012, trim, { seg: 8 });
  // motor housing (rounded drum) + trim band
  p.cyl(0, 0, m0, m1, motorR, motorR, body, { seg: 20, taper: 0.8 });
  p.cyl(0, 0, m0 + motorH * 0.42, m0 + motorH * 0.58, motorR * 1.02, motorR * 1.02, trim, { seg: 20 });
  // light dish (glowing) below the motor
  p.cyl(0, 0, lightH * 0.7, m0 + 0.004, motorR * 0.95, motorR * 0.95, trim, { seg: 20 });
  p.sphere([0, lightH * 0.7, 0], [motorR * 0.85, lightH * 0.7, motorR * 0.85], lighten(BULB, 0.3), { seg: 16, role: "glow" });
  // blades + irons
  const by = m0 + motorH * 0.5;
  const bt = clamp(h * 0.03, 0.008, 0.016);
  const R = 1; // unit radius, scaled per axis below
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rx = (w / 2) * R;
    const rz = (d / 2) * R;
    // blade from 0.22 R to the tip, along the (elliptic) radius
    const tipX = ca * rx;
    const tipZ = sa * rz;
    const len = Math.hypot(tipX, tipZ);
    const inner = motorR * 1.15;
    const bl = len - inner;
    const bw = clamp(bl * 0.24, 0.06, 0.16);
    const ang = Math.atan2(tipZ, tipX);
    const cx = Math.cos(ang) * (inner + bl / 2);
    const cz = Math.sin(ang) * (inner + bl / 2);
    p.add({ kind: "slab", w: bl, d: bw, h: bt, r: bw * 0.45 }, [cx, by - bt / 2, cz], i === 0 ? color : i === 1 ? darken(color, 0.06) : lighten(color, 0.05), {
      rot: [0, -ang, 0],
    });
    // iron (bracket) from the motor to the blade root
    const il = motorR * 0.9;
    p.add({ kind: "box", size: [il, bt * 1.4, 0.03] }, [Math.cos(ang) * (motorR * 0.75 + il / 2), by + bt * 0.2, Math.sin(ang) * (motorR * 0.75 + il / 2)], trim, {
      rot: [0, -ang, 0],
    });
  }
  return p;
};

/* ----------------------------------------------------------------- radiator */

/** Wall panel radiator with vertical columns; back against the wall (z = -d/2). */
export const radiator: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const shade = darken(color, 0.32);
  const valveW = clamp(w * 0.08, 0.04, 0.07);
  const x1 = w / 2 - valveW;
  // wall brackets + back panel
  const zb = -d / 2 + Math.min(0.02, d * 0.25);
  for (const s of [-1, 1]) p.box([s * w * 0.3 - 0.02, h * 0.55, -d / 2], [s * w * 0.3 + 0.02, h * 0.7, zb + 0.002], shade);
  p.box([-w / 2 + 0.01, h * 0.06, zb], [x1 - 0.01, h * 0.94, zb + d * 0.2], shade);
  // columns: flat web + rounded front tube each, so the toon bands read as vertical fins
  const n = clamp(Math.round((x1 + w / 2) / 0.055), 3, 40);
  const cw = (x1 + w / 2) / n;
  const z0 = zb + d * 0.08;
  const rr = Math.min(cw * 0.42, (d / 2 - z0) * 0.45);
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + (i + 0.5) * cw;
    p.box([cx - cw * 0.3, 0, z0], [cx + cw * 0.3, h, d / 2 - rr], color);
    p.cyl(cx, d / 2 - rr, 0, h, rr, rr, color, { seg: 8 });
  }
  // top grille cap (visible from the iso camera)
  p.box([-w / 2 + cw * 0.15, h - 0.004, z0 + 0.004], [x1 - cw * 0.15, h - 0.002, d / 2 - rr], darken(color, 0.3));
  // thermostatic valve on the right, low
  const vx = x1 + valveW / 2;
  const vr = Math.min(valveW / 2, (d / 2 - z0) * 0.5);
  const vz = (z0 + d / 2) / 2;
  p.cylX(x1 - 0.01, w / 2 - valveW * 0.3, h * 0.1, vz, Math.min(0.012, vr * 0.6), palette.steel, { seg: 8 });
  p.cyl(vx, vz, 0, h * 0.1 + vr, vr * 0.6, vr * 0.6, palette.steel, { seg: 10 });
  p.cyl(vx, vz, h * 0.1 + vr, h * 0.1 + vr + clamp(h * 0.14, 0.04, 0.09), vr, vr, palette.offWhite, { seg: 12 });
  p.cyl(vx, vz, h * 0.1 + vr * 1.4, h * 0.1 + vr * 1.8, vr * 1.02, vr * 1.02, palette.slate, { seg: 12 });
  return p;
};

/* ----------------------------------------------------------------- curtains */

/**
 * Wavy fabric panel hanging from y = 0 to `top`, between x0 and x1, its pleats between
 * zBack and zFront. Built as a plan-view wave band extruded vertically.
 */
function panel(p: Parts, x0: number, x1: number, top: number, zBack: number, zFront: number, color: string): void {
  const W = x1 - x0;
  if (W <= 0.01 || top <= 0.01) return;
  const t = clamp((zFront - zBack) * 0.18, 0.004, 0.012);
  const A = (zFront - zBack - t) / 2;
  const zc = (zFront + zBack) / 2;
  const waves = clamp(Math.round(W / 0.14), 2, 18);
  const steps = waves * 6;
  const front: V2[] = [];
  const back: V2[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (W * i) / steps;
    const z = zc + Math.sin((i / steps) * waves * Math.PI * 2) * A;
    front.push([x, z + t / 2]);
    back.push([x, z - t / 2]);
  }
  // prism polygon lives in XY → rotate +90° about X so polygon-y becomes +z and the extrusion runs along y
  const band = (pts: V2[], y0: number, y1: number, col: string) =>
    p.add({ kind: "prism", pts: pts.map(([x, z]) => [x, z] as V2), depth: y1 - y0 }, [0, (y0 + y1) / 2, 0], col, { rot: [Math.PI / 2, 0, 0] });
  const poly = [...front, ...back.reverse()];
  const hemH = Math.min(0.06, top * 0.05);
  const headH = Math.min(0.08, top * 0.06);
  band(poly, hemH, top - headH, color);
  // hem + heading: same wave, a touch thicker so their side faces don't z-fight
  const thick = (k: number): V2[] => {
    const f: V2[] = [];
    const b: V2[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (W * i) / steps;
      const z = zc + Math.sin((i / steps) * waves * Math.PI * 2) * A;
      f.push([x, Math.min(z + t / 2 + k, zFront)]);
      b.push([x, Math.max(z - t / 2 - k, zBack)]);
    }
    return [...f, ...b.reverse()];
  };
  band(thick(0.0015), 0, hemH, darken(color, 0.12));
  band(thick(0.0015), top - headH, top, lighten(color, 0.1));
}

function curtainRod(p: Parts, w: number, h: number, d: number, zRod: number): number {
  const rr = clamp(h * 0.006, 0.008, 0.016);
  const fin = rr * 2;
  const metal = palette.charcoal;
  const y = h - fin;
  p.cylX(-w / 2 + fin * 2, w / 2 - fin * 2, y, zRod, rr, metal, { seg: 10 });
  for (const s of [-1, 1]) {
    p.sphere([s * (w / 2 - fin), y, zRod], [fin, fin, Math.min(fin, d / 2 - Math.abs(zRod))], metal, { seg: 10 });
    // wall bracket
    p.box([s * (w / 2 - fin * 4) - 0.01, y - 0.02, -d / 2], [s * (w / 2 - fin * 4) + 0.01, y + rr * 0.5, zRod], metal);
  }
  return y - rr - 0.01;
}

export const curtainPair: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (h < 0.2 || w < 0.1) return tiny(p, w, h, d, color);
  const zRod = -d / 2 + d * 0.5;
  const top = curtainRod(p, w, h, d, zRod);
  const pw = w * 0.36;
  const zBack = -d / 2 + d * 0.12;
  panel(p, -w / 2 + 0.01, -w / 2 + 0.01 + pw, top, zBack, d / 2, color);
  panel(p, w / 2 - 0.01 - pw, w / 2 - 0.01, top, zBack, d / 2, darken(color, 0.04));
  // tie-backs
  const ty = top * 0.42;
  for (const s of [-1, 1]) {
    const cx = s * (w / 2 - 0.01 - pw / 2);
    p.rbox([cx - pw / 2 - 0.004, ty, zBack - 0.002], [cx + pw / 2 + 0.004, ty + 0.035, d / 2], darken(color, 0.25), 0.008, { seg: 1 });
  }
  return p;
};

export const curtainSingle: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  if (h < 0.2 || w < 0.1) return tiny(p, w, h, d, color);
  const zRod = -d / 2 + d * 0.5;
  const top = curtainRod(p, w, h, d, zRod);
  panel(p, -w / 2 + 0.01, w / 2 - 0.01, top, -d / 2 + d * 0.12, d / 2, color);
  return p;
};
