import { type Build, type Ctx, Parts, clamp, darken, lighten, palette, legs, cornerPts, ACCENTS, fitToBox } from "./common";

interface SofaStyle {
  /** Visible legs (true) or a low recessed plinth (false). */
  legs: boolean;
  armW: number;
  radius: number;
  /** One long bench seat cushion instead of n cushions. */
  bench?: boolean;
  legColor?: string;
}

interface SofaRegion {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  armL: boolean;
  armR: boolean;
  back: boolean;
}

/** Shared sofa / armchair body for a rectangular region of the footprint. */
function sofaBody(p: Parts, c: Ctx, r: SofaRegion, st: SofaStyle, seatTop: number, legH: number): void {
  const { h, color } = c;
  const frame = color;
  const cushion = lighten(color, 0.12);
  const backCushion = lighten(color, 0.06);
  const legColor = st.legColor ?? darken(color, 0.6);
  const W = r.x1 - r.x0;
  const D = r.z1 - r.z0;
  const armW = Math.min(st.armW, W * 0.22);
  const backD = r.back ? clamp(D * 0.2, 0.1, 0.24) : 0;
  const cushH = clamp(h * 0.15, 0.06, 0.15);
  const baseTop = seatTop - cushH;
  const armTop = Math.min(h, seatTop + clamp(h * 0.24, 0.1, 0.26));
  const R = st.radius;

  // feet
  if (st.legs) {
    const ls = clamp(Math.min(W, D) * 0.06, 0.035, 0.05);
    legs(p, cornerPts(r.x0, r.x1, r.z0, r.z1, ls, 0.04), 0, legH + 0.01, ls, legColor, "taper");
  } else {
    p.box([r.x0 + 0.04, 0, r.z0 + 0.04], [r.x1 - 0.04, legH + 0.01, r.z1 - 0.04], darken(color, 0.55));
  }
  // base
  p.rbox([r.x0, legH, r.z0], [r.x1, baseTop, r.z1 - 0.015], frame, Math.min(R, 0.04), { seg: 1 });
  // back frame
  const backFrameTop = r.back ? h - Math.min(0.05, (h - seatTop) * 0.15) : 0;
  if (r.back) p.rbox([r.x0, legH, r.z0], [r.x1, backFrameTop, r.z0 + backD], frame, R, { seg: 1 });
  // arms
  const armZ0 = r.back ? r.z0 + backD * 0.25 : r.z0;
  if (r.armL) p.rbox([r.x0, legH, armZ0], [r.x0 + armW, armTop, r.z1], frame, Math.max(R, armW * (st.legs ? 0.25 : 0.45)), { seg: st.legs ? 1 : 2 });
  if (r.armR) p.rbox([r.x1 - armW, legH, armZ0], [r.x1, armTop, r.z1], frame, Math.max(R, armW * (st.legs ? 0.25 : 0.45)), { seg: st.legs ? 1 : 2 });

  // cushions
  const ix0 = r.x0 + (r.armL ? armW : 0) + 0.005;
  const ix1 = r.x1 - (r.armR ? armW : 0) - 0.005;
  const innerW = ix1 - ix0;
  const backCushD = r.back ? clamp(D * 0.17, 0.09, 0.2) : 0;
  const bcz0 = r.z0 + backD * 0.45;
  const bcz1 = bcz0 + backCushD;
  const seatZ0 = r.back ? bcz1 - 0.04 : r.z0 + 0.02;
  const n = st.bench ? 1 : clamp(Math.round(innerW / 0.68), 1, 6);
  const cw = innerW / n;
  const cseg = n <= 3 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const a = ix0 + i * cw + 0.006;
    const b = ix0 + (i + 1) * cw - 0.006;
    p.rbox([a, baseTop - 0.01, seatZ0], [b, seatTop, r.z1], cushion, Math.min(0.05, cushH * 0.45), { seg: cseg });
    if (r.back) p.rbox([a, seatTop - 0.03, bcz0], [b, h, bcz1], backCushion, Math.min(0.06, backCushD * 0.45), { seg: cseg });
  }
}

