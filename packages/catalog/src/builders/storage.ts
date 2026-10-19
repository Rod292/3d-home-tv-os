import { rng } from "../parts";
import { type Build, type Ctx, Parts, clamp, darken, lighten, palette, legs, cornerPts, fronts, colsFor, ACCENTS, type FrontRow } from "./common";

const HANDLE = palette.charcoal;

interface CabinetOpts {
  base: "plinth" | "legs";
  rows: (c: Ctx, bodyH: number) => FrontRow[];
  cols: (c: Ctx) => number;
  handle: "bar" | "knob" | "long" | "none";
  topColor?: string;
  topT?: number;
  topOverhang?: boolean;
  legH?: number;
}

/** Generic box cabinet: base (plinth/legs), carcass, top slab, front grid. */
function cabinet(c: Ctx, o: CabinetOpts): Parts {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = o.topT ?? clamp(h * 0.03, 0.018, 0.03);
  const hd = o.handle === "none" ? 0 : 0.02;
  const ft = 0.018;
  const zFront = d / 2 - hd - ft;
  const baseH = o.base === "plinth" ? clamp(h * 0.06, 0.03, 0.1) : (o.legH ?? clamp(h * 0.16, 0.06, 0.18));
  if (o.base === "plinth") {
    p.box([-w / 2 + 0.02, 0, -d / 2 + 0.02], [w / 2 - 0.02, baseH + 0.005, zFront - 0.03], darken(color, 0.5));
  } else {
    const ls = clamp(Math.min(w, d) * 0.07, 0.03, 0.045);
    legs(p, cornerPts(-w / 2, w / 2, -d / 2, zFront, ls, 0.03), 0, baseH + 0.005, ls, palette.woodDark, "taper");
  }
  const topC = o.topColor ?? lighten(color, 0.12);
  const sideInset = o.topOverhang ? 0.012 : 0;
  p.rbox([-w / 2 + sideInset, baseH, -d / 2], [w / 2 - sideInset, h - topT + 0.002, zFront], color, 0.01, { seg: 1 });
  p.rbox([-w / 2, h - topT, -d / 2], [w / 2, h, d / 2], topC, Math.min(0.008, topT / 2), { seg: 1 });
  fronts(p, {
    x0: -w / 2 + sideInset + 0.008,
    x1: w / 2 - sideInset - 0.008,
    y0: baseH + 0.006,
    y1: h - topT - 0.004,
    z: zFront,
    t: ft,
    hd: Math.max(hd, 0.001),
    cols: o.cols(c),
    rows: o.rows(c, h - topT - baseH),
    color: lighten(color, 0.06),
    handleColor: HANDLE,
    handle: o.handle,
  });
  return p;
}

export const storageCabinet: Build = (c) =>
  cabinet(c, {
    base: "plinth",
    handle: "knob",
    cols: (c) => colsFor(c.w, 0.5),
    rows: (_c, bh) => (bh > 1.1 ? [{ weight: 1, kind: "door" }, { weight: 1, kind: "door" }] : [{ weight: 1, kind: "door" }]),
  });

export const storageDresser: Build = (c) =>
  cabinet(c, {
    base: "legs",
    handle: "bar",
    cols: (c) => (c.w > 1.1 ? 2 : 1),
    rows: (_c, bh) => {
      const n = clamp(Math.round(bh / 0.22), 2, 7);
      return Array.from({ length: n }, (_, i) => ({ weight: i === 0 ? 0.85 : 1, kind: "drawer" as const }));
    },
  });

export const storageSideboard: Build = (c) =>
  cabinet(c, {
    base: "legs",
    handle: "long",
    legH: clamp(c.h * 0.2, 0.08, 0.22),
    topColor: palette.woodLight,
    cols: (c) => colsFor(c.w, 0.45),
    rows: () => [{ weight: 1, kind: "door" }],
  });

/** Kitchen base cabinet with countertop, recessed toe-kick, drawer row + doors. */
export const storageKitchen: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const topT = clamp(h * 0.045, 0.025, 0.045);
  const kick = clamp(h * 0.11, 0.05, 0.12);
  const zFront = d / 2 - 0.03 - 0.02 - 0.018; // counter overhang + handle + front thickness
  p.box([-w / 2 + 0.005, 0, -d / 2 + 0.02], [w / 2 - 0.005, kick + 0.005, zFront - 0.06], palette.charcoal);
  p.rbox([-w / 2 + 0.003, kick, -d / 2], [w / 2 - 0.003, h - topT + 0.002, zFront], darken(color, 0.08), 0.006, { seg: 1 });
  p.rbox([-w / 2, h - topT, -d / 2], [w / 2, h, d / 2], palette.stone, Math.min(0.01, topT / 2), { seg: 1 });
  // backsplash strip (thin, at the very back, under the top surface level)
  const cols = colsFor(w, 0.6, 10);
  const bodyH = h - topT - kick;
  fronts(p, {
    x0: -w / 2 + 0.006,
    x1: w / 2 - 0.006,
    y0: kick + 0.005,
    y1: h - topT - 0.004,
    z: zFront,
    t: 0.018,
    hd: 0.02,
    cols,
    rows: bodyH > 0.45 ? [{ weight: 0.22, kind: "drawer" }, { weight: 0.78, kind: "door" }] : [{ weight: 1, kind: "door" }],
    color,
    handleColor: palette.steel,
    handle: "long",
  });
  return p;
};

