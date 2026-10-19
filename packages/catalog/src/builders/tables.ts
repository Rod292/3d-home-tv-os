import { type Build, Parts, clamp, darken, lighten, palette, legs, cornerPts, fronts } from "./common";

export const tableClassic: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.05, 0.025, 0.045);
  const ls = clamp(Math.min(w, d) * 0.05, 0.035, 0.06);
  const inset = clamp(Math.min(w, d) * 0.04, 0.02, 0.06);
  const legC = darken(color, 0.15);
  p.rbox([-w / 2, h - topT, -d / 2], [w / 2, h, d / 2], color, 0.012, { seg: 2 });
  const pts = cornerPts(-w / 2, w / 2, -d / 2, d / 2, ls, inset);
  legs(p, pts, 0, h - topT + 0.002, ls, legC, "square");
  // apron
  const ah = clamp(h * 0.09, 0.04, 0.08);
  const a = inset + ls * 0.5;
  p.box([-w / 2 + a, h - topT - ah, -d / 2 + a], [w / 2 - a, h - topT, -d / 2 + a + 0.02], legC);
  p.box([-w / 2 + a, h - topT - ah, d / 2 - a - 0.02], [w / 2 - a, h - topT, d / 2 - a], legC);
  return p;
};

export const tableRound: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.05, 0.025, 0.045);
  const legC = darken(color, 0.2);
  p.cyl(0, 0, h - topT, h, w / 2, d / 2, color, { seg: 32 });
  if (Math.max(w, d) > 1.5) {
    // large oval: two pedestals
    const off = (w / 2) * 0.45;
    for (const sx of [-1, 1]) {
      p.cyl(sx * off, 0, 0.04, h - topT, 0.045, 0.045, legC, { seg: 10 });
      p.cyl(sx * off, 0, 0, 0.045, Math.min(d * 0.25, 0.25), Math.min(d * 0.25, 0.25), legC, { seg: 16, taper: 0.8 });
    }
  } else {
    const br = Math.min(w, d) * 0.26;
    p.cyl(0, 0, 0.04, h - topT, 0.05, 0.05, legC, { seg: 10, taper: 0.75 });
    p.cyl(0, 0, 0, 0.05, br, br, legC, { seg: 18, taper: 0.7 });
  }
  return p;
};

export const tableTrestle: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.06, 0.03, 0.05);
  const legC = palette.charcoal;
  // plank top: 3-4 boards with dark gaps + breadboard ends
  const ends = clamp(w * 0.05, 0.04, 0.09);
  p.box([-w / 2 + ends, h - topT, -d / 2 + 0.01], [w / 2 - ends, h - topT * 0.25, d / 2 - 0.01], darken(color, 0.45));
  const n = d > 0.75 ? 4 : 3;
  const gap = 0.006;
  const pd = (d - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const z0 = -d / 2 + i * (pd + gap);
    const tone = i % 2 === 0 ? color : i === 1 ? darken(color, 0.06) : lighten(color, 0.05);
    p.rbox([-w / 2 + ends, h - topT, z0], [w / 2 - ends, h, z0 + pd], tone, 0.006, { seg: 1 });
  }
  for (const s of [-1, 1]) p.rbox([s > 0 ? w / 2 - ends : -w / 2, h - topT, -d / 2], [s > 0 ? w / 2 : -w / 2 + ends, h, d / 2], darken(color, 0.1), 0.008, { seg: 1 });
  const lx = w / 2 - clamp(w * 0.12, 0.08, 0.25);
  const t = 0.04;
  const legTop = h - topT;
  for (const sx of [-1, 1]) {
    const x = sx * lx;
    // A-shaped side: two slanted posts drawn as a prism in the ZY plane
    const fz = d / 2 - 0.05;
    const tz = Math.min(d * 0.25, 0.2);
    const pts: [number, number][] = [
      [-fz, 0],
      [-fz + 0.06, 0],
      [-tz + 0.06 + 0.02, legTop],
      [tz - 0.06 - 0.02, legTop],
      [fz - 0.06, 0],
      [fz, 0],
      [tz, legTop + 0.001],
      [-tz, legTop + 0.001],
    ];
    p.add({ kind: "prism", pts: pts.map(([z, y]) => [-z, y] as [number, number]), depth: t }, [x, 0, 0], legC, {
      rot: [0, Math.PI / 2, 0],
    });
    // cross brace of the A + a top cleat under the boards + rubber feet
    const by = legTop * 0.42;
    const bz = fz - (fz - tz) * (by / legTop) - 0.03;
    p.box([x - t / 2 - 0.004, by, -bz], [x + t / 2 + 0.004, by + 0.025, bz], darken(legC, 0.1));
    p.box([x - t / 2 - 0.01, legTop - 0.03, -tz - 0.03], [x + t / 2 + 0.01, legTop, tz + 0.03], legC);
    for (const s of [-1, 1]) p.box([x - t / 2 - 0.002, 0, s > 0 ? fz - 0.065 : -fz + 0.005], [x + t / 2 + 0.002, 0.012, s > 0 ? fz - 0.005 : -fz + 0.065], palette.ink);
  }
  // stretcher with end bolts
  p.box([-lx, h * 0.35, -0.015], [lx, h * 0.35 + 0.03, 0.015], legC);
  for (const s of [-1, 1]) p.cylZ(s * (lx - 0.05), h * 0.35 + 0.015, 0.015, 0.022, 0.009, 0.009, palette.steel, { seg: 8 });
  return p;
};