function sofaParams(c: Ctx, st: SofaStyle) {
  const legH = st.legs ? clamp(c.h * 0.13, 0.04, 0.13) : 0.025;
  const seatTop = clamp(c.h * 0.52, Math.min(0.2, c.h * 0.6), 0.5);
  return { legH, seatTop };
}

/** A tilted throw pillow resting against the back cushion, near an arm. */
function throwPillow(p: Parts, x: number, z: number, seatTop: number, size: number, color: string): void {
  const s = size;
  p.rbox([x - s / 2, seatTop - 0.02, z - 0.06], [x + s / 2, seatTop - 0.02 + s, z + 0.06], color, 0.045, { seg: 1 });
}

function sofaGeneric(c: Ctx, st: SofaStyle): Parts {
  const p = new Parts();
  const { w, d, h } = c;
  const { legH, seatTop } = sofaParams(c, st);
  const region: SofaRegion = { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, armL: true, armR: true, back: true };
  sofaBody(p, c, region, st, seatTop, legH);
  const armW = Math.min(st.armW, w * 0.22);
  if (w - 2 * armW > 1.0 && h - seatTop > 0.25) {
    const backD = clamp(d * 0.2, 0.1, 0.24) + clamp(d * 0.17, 0.09, 0.2);
    const ps = Math.min(0.36, (h - seatTop) * 0.8);
    throwPillow(p, -w / 2 + armW + ps / 2 + 0.04, -d / 2 + backD + 0.04, seatTop, ps, palette.mustard);
    throwPillow(p, w / 2 - armW - ps / 2 - 0.04, -d / 2 + backD + 0.04, seatTop, ps, palette.terracotta);
  }
  return p;
}

export const sofaModern: Build = (c) => sofaGeneric(c, { legs: true, armW: clamp(c.w * 0.08, 0.1, 0.18), radius: 0.03 });
export const sofaRounded: Build = (c) =>
  sofaGeneric(c, { legs: false, armW: clamp(c.w * 0.11, 0.16, 0.26), radius: 0.07, bench: c.w < 2.4 });

/** L-shaped sofa: chaise longue on the +X side running to the front. */
export const sofaCorner: Build = (c) => {
  const p = new Parts();
  const { w, d } = c;
  const st: SofaStyle = { legs: true, armW: clamp(w * 0.06, 0.1, 0.18), radius: 0.03 };
  const { legH, seatTop } = sofaParams(c, st);
  const mainD = Math.min(d, clamp(d * 0.6, 0.8, 1.0));
  const chaiseW = clamp(w * 0.36, 0.6, 1.0);
  sofaBody(p, c, { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: -d / 2 + mainD, armL: true, armR: true, back: true }, st, seatTop, legH);
  if (d - mainD > 0.05) {
    // chaise extension (no back), continues the right arm
    sofaBody(
      p,
      c,
      { x0: w / 2 - chaiseW, x1: w / 2, z0: -d / 2 + mainD - 0.02, z1: d / 2, armL: false, armR: true, back: false },
      { ...st, bench: true },
      seatTop,
      legH,
    );
  }
  return p;
};

function armchair(c: Ctx, kind: "club" | "lounge"): Parts {
  const p = new Parts();
  const { w, d, h } = c;
  const st: SofaStyle =
    kind === "club"
      ? { legs: true, armW: clamp(w * 0.2, 0.1, 0.2), radius: 0.06, bench: true, legColor: palette.woodDark }
      : { legs: true, armW: clamp(w * 0.1, 0.05, 0.09), radius: 0.03, bench: true, legColor: palette.wood };
  const legH = kind === "club" ? clamp(h * 0.1, 0.04, 0.09) : clamp(h * 0.22, 0.08, 0.2);
  const seatTop = clamp(h * 0.5, Math.min(0.2, h * 0.6), 0.46);
  sofaBody(p, c, { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, armL: true, armR: true, back: true }, st, seatTop, legH);
  if (kind === "club" && h - seatTop > 0.25 && w > 0.6) {
    const backD = clamp(d * 0.2, 0.1, 0.24) + clamp(d * 0.17, 0.09, 0.2);
    throwPillow(p, 0, -d / 2 + backD + 0.04, seatTop, Math.min(0.32, (h - seatTop) * 0.75), ACCENTS[c.seed % 4] ?? palette.mustard);
  }
  return p;
}