/* ---------------------------------------------------------------- wardrobe */

export const wardrobeHinged: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const plinth = clamp(h * 0.04, 0.04, 0.09);
  const cornice = clamp(h * 0.03, 0.03, 0.06);
  const zFront = d / 2 - 0.02 - 0.02;
  p.box([-w / 2 + 0.02, 0, -d / 2 + 0.02], [w / 2 - 0.02, plinth + 0.005, zFront - 0.02], darken(color, 0.45));
  p.rbox([-w / 2 + 0.01, plinth, -d / 2], [w / 2 - 0.01, h - cornice + 0.002, zFront], color, 0.01, { seg: 1 });
  p.rbox([-w / 2, h - cornice, -d / 2], [w / 2, h, d / 2], lighten(color, 0.12), 0.01, { seg: 1 });
  const cols = colsFor(w, 0.5, 8);
  fronts(p, {
    x0: -w / 2 + 0.015,
    x1: w / 2 - 0.015,
    y0: plinth + 0.006,
    y1: h - cornice - 0.006,
    z: zFront,
    t: 0.02,
    hd: 0.02,
    cols,
    rows: h > 2.1 ? [{ weight: 0.18, kind: "door" }, { weight: 0.82, kind: "door" }] : [{ weight: 1, kind: "door" }],
    color: lighten(color, 0.05),
    handleColor: HANDLE,
    handle: "bar",
  });
  return p;
};

export const wardrobeSliding: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const plinth = clamp(h * 0.03, 0.03, 0.06);
  const top = clamp(h * 0.03, 0.03, 0.06);
  const n = w > 1.9 ? 3 : 2;
  p.rbox([-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.05], color, 0.01, { seg: 1 });
  const pw = (w - 0.03) / n;
  for (let i = 0; i < n; i++) {
    const z0 = i % 2 === 0 ? d / 2 - 0.05 : d / 2 - 0.025;
    const x0 = -w / 2 + 0.015 + i * pw - (i > 0 ? 0.01 : 0);
    const x1 = x0 + pw + (i > 0 && i < n - 1 ? 0.02 : 0.01);
    const mirror = n === 3 ? i === 1 : i === 0;
    p.rbox([x0, plinth, z0], [Math.min(x1, w / 2 - 0.015), h - top, z0 + 0.025], mirror ? "#cfe3ea" : lighten(color, 0.08), 0.006, {
      seg: 1,
      ...(mirror ? { role: "mirror" as const } : {}),
    });
    // vertical pull strip
    const sx = i === 0 ? Math.min(x1, w / 2) - 0.05 : x0 + 0.05;
    p.box([sx - 0.008, h * 0.3, z0 + 0.025], [sx + 0.008, h * 0.7, z0 + 0.03], HANDLE);
  }
  return p;
};

/* ------------------------------------------------------------------ shelves */

const BOOKS = [palette.terracotta, palette.sage, palette.slate, palette.mustard, palette.cream, palette.blush, palette.slateDark, palette.sageDark, "#e9d8b9"];

/** Fills a compartment with books / a decorative item. Returns nothing; adds to `p`. */
function fillCompartment(p: Parts, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rand: () => number, budget: { n: number }): void {
  const H = y1 - y0;
  if (H < 0.12 || x1 - x0 < 0.1) return;
  const r = rand();
  if (r < 0.15) return; // empty compartment, breathing room
  if (r < 0.3) {
    // vase / ball
    const vr = Math.min((x1 - x0) * 0.18, H * 0.3, (z1 - z0) * 0.35);
    const cx = x0 + (x1 - x0) * (0.3 + rand() * 0.4);
    p.cyl(cx, (z0 + z1) / 2, y0, y0 + Math.min(H * 0.6, vr * 2.6), vr, vr, ACCENTS[Math.floor(rand() * 4)] ?? palette.terracotta, { seg: 10, taper: 0.7 });
    return;
  }
  let x = x0 + 0.01 + rand() * (x1 - x0) * 0.15;
  const end = x1 - 0.01 - (rand() < 0.5 ? (x1 - x0) * rand() * 0.35 : 0);
  while (x < end && budget.n > 0) {
    const bw = 0.02 + rand() * 0.03;
    if (x + bw > end) break;
    const bh = Math.min(H - 0.01, H * (0.6 + rand() * 0.32));
    const bd = (z1 - z0) * (0.75 + rand() * 0.2);
    p.box([x, y0, z0], [x + bw, y0 + bh, z0 + bd], BOOKS[Math.floor(rand() * BOOKS.length)] ?? palette.cream);
    x += bw + 0.002;
    budget.n--;
  }
}

