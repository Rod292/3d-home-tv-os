/** Wall display shelf with a collection, hi-fi speakers and desk computers. */
import { rng } from "../parts";
import { type Build, Parts, clamp, darken, lighten, palette } from "./common";

const BOOKS = [palette.slateDark, palette.terracotta, palette.cream, palette.sage, palette.mustard, "#2f3d55", "#e9d8b9"];
const BODY_BLACK = "#232327";
const BODY_SILVER = "#c9cbcd";

/* --------------------------------------------------------------- wall shelf */

/**
 * Long wall-mounted plank on L brackets (back against the wall, z = -d/2). `position.y` is the
 * bottom of the brackets; the plank sits on top of them and the collection rises up to `h`.
 */
function wallShelf(collection: boolean): Build {
  return (c) => {
    const p = new Parts();
    const { w, h, d, color, seed } = c;
    const t = clamp(d * 0.12, 0.018, 0.03);
    const bracketH = clamp(h * 0.3, 0.06, 0.16);
    const top = bracketH + t; // plank top
    const metal = "#ecebe7";
    p.box([-w / 2, bracketH, -d / 2], [w / 2, top, d / 2], color);
    p.box([-w / 2, bracketH - 0.002, -d / 2], [w / 2, bracketH, d / 2], darken(color, 0.12));
    // L brackets every ~40 cm
    const n = clamp(Math.round(w / 0.4) + 1, 2, 16);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.06 + ((w - 0.12) * i) / (n - 1);
      p.box([x - 0.012, 0, -d / 2], [x + 0.012, bracketH, -d / 2 + 0.01], metal);
      p.box([x - 0.012, bracketH - 0.012, -d / 2], [x + 0.012, bracketH, -d / 2 + d * 0.75], metal);
      p.add({ kind: "box", size: [0.006, bracketH * 0.9, 0.006] }, [x, bracketH * 0.45, -d / 2 + d * 0.3], metal, { rot: [-0.7, 0, 0] });
    }
    if (!collection || h - top < 0.08) {
      p.box([-w / 2, top, -d / 2], [-w / 2 + 0.01, h, -d / 2 + 0.01], color); // keeps the declared height
      return p;
    }
    const rand = rng(seed + 11);
    const H = h - top;
    const z0 = -d / 2 + 0.02;
    const z1 = d / 2 - 0.02;
    const zc = (z0 + z1) / 2;
    // the big framed photo defines the top of the box
    const fw = Math.min(H * 1.25, w * 0.22);
    const fx = -w * 0.08;
    p.rbox([fx - fw / 2, top, -d / 2 + 0.01], [fx + fw / 2, h, -d / 2 + 0.035], lighten(color, 0.05), 0.004, { seg: 1 });
    p.box([fx - fw / 2 + 0.03, top + 0.03, -d / 2 + 0.036], [fx + fw / 2 - 0.03, h - 0.03, -d / 2 + 0.037], "#f5f0e6");
    p.box([fx - fw / 2 + 0.06, top + 0.06, -d / 2 + 0.038], [fx + fw / 2 - 0.06, h - 0.06, -d / 2 + 0.039], "#d8a86d");
    p.box([fx - fw / 2 + 0.06, top + (H - 0.12) * 0.55 + 0.06, -d / 2 + 0.039], [fx + fw / 2 - 0.06, h - 0.06, -d / 2 + 0.04], "#9cc3d9");
    // walk along the plank and place objects, skipping the frame
    let x = -w / 2 + 0.02;
    const end = w / 2 - 0.02;
    let k = 0;
    while (x < end) {
      if (x > fx - fw / 2 - 0.02 && x < fx + fw / 2 + 0.02) {
        x = fx + fw / 2 + 0.03;
        continue;
      }
      // books at the left end, magazines at the right end, mostly cameras in between (a collection)
      const r = rand();
      const pick = k++ === 0 || x > end - 0.18 ? 0 : r < 0.62 ? 1 : r < 0.75 ? 3 : 4;
      let used = 0.06;
      if (pick === 0) {
        // books standing up (left end) or a magazine stack
        const nb = 3 + Math.floor(rand() * 4);
        let bx = x;
        for (let i = 0; i < nb; i++) {
          const bw = 0.025 + rand() * 0.02;
          if (bx + bw > end) break;
          const bh = Math.min(H * 0.95, 0.16 + rand() * 0.08);
          p.box([bx, top, z0], [bx + bw, top + bh, z0 + Math.min(0.16, z1 - z0)], BOOKS[Math.floor(rand() * BOOKS.length)] ?? palette.cream);
          bx += bw + 0.003;
        }
        used = bx - x + 0.03;
      } else if (pick === 1) {
        // camera: body + lens (+ maybe a long tele lens), black or silver
        const body = rand() < 0.3 ? BODY_SILVER : BODY_BLACK;
        const bw = 0.11 + rand() * 0.03;
        if (x + bw > end) break;
        const bh = Math.min(H * 0.8, 0.075);
        p.rbox([x, top, zc - 0.03], [x + bw, top + bh, zc + 0.03], body, 0.008, { seg: 1 });
        p.box([x + 0.008, top + bh * 0.82, zc - 0.03], [x + bw * 0.4, top + bh, zc + 0.03], body === BODY_BLACK ? BODY_SILVER : BODY_BLACK);
        const lr = Math.min(bh * 0.38, 0.028);
        const ll = rand() < 0.35 ? 0.13 : 0.05;
        p.cylZ(x + bw / 2, top + bh * 0.45, zc + 0.03, Math.min(z1, zc + 0.03 + ll), lr, lr, BODY_BLACK, { seg: 12 });
        p.cylZ(x + bw / 2, top + bh * 0.45, Math.min(z1, zc + 0.03 + ll) - 0.004, Math.min(z1, zc + 0.03 + ll), lr * 0.8, lr * 0.8, "#3b4f63", { seg: 12 });
        used = bw + 0.02;
      } else if (pick === 3) {
        // small framed picture leaning on the wall
        const pw = 0.09 + rand() * 0.06;
        if (x + pw > end) break;
        const ph = Math.min(H * 0.85, pw * 1.3);
        p.box([x, top, -d / 2 + 0.01], [x + pw, top + ph, -d / 2 + 0.025], rand() < 0.5 ? palette.woodDark : BODY_BLACK);
        p.box([x + 0.012, top + 0.012, -d / 2 + 0.026], [x + pw - 0.012, top + ph - 0.012, -d / 2 + 0.027], [palette.blush, palette.sage, palette.slate][Math.floor(rand() * 3)] ?? palette.sage);
        used = pw + 0.02;
      } else {
        // figurine / small plant
        const r = 0.025 + rand() * 0.015;
        if (x + 2 * r > end) break;
        if (rand() < 0.5) {
          p.cyl(x + r, zc, top, top + Math.min(H * 0.4, r * 1.6), r, r * 0.8, palette.terracotta, { seg: 10 });
          p.sphere([x + r, top + Math.min(H * 0.4, r * 1.6) + r * 0.9, zc], [r * 1.3, r * 1.1, r * 1.3], palette.sageDark, { seg: 8 });
        } else {
          p.rbox([x, top, zc - r], [x + 2 * r, top + Math.min(H * 0.5, r * 2.4), zc + r], palette.mustard, r * 0.6, { seg: 1 });
        }
        used = 2 * r + 0.02;
      }
      x += used + rand() * 0.04;
    }
    return p;
  };
}
export const wallShelfCollection = wallShelf(true);
export const wallShelfPlain = wallShelf(false);