export const armchairClub: Build = (c) => armchair(c, "club");

/**
 * Swivel tub armchair à la IKEA DYVLINGE: a low rounded shell made of deep vertical channel
 * tubes (back higher, sloping down to the arm fronts), a plump round seat cushion, on a short
 * column and a black 5-star swivel base. Authored at 0.8 × 0.74 × 0.78 m, remapped to the box.
 */
export const armchairSwivel: Build = (c) => {
  const p = new Parts();
  const fabric = c.color;
  const metal = "#2c2b2e";
  // 5-star base with glides + hub + column
  const R = 0.3;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    p.add({ kind: "box", size: [R, 0.028, 0.05] }, [ca * R * 0.5, 0.032, sa * R * 0.5], metal, { rot: [0, -a, 0] });
    p.cyl(ca * R * 0.95, sa * R * 0.95, 0, 0.022, 0.024, 0.024, metal, { seg: 10 });
  }
  p.cyl(0, 0, 0.012, 0.06, 0.06, 0.06, metal, { seg: 16, taper: 0.8 });
  p.cyl(0, 0, 0.05, 0.15, 0.034, 0.034, metal, { seg: 12 });
  p.cyl(0, 0, 0.14, 0.16, 0.16, 0.16, metal, { seg: 16 });
  // seat platform (dark fabric skirt under the cushion)
  p.cyl(0, 0.02, 0.15, 0.28, 0.33, 0.31, darken(fabric, 0.2), { seg: 24 });
  // channel tubes around an ellipse: θ = 0 at the back, ±108° at the arm fronts (one exactly at ±90°)
  const N = 13;
  const thMax = (108 / 180) * Math.PI;
  const rx = 0.33;
  const rz = 0.31;
  const tr = 0.068;
  const armTop = 0.5;
  const backTop = 0.74;
  const y0 = 0.14;
  for (let i = 0; i < N; i++) {
    const th = -thMax + (2 * thMax * i) / (N - 1);
    const x = Math.sin(th) * rx;
    const z = -Math.cos(th) * rz;
    const k = Math.abs(th) / thMax; // 0 back → 1 front
    const top = armTop + (backTop - armTop) * (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, k * 1.05)));
    const col = i % 2 ? fabric : darken(fabric, 0.06);
    const capH = tr * 0.95;
    p.cyl(x, z, y0, top - capH, tr, tr, col, { seg: 12 });
    const dome: [number, number][] = [
      [tr, 0],
      [tr * 0.92, capH * 0.4],
      [tr * 0.7, capH * 0.75],
      [tr * 0.38, capH * 0.95],
      [0, capH],
    ];
    p.add({ kind: "lathe", pts: dome, seg: 12 }, [x, top - capH, z], col);
  }
  // plump round seat cushion
  p.sphere([0, 0.33, 0.06], [0.28, 0.095, 0.33], lighten(fabric, 0.08), { seg: 20 });
  return fitToBox(p, c.w, c.h, c.d);
};
export const armchairLounge: Build = (c) => armchair(c, "lounge");

/* ------------------------------------------------------------------ chairs */