export const shelfBookcase: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const t = clamp(Math.min(w, h) * 0.025, 0.015, 0.025);
  const plinth = clamp(h * 0.04, 0.03, 0.07);
  const rand = rng(c.seed);
  const budget = { n: 130 };
  const back = darken(color, 0.12);
  // carcass
  p.box([-w / 2, 0, -d / 2], [-w / 2 + t, h, d / 2], color);
  p.box([w / 2 - t, 0, -d / 2], [w / 2, h, d / 2], color);
  p.box([-w / 2 + t, h - t, -d / 2], [w / 2 - t, h, d / 2], color);
  p.box([-w / 2 + t, 0, -d / 2 + 0.01], [w / 2 - t, plinth, d / 2 - 0.01], darken(color, 0.25));
  p.box([-w / 2 + t, plinth, -d / 2], [w / 2 - t, h - t, -d / 2 + 0.008], back);
  const cols = colsFor(w - 2 * t, 0.8, 4);
  const rows = clamp(Math.round((h - plinth - t) / 0.34), 1, 9);
  const cw = (w - 2 * t - (cols - 1) * t) / cols;
  const rh = (h - plinth - t - (rows - 1) * t) / rows;
  for (let j = 1; j < cols; j++) {
    const x = -w / 2 + t + j * cw + (j - 1) * t;
    p.box([x, plinth, -d / 2 + 0.008], [x + t, h - t, d / 2 - 0.005], color);
  }
  for (let i = 0; i < rows; i++) {
    const y0 = plinth + i * (rh + t);
    if (i > 0) p.box([-w / 2 + t, y0 - t, -d / 2 + 0.008], [w / 2 - t, y0, d / 2 - 0.005], color);
    for (let j = 0; j < cols; j++) {
      const x0 = -w / 2 + t + j * (cw + t);
      fillCompartment(p, x0, x0 + cw, y0, y0 + rh, -d / 2 + 0.01, d / 2 - 0.02, rand, budget);
    }
  }
  return p;
};

export const shelfCube: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const t = clamp(Math.min(w, h) * 0.04, 0.02, 0.04);
  const cols = clamp(Math.round((w - t) / 0.37), 1, 6);
  const rows = clamp(Math.round((h - t) / 0.37), 1, 6);
  const cw = (w - t) / cols;
  const rh = (h - t) / rows;
  const rand = rng(c.seed + 7);
  const budget = { n: 70 };
  for (let j = 0; j <= cols; j++) {
    const x = -w / 2 + j * cw;
    p.box([x, 0, -d / 2], [x + t, h, d / 2], color);
  }
  for (let i = 0; i <= rows; i++) {
    const y = i * rh;
    p.box([-w / 2 + t, y, -d / 2], [w / 2 - t, y + t, d / 2], color);
  }
  p.box([-w / 2 + t, t, -d / 2], [w / 2 - t, h - t, -d / 2 + 0.006], darken(color, 0.1));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const x0 = -w / 2 + j * cw + t;
      const x1 = x0 + cw - t;
      const y0 = i * rh + t;
      const y1 = y0 + rh - t;
      const r = rand();
      if (r < 0.35) {
        // fabric basket
        p.rbox([x0 + 0.015, y0, -d / 2 + 0.02], [x1 - 0.015, y1 - 0.03, d / 2 - 0.01], ACCENTS[Math.floor(rand() * ACCENTS.length)] ?? palette.sage, 0.02, { seg: 1 });
      } else {
        fillCompartment(p, x0, x1, y0, y1, -d / 2 + 0.01, d / 2 - 0.02, rand, budget);
      }
    }
  }
  return p;
};

/* ------------------------------------------------------- nightstand, tvStand */

export const nightstand: Build = (c) =>
  cabinet(c, {
    base: "legs",
    handle: "knob",
    legH: clamp(c.h * 0.22, 0.06, 0.16),
    cols: () => 1,
    rows: (_c, bh) => (bh > 0.32 ? [{ weight: 1, kind: "drawer" }, { weight: 1, kind: "drawer" }] : [{ weight: 1, kind: "drawer" }]),
  });

export const tvStand: Build = (c) => {
  const cols = colsFor(c.w, 0.5, 6);
  const rows: FrontRow[] = [
    {
      weight: 1,
      kind: "door",
      cols,
      // open media niche(s) in the middle
      openCols: cols >= 3 ? (cols % 2 === 1 ? [(cols - 1) / 2] : [cols / 2 - 1, cols / 2]) : [],
    },
  ];
  const p = cabinet(c, {
    base: "legs",
    handle: "knob",
    legH: clamp(c.h * 0.22, 0.06, 0.14),
    topColor: palette.woodLight,
    cols: () => cols,
    rows: () => rows,
  });
  return p;
};
