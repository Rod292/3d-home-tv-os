import { type Build, type Ctx, Parts, clamp, darken, lighten, palette, legs, cornerPts } from "./common";

interface BedStyle {
  frame: string;
  headboard: string;
  headT: number;
  /** Platform beds: wide low frame, mattress sits on top with a visible ledge. */
  platform?: boolean;
  /** Padded, rounded headboard. */
  padded?: boolean;
  legs: boolean;
}

function bed(c: Ctx, st: BedStyle): Parts {
  const p = new Parts();
  const { w, h, d, color } = c;
  const headT = Math.min(st.headT, d * 0.1);
  const mattressTop = Math.min(h, clamp(h * (st.platform ? 0.5 : 0.58), 0.18, 0.58));
  const mattressT = clamp(mattressTop * 0.42, 0.08, 0.24);
  const frameTop = st.platform ? mattressTop - mattressT : mattressTop - mattressT * 0.65;
  const legH = st.legs ? clamp(frameTop * 0.35, 0.03, 0.14) : 0.02;

  // headboard at the back (-Z)
  if (st.padded) {
    p.rbox([-w / 2, legH, -d / 2], [w / 2, h, -d / 2 + headT], st.headboard, Math.min(0.06, headT * 0.45), { seg: 2 });
    p.box([-w / 2 + 0.03, 0, -d / 2 + 0.01], [w / 2 - 0.03, legH + 0.01, -d / 2 + headT - 0.01], darken(st.headboard, 0.5));
  } else {
    p.rbox([-w / 2, 0, -d / 2], [w / 2, h, -d / 2 + headT], st.headboard, 0.02, { seg: 1 });
  }

  // frame
  const fx = st.platform ? w / 2 : w / 2 - 0.005;
  if (st.legs) {
    const ls = 0.06;
    legs(p, cornerPts(-fx, fx, -d / 2 + headT, d / 2, ls, 0.04), 0, legH + 0.01, ls, darken(st.frame, 0.3), "square");
  } else {
    p.box([-fx + 0.05, 0, -d / 2 + headT], [fx - 0.05, legH + 0.01, d / 2 - 0.05], darken(st.frame, 0.5));
  }
  p.rbox([-fx, legH, -d / 2 + headT * 0.5], [fx, frameTop, d / 2], st.frame, st.platform ? 0.02 : 0.03, { seg: 1 });

  // mattress
  const mi = st.platform ? clamp(w * 0.04, 0.04, 0.1) : 0.03;
  const mz1 = d / 2 - (st.platform ? mi : 0.03);
  p.rbox([-w / 2 + mi, frameTop - 0.03, -d / 2 + headT], [w / 2 - mi, mattressTop, mz1], palette.offWhite, 0.04, { seg: 2 });

  // pillows near the headboard
  const innerW = w - 2 * mi - 0.04;
  const nP = w >= 1.25 ? 2 : 1;
  const pw = (innerW - (nP - 1) * 0.04) / nP;
  const pd = clamp(d * 0.17, 0.25, 0.4);
  const pTop = Math.min(h, mattressTop + clamp(h * 0.14, 0.06, 0.13));
  const pz0 = -d / 2 + headT + 0.03;
  for (let i = 0; i < nP; i++) {
    const x0 = -w / 2 + mi + 0.02 + i * (pw + 0.04);
    p.rbox([x0, mattressTop - 0.02, pz0], [x0 + pw, pTop, pz0 + pd], lighten(color, 0.75), 0.05, { seg: 2 });
  }

  // duvet: covers the lower ~65%, folded band at its top edge
  const dz0 = pz0 + pd + clamp(d * 0.04, 0.04, 0.1);
  const duvT = Math.min(0.05, Math.max(0.005, h - mattressTop - 0.012));
  const duvTop = mattressTop + duvT;
  const dx = w / 2 - mi + 0.015;
  p.rbox([-dx, mattressTop - mattressT * 0.75, dz0], [dx, duvTop, Math.min(d / 2, mz1 + 0.015)], color, 0.035, { seg: 2 });
  p.rbox([-dx + 0.005, duvTop - 0.03, dz0 - 0.02], [dx - 0.005, Math.min(h, duvTop + 0.012), dz0 + 0.2], lighten(color, 0.4), 0.02, { seg: 1 });
  // throw blanket at the foot for wide beds
  if (w > 1.2 && d > 1.6) {
    const accent = color.toLowerCase() === palette.terracotta ? palette.mustard : palette.terracotta;
    p.rbox([-dx - 0.003, mattressTop - mattressT * 0.5, mz1 - 0.42], [dx + 0.003, Math.min(h, duvTop + 0.012), Math.min(d / 2, mz1 + 0.02)], accent, 0.02, { seg: 1 });
  }
  return p;
}

export const bedClassic: Build = (c) => bed(c, { frame: palette.wood, headboard: palette.wood, headT: 0.07, legs: true });
export const bedUpholstered: Build = (c) => {
  const fabric = darken(palette.slate, 0.05);
  return bed(c, { frame: fabric, headboard: lighten(fabric, 0.08), headT: 0.12, padded: true, legs: false });
};
export const bedPlatform: Build = (c) => bed(c, { frame: palette.woodLight, headboard: palette.woodLight, headT: 0.05, platform: true, legs: false });