/* ------------------------------------------------------------------ speaker */

/** Bookshelf speaker: cabinet, front baffle with woofer + tweeter (front = +Z). */
function speaker(cone: string | null): Build {
  return (c) => {
    const p = new Parts();
    const { w, h, d, color } = c;
    p.rbox([-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.006], color, Math.min(0.01, w * 0.08), { seg: 1 });
    p.box([-w / 2 + 0.008, 0.008, d / 2 - 0.006], [w / 2 - 0.008, h - 0.008, d / 2], darken(color, 0.25));
    const R = Math.min(w * 0.36, h * 0.2);
    const wy = h * 0.36;
    const coneCol = cone ?? darken(color, 0.5);
    p.add({ kind: "torus", R: R * 0.92, r: R * 0.1, seg: 20 }, [0, wy, d / 2], palette.ink);
    p.cylZ(0, wy, d / 2 - 0.004, d / 2, R * 0.85, R * 0.85, coneCol, { seg: 20 });
    p.cylZ(0, wy, d / 2 - 0.002, d / 2, R * 0.25, R * 0.25, darken(coneCol, 0.3), { seg: 12 });
    p.cylZ(0, h * 0.75, d / 2 - 0.003, d / 2, R * 0.32, R * 0.32, palette.steel, { seg: 12 });
    return p;
  };
}
export const speakerBookshelf = speaker(null);
export const speakerAccent = speaker("#e07a2e");