export const chairWood: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const ls = clamp(Math.min(w, d) * 0.08, 0.025, 0.045);
  const seatTop = clamp(h * 0.53, Math.min(0.15, h * 0.5), 0.48);
  const seatT = clamp(seatTop * 0.08, 0.02, 0.045);
  const legC = darken(color, 0.18);
  // legs (back legs rise to become back posts)
  p.box([-w / 2, 0, d / 2 - ls], [-w / 2 + ls, seatTop - seatT, d / 2], legC);
  p.box([w / 2 - ls, 0, d / 2 - ls], [w / 2, seatTop - seatT, d / 2], legC);
  p.box([-w / 2, 0, -d / 2], [-w / 2 + ls, h, -d / 2 + ls], legC);
  p.box([w / 2 - ls, 0, -d / 2], [w / 2, h, -d / 2 + ls], legC);
  // stretchers
  p.box([-w / 2 + ls, seatTop * 0.3, -d / 2 + ls * 0.25], [-w / 2 + ls * 0.75, seatTop * 0.3 + 0.02, d / 2 - ls * 0.25], legC);
  p.box([w / 2 - ls * 0.75, seatTop * 0.3, -d / 2 + ls * 0.25], [w / 2 - ls, seatTop * 0.3 + 0.02, d / 2 - ls * 0.25], legC);
  // seat
  p.rbox([-w / 2, seatTop - seatT, -d / 2 + ls * 0.5], [w / 2, seatTop, d / 2], color, 0.012, { seg: 2 });
  // backrest: top rail + middle slat
  const backH = h - seatTop;
  if (backH > 0.1) {
    p.rbox([-w / 2 + ls, h - backH * 0.32, -d / 2], [w / 2 - ls, h - 0.005, -d / 2 + ls * 0.9], color, 0.01, { seg: 1 });
    p.box([-w / 2 + ls, seatTop + backH * 0.3, -d / 2 + ls * 0.2], [w / 2 - ls, seatTop + backH * 0.38, -d / 2 + ls * 0.7], legC);
  }
  return p;
};

export const chairUpholstered: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const ls = clamp(Math.min(w, d) * 0.07, 0.025, 0.04);
  const seatTop = clamp(h * 0.53, Math.min(0.15, h * 0.5), 0.48);
  const seatT = clamp(seatTop * 0.16, 0.04, 0.08);
  const legC = palette.woodDark;
  legs(p, cornerPts(-w / 2, w / 2, -d / 2, d / 2, ls, 0.02), 0, seatTop - seatT + 0.01, ls, legC, "taper");
  p.rbox([-w / 2, seatTop - seatT, -d / 2 + 0.03], [w / 2, seatTop, d / 2], lighten(color, 0.08), Math.min(0.03, seatT * 0.45), { seg: 2 });
  // padded back, slightly narrower at the top
  const backT = clamp(d * 0.12, 0.04, 0.08);
  p.rbox([-w / 2 + 0.01, seatTop - seatT * 0.5, -d / 2], [w / 2 - 0.01, h, -d / 2 + backT], color, Math.min(0.035, backT * 0.45), { seg: 2 });
  return p;
};

export const chairStool: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const seatT = clamp(h * 0.07, 0.03, 0.05);
  const rx = w / 2;
  const rz = d / 2;
  const legC = darken(color, 0.35);
  const lr = clamp(Math.min(w, d) * 0.05, 0.012, 0.02);
  const k = 0.62;
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    p.cyl(sx * rx * k * 0.85, sz * rz * k * 0.85, 0, h - seatT + 0.005, lr, lr, legC, { seg: 6 });
  }
  // foot ring
  const ringY = h * 0.32;
  const ringR = rx * k * 0.85;
  p.add({ kind: "torus", R: ringR, r: lr * 0.7, seg: 16 }, [0, ringY, 0], legC, { rot: [Math.PI / 2, 0, 0], scale: [1, rz / rx, 1] });
  p.cyl(0, 0, h - seatT, h, rx, rz, color, { seg: 20 });
  return p;
};