export const coffeeRect: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.12, 0.03, 0.06);
  const ls = clamp(Math.min(w, d) * 0.07, 0.035, 0.055);
  const legC = darken(color, 0.3);
  p.rbox([-w / 2, h - topT, -d / 2], [w / 2, h, d / 2], color, Math.min(0.025, topT * 0.45), { seg: 2 });
  legs(p, cornerPts(-w / 2, w / 2, -d / 2, d / 2, ls, 0.03), 0, h - topT + 0.002, ls, legC, "taper");
  // lower shelf
  const sy = clamp(h * 0.22, 0.05, 0.12);
  p.rbox([-w / 2 + 0.05, sy, -d / 2 + 0.05], [w / 2 - 0.05, sy + 0.02, d / 2 - 0.05], lighten(color, 0.08), 0.006, { seg: 1 });
  // a little book stack + bowl on the shelf? keep it on top-visible area: a magazine
  if (w > 0.7 && h > 0.25) {
    p.box([-w * 0.25, sy + 0.02, -d * 0.18], [-w * 0.25 + 0.22, sy + 0.035, -d * 0.18 + 0.16], palette.terracotta);
    p.box([-w * 0.25 + 0.02, sy + 0.035, -d * 0.18 + 0.01], [-w * 0.25 + 0.2, sy + 0.05, -d * 0.18 + 0.15], palette.cream);
  }
  return p;
};

export const coffeeRound: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.12, 0.03, 0.06);
  const legC = darken(color, 0.3);
  p.cyl(0, 0, h - topT, h, w / 2, d / 2, color, { seg: 32 });
  const ls = 0.04;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    p.cyl(Math.cos(a) * (w / 2) * 0.62, Math.sin(a) * (d / 2) * 0.62, 0, h - topT + 0.002, ls / 2, ls / 2, legC, { seg: 8, taper: 1.5 });
  }
  const sy = clamp(h * 0.25, 0.06, 0.14);
  p.cyl(0, 0, sy, sy + 0.02, (w / 2) * 0.68, (d / 2) * 0.68, lighten(color, 0.08), { seg: 24 });
  return p;
};

export const deskSimple: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.04, 0.022, 0.035);
  const ls = clamp(Math.min(w, d) * 0.05, 0.03, 0.045);
  const legC = palette.charcoal;
  p.rbox([-w / 2, h - topT, -d / 2], [w / 2, h, d / 2], color, 0.008, { seg: 2 });
  legs(p, cornerPts(-w / 2, w / 2, -d / 2, d / 2, ls, 0.03), 0, h - topT + 0.002, ls, legC, "square");
  // modesty panel at the back
  p.box([-w / 2 + 0.06, h * 0.45, -d / 2 + 0.05], [w / 2 - 0.06, h - topT, -d / 2 + 0.065], darken(color, 0.12));
  return p;
};

export const deskDrawers: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.04, 0.022, 0.035);
  const body = lighten(color, 0.05);
  p.rbox([-w / 2, h - topT, -d / 2], [w / 2, h, d / 2], color, 0.008, { seg: 2 });
  const pw = clamp(w * 0.3, 0.3, 0.45);
  const front = d / 2 - 0.04;
  // drawer pedestal on the right
  p.rbox([w / 2 - pw, 0, -d / 2 + 0.02], [w / 2 - 0.01, h - topT, front], darken(body, 0.05), 0.008, { seg: 1 });
  fronts(p, {
    x0: w / 2 - pw + 0.01,
    x1: w / 2 - 0.02,
    y0: 0.03,
    y1: h - topT - 0.01,
    z: front,
    t: 0.018,
    hd: 0.02,
    cols: 1,
    rows: [
      { weight: 1, kind: "drawer" },
      { weight: 1, kind: "drawer" },
      { weight: 1.4, kind: "drawer" },
    ],
    color: body,
    handleColor: palette.charcoal,
  });
  // left: a panel leg
  p.rbox([-w / 2 + 0.01, 0, -d / 2 + 0.02], [-w / 2 + 0.04, h - topT, d / 2 - 0.04], darken(body, 0.05), 0.008, { seg: 1 });
  p.box([-w / 2 + 0.04, h * 0.45, -d / 2 + 0.03], [w / 2 - pw, h - topT, -d / 2 + 0.045], darken(color, 0.12));
  return p;
};