/**
 * HomePod mini: mesh-fabric sphere flattened top and bottom (≈ 98 × 84 mm), a dark touch panel on top
 * whose center disc has role "glow" (the colorful swirl when it plays, driven by the Maison mode).
 */
export const speakerHomePodMini: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const top = h * 0.985;
  // Sphere profile cut so that the flat top / bottom are half the diameter (r(top) = 0.5).
  const rv = h / 2 / Math.sqrt(0.75);
  const rAt = (y: number) => Math.sqrt(Math.max(0, 1 - ((y - h / 2) / rv) ** 2));
  const n = 14;
  const pts: [number, number][] = [[0, 0]];
  for (let i = 0; i <= n; i++) {
    const y = (top * i) / n;
    pts.push([rAt(y), y]);
  }
  pts.push([0, top]);
  p.add({ kind: "lathe", pts, seg: 32 }, [0, 0, 0], color, { scale: [w / 2, 1, d / 2] });
  // seam ring around the equator (the fabric has a faint horizontal band)
  p.add({ kind: "lathe", pts: [[1.004, h * 0.47], [1.004, h * 0.53]], seg: 32 }, [0, 0, 0], darken(color, 0.08), { scale: [w / 2, 1, d / 2] });
  const flat = rAt(top);
  p.cyl(0, 0, top - 0.002, h - h * 0.012, (w / 2) * flat * 0.97, (d / 2) * flat * 0.97, darken(color, 0.55), { seg: 28 });
  p.cyl(0, 0, top - 0.002, h, (w / 2) * flat * 0.62, (d / 2) * flat * 0.62, "#34363c", { seg: 28, role: "glow" });
  // + / − marks of the touch panel
  const mark = Math.min(w, d) * 0.07;
  for (const sx of [-1, 1]) p.box([sx * w * 0.19 - mark / 2, h - h * 0.012, -0.0012], [sx * w * 0.19 + mark / 2, h - h * 0.006, 0.0012], lighten(color, 0.35));
  p.box([w * 0.19 - 0.0012, h - h * 0.012, -mark / 2], [w * 0.19 + 0.0012, h - h * 0.006, mark / 2], lighten(color, 0.35));
  // small dark foot
  p.cyl(0, 0, 0, h * 0.03, (w / 2) * flat * 0.8, (d / 2) * flat * 0.8, "#1c1c1e", { seg: 20 });
  return p;
};

/* --------------------------------------------------------- desk computers */

/** Monitor on an articulated arm clamped at the back edge of the desk (front = +Z). */
export const monitorArm: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const zb = -d / 2;
  const screenT = clamp(d * 0.12, 0.012, 0.03);
  const sy0 = h * 0.4;
  p.box([-0.03, 0, zb], [0.03, 0.05, zb + 0.06], darken(color, 0.2)); // clamp
  p.cyl(0, zb + 0.03, 0.05, h * 0.55, 0.012, 0.012, color, { seg: 8 }); // pole
  p.add({ kind: "tube", path: [[0, h * 0.5, zb + 0.03], [0, h * 0.55, (zb + d / 2) / 2], [0, sy0 + (h - sy0) * 0.4, d / 2 - screenT - 0.02]], r: 0.012, seg: 6, steps: 8 }, [0, 0, 0], color);
  p.rbox([-w / 2, sy0, d / 2 - screenT], [w / 2, h, d / 2], BODY_BLACK, 0.008, { seg: 1 });
  p.box([-w / 2 + 0.008, sy0 + 0.008, d / 2 - 0.001], [w / 2 - 0.008, h - 0.008, d / 2], "#2c3e50", { role: "screen" });
  return p;
};