/** Office chair; `base` = star base / posts / spine, `pad` = armrest pads, `frame` = seat shell (& back frame unless `backFrame`). */
function officeChair(c: Parameters<Build>[0], base: string, pad: string, frame?: string, backFrame?: string): Parts {
  const p = new Parts();
  const { w, h, d, color } = c;
  const R = Math.min(w, d) / 2 - 0.03;
  const casterR = 0.025;
  const armY = casterR * 2 + 0.012;
  // star base: 5 tapered arms + twin-wheel casters + hub
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a) * R * 0.5;
    const cz = Math.sin(a) * R * 0.5;
    p.add({ kind: "box", size: [R, 0.03, 0.04] }, [cx, armY + 0.015, cz], base, { rot: [0, -a, 0] });
    const kx = Math.cos(a) * R * 0.95;
    const kz = Math.sin(a) * R * 0.95;
    p.add({ kind: "cyl", rTop: casterR, rBottom: casterR, h: 0.03, seg: 10 }, [kx, casterR, kz], palette.ink, { rot: [Math.PI / 2, 0, -a + Math.PI / 2] });
    p.cyl(kx, kz, casterR * 1.6, armY + 0.01, 0.008, 0.008, base, { seg: 6 });
  }
  p.cyl(0, 0, armY, armY + 0.05, 0.05, 0.05, base, { seg: 12, taper: 0.8 });
  const seatTop = clamp(h * 0.5, Math.min(0.2, h * 0.5), 0.5);
  const seatT = clamp(seatTop * 0.17, 0.05, 0.09);
  const shellT = seatT * 0.35;
  // gas lift: dark sleeve + chrome piston + mechanism plate
  const s0 = seatTop - seatT - 0.035;
  p.cyl(0, 0, armY + 0.04, armY + 0.04 + (s0 - armY) * 0.55, 0.03, 0.03, base, { seg: 10 });
  p.cyl(0, 0, armY + 0.04, s0 + 0.005, 0.02, 0.02, palette.steel, { seg: 10 });
  p.box([-0.1, s0, -0.09], [0.1, seatTop - seatT + 0.002, 0.08], base);
  p.box([0.1, s0 + 0.005, 0.02], [0.17, s0 + 0.015, 0.03], base);
  // seat: dark shell + plump cushion (narrower than the armrests)
  const armW = clamp(w * 0.07, 0.035, 0.06);
  const sx = w / 2 - armW - 0.015;
  p.rbox([-sx, seatTop - seatT, -d / 2 + 0.08], [sx, seatTop - seatT + shellT, d / 2 - 0.01], frame ?? darken(color, 0.45), 0.02, { seg: 2 });
  p.rbox([-sx + 0.005, seatTop - seatT + shellT * 0.6, -d / 2 + 0.085], [sx - 0.005, seatTop, d / 2], color, 0.035, { seg: 2 });
  // armrests: posts + pads
  const armTop = Math.min(seatTop + clamp(h * 0.2, 0.12, 0.24), h - 0.05);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? w / 2 - armW : -w / 2;
    const xm = x0 + armW / 2;
    p.box([xm - 0.012, seatTop - seatT, -0.04], [xm + 0.012, armTop - 0.02, 0.0], base);
    p.box([Math.min(xm, s * sx) - 0.01, seatTop - seatT + 0.005, -0.04], [Math.max(xm, s * sx) + 0.01, seatTop - seatT + 0.025, 0.0], base);
    p.rbox([x0, armTop - 0.028, -d * 0.28], [x0 + armW, armTop, d * 0.12], pad, 0.012, { seg: 1 });
  }
  // back: spine + dark frame + upholstered panel + lumbar roll
  const backT = 0.06;
  const bz0 = -d / 2;
  p.box([-0.03, seatTop - seatT, bz0 + 0.03], [0.03, seatTop + 0.14, bz0 + 0.055], base);
  p.box([-0.03, seatTop - seatT - 0.01, bz0 + 0.03], [0.03, seatTop - seatT + 0.02, -0.06], base);
  const by0 = seatTop + 0.06;
  const bx = sx - 0.02;
  p.rbox([-bx, by0, bz0], [bx, h, bz0 + backT * 0.6], backFrame ?? frame ?? darken(color, 0.4), 0.03, { seg: 2 });
  p.rbox([-bx + 0.02, by0 + 0.02, bz0 + backT * 0.3], [bx - 0.02, h - 0.02, bz0 + backT], color, 0.03, { seg: 2 });
  const ly = by0 + (h - by0) * 0.22;
  p.rbox([-bx + 0.04, ly, bz0 + backT * 0.8], [bx - 0.04, ly + (h - by0) * 0.16, bz0 + backT + 0.015], lighten(color, 0.12), 0.02, { seg: 2 });
  return p;
}

export const chairOffice: Build = (c) => officeChair(c, palette.charcoal, palette.ink);
/** Light frame (white/alpine base, arms and shell) with a colored mesh, à la Mirra 2. */
export const chairOfficeLight: Build = (c) => officeChair(c, "#e9e7e1", "#dedbd4", "#efede8", darken(c.color, 0.18));