/** Open laptop: base slab and a lid standing at the back (front = +Z). */
export const laptop: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const baseT = Math.min(0.018, h * 0.15);
  const lidT = Math.min(0.008, d * 0.05);
  p.rbox([-w / 2, 0, -d / 2], [w / 2, baseT, d / 2], color, 0.006, { seg: 1 });
  p.box([-w / 2 + 0.02, baseT, -d / 2 + 0.03], [w / 2 - 0.02, baseT + 0.001, d * 0.1], darken(color, 0.35)); // keyboard
  p.box([-w * 0.15, baseT, d * 0.18], [w * 0.15, baseT + 0.001, d / 2 - 0.02], darken(color, 0.12)); // trackpad
  p.rbox([-w / 2, baseT, -d / 2], [w / 2, h, -d / 2 + lidT], color, 0.005, { seg: 1 });
  p.box([-w / 2 + 0.012, baseT + 0.012, -d / 2 + lidT], [w / 2 - 0.012, h - 0.01, -d / 2 + lidT + 0.001], "#22303d", { role: "screen" });
  return p;
};

/* ------------------------------------------------------------ hi-fi shelf */

/**
 * Open black-metal shelf with dark wood boards, filled like the reference apartment's (bottom → top): two levels of books
 * and a photo, the amplifier, the turntable with its dust cover and records, and a flip clock on top.
 */
export const shelfHifi: Build = (c) => {
  const p = new Parts();
  const { w, h, d, seed } = c;
  const rand = rng(seed + 29);
  const metal = "#1f2023";
  const wood = "#5b4030";
  const post = clamp(Math.min(w, d) * 0.04, 0.012, 0.025);
  const t = clamp(h * 0.015, 0.012, 0.02);
  const clockH = clamp(h * 0.075, 0.05, 0.11);
  const topY = h - clockH - t; // top board: the clock stands on it and reaches h
  const boards = [0.04 * h, 0.25 * h, 0.44 * h, 0.62 * h, topY];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
    p.box([sx * (w / 2) - (sx > 0 ? post : 0), 0, sz * (d / 2) - (sz > 0 ? post : 0)], [sx * (w / 2) + (sx < 0 ? post : 0), topY + t, sz * (d / 2) + (sz < 0 ? post : 0)], metal);
  for (const y of boards) p.box([-w / 2 + post, y, -d / 2 + post * 0.5], [w / 2 - post, y + t, d / 2 - post * 0.5], wood);
  const x0 = -w / 2 + post + 0.01;
  const x1 = w / 2 - post - 0.01;
  const z0 = -d / 2 + 0.02;
  const z1 = d / 2 - 0.03;

  // 1–2: books (upright rows + a lying stack) and a small framed photo
  for (const [i, y] of [boards[0]!, boards[1]!].entries()) {
    const top = y + t;
    const H = boards[i + 1]! - top - 0.01;
    let x = x0;
    const split = x0 + (x1 - x0) * (0.55 + rand() * 0.15);
    while (x < split) {
      const bw = 0.022 + rand() * 0.025;
      if (x + bw > split) break;
      p.box([x, top, z0], [x + bw, top + H * (0.72 + rand() * 0.25), z0 + (z1 - z0) * (0.75 + rand() * 0.2)], BOOKS[Math.floor(rand() * BOOKS.length)] ?? palette.cream);
      x += bw + 0.002;
    }
    let y2 = top;
    while (y2 < top + H * 0.75) {
      const bh = 0.025 + rand() * 0.02;
      p.box([split + 0.01, y2, z0], [x1 - rand() * 0.03, y2 + bh, z0 + (z1 - z0) * (0.8 + rand() * 0.15)], BOOKS[Math.floor(rand() * BOOKS.length)] ?? palette.slate);
      y2 += bh + 0.002;
    }
    if (i === 1) {
      const fw = Math.min(0.12, (x1 - split) * 0.7);
      p.box([split + 0.02, y2, z0 + 0.01], [split + 0.02 + fw, y2 + Math.min(H * 0.22, fw * 0.8), z0 + 0.03], palette.woodDark);
      p.box([split + 0.03, y2 + 0.01, z0 + 0.031], [split + 0.01 + fw, y2 + Math.min(H * 0.22, fw * 0.8) - 0.01, z0 + 0.032], palette.blush);
    }
  }

  // 3: the amplifier (black, display + volume knob on the front)
  {
    const top = boards[2]! + t;
    const ah = Math.min(0.13, (boards[3]! - top) * 0.75);
    const aw = (x1 - x0) * 0.85;
    const ax0 = x0 + 0.005;
    p.rbox([ax0, top, z0], [ax0 + aw, top + ah, z1], "#17181b", 0.006, { seg: 1 });
    p.box([ax0 + aw * 0.08, top + ah * 0.55, z1], [ax0 + aw * 0.45, top + ah * 0.78, z1 + 0.002], "#ffb35c", { role: "screen" });
    p.cylZ(ax0 + aw * 0.78, top + ah * 0.5, z1, z1 + 0.012, ah * 0.28, ah * 0.28, "#3a3c40", { seg: 18 });
    for (let k = 0; k < 6; k++) p.box([ax0 + aw * (0.1 + k * 0.07), top + ah * 0.2, z1], [ax0 + aw * (0.14 + k * 0.07), top + ah * 0.3, z1 + 0.003], "#8d9096");
  }

  // 4: turntable (black plinth, record, silver tonearm, smoked dust cover) + records on the right
  {
    const top = boards[3]! + t;
    const room = topY - top;
    const tw = (x1 - x0) * 0.78;
    const tx0 = x0;
    const ph = Math.min(0.07, room * 0.3);
    p.rbox([tx0, top, z0], [tx0 + tw, top + ph, z1], "#1b1c1f", 0.008, { seg: 1 });
    const cx = tx0 + tw * 0.42;
    const cz = (z0 + z1) / 2;
    const r = Math.min(tw * 0.36, (z1 - z0) * 0.42);
    p.cyl(cx, cz, top + ph, top + ph + 0.008, r, r, "#2c2d31", { seg: 28 });
    p.cyl(cx, cz, top + ph + 0.008, top + ph + 0.011, r * 0.95, r * 0.95, "#0f0f11", { seg: 28 });
    p.cyl(cx, cz, top + ph + 0.011, top + ph + 0.012, r * 0.32, r * 0.32, palette.terracotta, { seg: 20 });
    p.cylX(tx0 + tw * 0.62, tx0 + tw * 0.9, top + ph + 0.025, cz + r * 0.6, 0.004, "#c9ccd1", { seg: 6 });
    p.box([tx0 + 0.005, top + ph, z0 + 0.005], [tx0 + tw - 0.005, top + Math.min(room * 0.75, ph + 0.11), z1 - 0.005], "#cfd8e0", { role: "glass" });
    for (let k = 0; k < 4; k++) {
      const rx = tx0 + tw + 0.012 + k * 0.012;
      if (rx + 0.008 > x1) break;
      p.box([rx, top, z0 + 0.01], [rx + 0.008, top + Math.min(room * 0.85, 0.31), z1 - 0.01], k % 2 ? "#232327" : "#3b2e4f");
    }
  }

  // top: Twemco-style flip clock (cream case, two dark flaps) + a few small objects
  {
    const top = topY + t;
    const cw = Math.min(0.17, (x1 - x0) * 0.4);
    const cx0 = x0 + (x1 - x0) * 0.25;
    const cd = Math.min(0.08, (z1 - z0) * 0.5);
    const cz0 = (z0 + z1) / 2 - cd / 2;
    p.rbox([cx0, top, cz0], [cx0 + cw, h, cz0 + cd], "#efe7d4", 0.01, { seg: 1 });
    for (const k of [0, 1]) p.box([cx0 + cw * (0.1 + k * 0.42), top + clockH * 0.18, cz0 + cd], [cx0 + cw * (0.48 + k * 0.42), h - clockH * 0.18, cz0 + cd + 0.002], "#1e1f22", { role: "screen" });
    p.box([cx0 + cw * 0.12, top + clockH * 0.49, cz0 + cd + 0.002], [cx0 + cw * 0.88, top + clockH * 0.51, cz0 + cd + 0.003], "#555");
    p.box([x1 - 0.1, top, z0 + 0.01], [x1 - 0.02, top + clockH * 0.9, z0 + 0.09], "#f2f2f0");
    p.rbox([x0, top, z0 + 0.02], [x0 + 0.09, top + clockH * 0.45, z0 + 0.06], "#6fbf4a", 0.01, { seg: 1 });
  }
  return p;
};
