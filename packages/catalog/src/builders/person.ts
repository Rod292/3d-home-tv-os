/**
 * Stylized people ("person" category): friendly, rounded cartoon figures in the dollhouse art
 * direction (toon shaded, no realistic face: two dot eyes, blush and a tiny smile).
 *
 * Frame (all variants): standard local frame — origin at the center of the footprint ON THE FLOOR,
 * y up, the person faces +Z.
 *
 * SITTING CONVENTION ("person/sitting", "person/sitting-relaxed"): feet flat on the floor at y = 0,
 * buttocks / thigh undersides at ≈ 0.34·h (0.44 m at the default 1.30 m height, i.e. a standard
 * sofa / armchair seat), the back of the figure at z = -d/2. To seat someone, give the item the
 * seat's rotationY, position.y = 0 (floor) and put the back of its footprint against the front
 * of the backrest cushion (equivalently: knees ≈ d/2 − 0.18 m in front of the item center).
 * The model simply overlaps the cushions a little — no exact seat height needed (0.40–0.48 m ok).
 *
 * Appearance comes from `item.attributes` (all optional, free-form strings):
 *   skin, hair, top, bottom, shoes, headwearColor, glassesColor: hex colors ("#rrggbb")
 *   hairStyle: "short" | "long" | "bun"         bottomStyle: "pants" | "shorts" | "skirt"
 *   headwear: "none" | "cap" | "bandana"        glasses: "none" | "on-cap" | "on-shirt"
 * `item.color` is the t-shirt color when `top` is absent.
 *
 * Bodies are authored at a nominal size (meters) and remapped onto the exact item box (fitToBox).
 */
import { luminance, mix, normalizeHex } from "../color";
import type { V3 } from "../parts";
import { type Build, type Ctx, Parts, darken, fitToBox, lighten } from "./common";

export interface PersonLook {
  skin: string;
  hair: string;
  hairStyle: "short" | "long" | "bun";
  top: string;
  bottom: string;
  bottomStyle: "pants" | "shorts" | "skirt";
  headwear: "none" | "cap" | "bandana";
  headwearColor: string;
  glasses: "none" | "on-cap" | "on-shirt";
  glassesColor: string;
  shoes: string;
}

/** Ready-made `attributes` for the scenes we ship (also shown in the gallery). */
export const PERSON_PRESETS = {
  /** Tall young man: grey cap with orange mirrored sunglasses on it, brown tee, navy shorts. */
  tallYoungMan: {
    skin: "#efc9a8",
    hair: "#3b2a20",
    hairStyle: "short",
    headwear: "cap",
    headwearColor: "#8e8a86",
    glasses: "on-cap",
    glassesColor: "#e2622b",
    top: "#6b4a32",
    bottom: "#3c4250",
    bottomStyle: "shorts",
    shoes: "#f4f2ee",
  },
  /** Young woman: long dark hair, patterned green bandana, white tee with sunglasses hooked on it, long brown skirt. */
  youngWoman: {
    skin: "#f0cdb0",
    hair: "#2a1d18",
    hairStyle: "long",
    headwear: "bandana",
    headwearColor: "#2f4a33",
    glasses: "on-shirt",
    glassesColor: "#5a3a26",
    top: "#f2efe9",
    bottom: "#4a3426",
    bottomStyle: "skirt",
    shoes: "#efe9df",
  },
} as const satisfies Record<string, Record<string, string>>;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
function hex(v: string | undefined, fallback: string): string {
  return v && HEX.test(v.trim()) ? normalizeHex(v.trim().startsWith("#") ? v.trim() : `#${v.trim()}`) : fallback;
}
function pick<T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T {
  const s = v?.trim().toLowerCase();
  return (allowed as readonly string[]).includes(s ?? "") ? (s as T) : fallback;
}

/** Resolved look from attributes + item color (pure). */
export function personLook(attrs: Readonly<Record<string, string>>, color: string): PersonLook {
  const a = attrs;
  return {
    skin: hex(a.skin, "#f1c7a5"),
    hair: hex(a.hair, "#4a3428"),
    hairStyle: pick(a.hairStyle, ["short", "long", "bun"] as const, "short"),
    top: hex(a.top, color),
    bottom: hex(a.bottom, "#3f4a5c"),
    bottomStyle: pick(a.bottomStyle, ["pants", "shorts", "skirt"] as const, "pants"),
    headwear: pick(a.headwear, ["none", "cap", "bandana"] as const, "none"),
    headwearColor: hex(a.headwearColor, "#8e8a86"),
    glasses: pick(a.glasses, ["none", "on-cap", "on-shirt"] as const, "none"),
    glassesColor: hex(a.glassesColor, "#2b2b2e"),
    shoes: hex(a.shoes, "#f4f2ee"),
  };
}

type Pose = "standing" | "sitting" | "relaxed";

const INK = "#2b2522";
const FRAME = "#2e2a27";

/** Pelvis center height above the floor; the head top is PY + 0.78. */
const TOP = 0.78;

function tube(p: Parts, path: V3[], r: number, color: string, seg = 8, steps = 8): void {
  p.add({ kind: "tube", path, r, seg, steps }, [0, 0, 0], color);
}

/**
 * Head + hair + headwear + glasses-on-cap. `hc` = head center.
 */
function head(p: Parts, L: PersonLook, hc: V3): void {
  const [hx, hy, hz] = hc;
  const R: V3 = [0.112, 0.125, 0.115];
  p.sphere(hc, R, L.skin, { seg: 16 });
  /** Point on the face surface (slightly proud of it). */
  const surf = (dx: number, dy: number, out = 0.002): V3 => {
    const k = 1 - (dx / R[0]) ** 2 - (dy / R[1]) ** 2;
    return [hx + dx, hy + dy, hz + R[2] * Math.sqrt(Math.max(k, 0)) + out];
  };
  // ears
  for (const s of [-1, 1]) p.sphere([hx + s * 0.108, hy - 0.01, hz - 0.006], [0.02, 0.03, 0.02], L.skin, { seg: 4 });
  // face: dot eyes (with a tiny highlight), nose, blush, smile
  for (const s of [-1, 1]) {
    const e = surf(s * 0.041, -0.004, -0.003);
    p.sphere(e, [0.0125, 0.018, 0.01], INK, { seg: 8 });
    p.sphere([e[0] + 0.004, e[1] + 0.006, e[2] + 0.007], [0.0035, 0.0035, 0.002], "#ffffff", { seg: 4 });
    const c = surf(s * 0.066, -0.036, -0.002);
    p.sphere(c, [0.019, 0.012, 0.005], mix(L.skin, "#e8806e", 0.5), { seg: 4 });
  }
  p.sphere(surf(0, -0.024, -0.006), [0.013, 0.016, 0.012], darken(L.skin, 0.06), { seg: 4 });
  tube(p, [surf(-0.026, -0.052), surf(-0.012, -0.061), surf(0.012, -0.061), surf(0.026, -0.052)], 0.0042, darken(L.skin, 0.55), 4, 8);

  // hair: cap on top/back, leaving the face free (+ style extras)
  const cap = L.headwear !== "none";
  p.sphere([hx, hy + 0.03, hz - 0.012], [0.12, 0.098, 0.124], L.hair, { seg: 12 });
  p.sphere([hx, hy - 0.012, hz - 0.03], [0.118, 0.108, 0.106], L.hair, { seg: 8 });
  if (!cap) {
    // little side-swept fringe
    p.sphere([hx + 0.03, hy + 0.072, hz + 0.062], [0.075, 0.035, 0.05], L.hair, { seg: 8 });
  }
  if (L.hairStyle === "long") {
    p.sphere([hx, hy - 0.14, hz - 0.07], [0.132, 0.24, 0.066], L.hair, { seg: 8 });
    for (const s of [-1, 1]) p.sphere([hx + s * 0.104, hy - 0.08, hz - 0.004], [0.038, 0.15, 0.062], L.hair, { seg: 8 });
  } else if (L.hairStyle === "bun") {
    p.sphere([hx, hy + 0.07, hz - 0.1], [0.055, 0.055, 0.055], L.hair, { seg: 8 });
  }

  const yb = hy + 0.03; // crown base (forehead line)
  const crown: [number, number][] = [
    [0.13, 0],
    [0.128, 0.03],
    [0.116, 0.06],
    [0.09, 0.085],
    [0.05, 0.098],
    [0, 0.1],
  ];
  if (L.headwear === "cap") {
    const hc2 = L.headwearColor;
    p.add({ kind: "lathe", pts: crown, seg: 16 }, [hx, yb, hz - 0.008], hc2, { scale: [1, 1, 1.04] });
    // brim, slightly darker
    p.sphere([hx, yb + 0.004, hz + 0.118], [0.1, 0.012, 0.09], darken(hc2, 0.12), { seg: 12 });
    if (L.glasses === "on-cap") sunglasses(p, L, [hx, yb + 0.05, hz + 0.106], true);
  } else if (L.headwear === "bandana") {
    const bc = L.headwearColor;
    p.add({ kind: "lathe", pts: crown.map(([r, y]) => [r + 0.004, y * 1.12] as [number, number]), seg: 16 }, [hx, yb - 0.008, hz - 0.01], bc, {
      scale: [1, 1, 1.04],
    });
    p.cyl(hx, hz - 0.01, yb - 0.014, yb + 0.008, 0.136, 0.141, darken(bc, 0.12), { seg: 16 });
    // paisley-ish dots
    const dot = lighten(bc, 0.55);
    for (const [ang, t] of [
      [-0.5, 0.035],
      [0.5, 0.035],
      [0.0, 0.07],
      [-1.3, 0.05],
      [1.3, 0.05],
    ] as const) {
      const r = (t < 0.045 ? 0.128 : t < 0.068 ? 0.112 : 0.1) + 0.005;
      const y = yb - 0.008 + t;
      p.sphere([hx + Math.sin(ang) * r, y, hz - 0.01 + Math.cos(ang) * r * 1.04], [0.011, 0.011, 0.011], dot, { seg: 4 });
    }
    // knot + tails at the back
    for (const s of [-1, 1]) {
      p.sphere([hx + s * 0.022, yb - 0.01, hz - 0.15], [0.026, 0.022, 0.02], darken(bc, 0.08), { seg: 8 });
      p.sphere([hx + s * 0.03, yb - 0.08, hz - 0.165], [0.03, 0.06, 0.012], bc, { seg: 8 });
    }
  }
}

/** Sunglasses facing +Z, centered at c (two lenses + bridge + temples going back). */
function sunglasses(p: Parts, L: PersonLook, c: V3, temples: boolean): void {
  const [x, y, z] = c;
  const mirror = luminance(L.glassesColor) > 0.3;
  const lensO = mirror ? { seg: 8, role: "mirror" as const } : { seg: 8 };
  for (const s of [-1, 1]) {
    p.sphere([x + s * 0.043, y, z], [0.041, 0.027, 0.009], FRAME, { seg: 4 });
    p.sphere([x + s * 0.043, y, z + 0.004], [0.036, 0.022, 0.008], L.glassesColor, lensO);
  }
  p.box([x - 0.012, y + 0.008, z - 0.004], [x + 0.012, y + 0.016, z + 0.006], FRAME);
  if (temples) {
    for (const s of [-1, 1]) tube(p, [[x + s * 0.082, y + 0.004, z - 0.01], [x + s * 0.118, y + 0.002, z - 0.07], [x + s * 0.13, y, z - 0.15]], 0.004, FRAME, 4, 4);
  }
}

/** Torso, neck, head and arms. `pz` = pelvis z, `uz` = upper body z (lean back when < pz). */
function upperBody(p: Parts, L: PersonLook, py: number, pz: number, uz: number, pose: Pose): void {
  const skin = L.skin;
  const top = L.top;
  // pelvis (bottom garment) + belly bridge for a leaning torso
  p.sphere([0, py, pz], [0.15, 0.1, 0.12], L.bottom, { seg: 8 });
  if (uz !== pz) p.sphere([0, py + 0.1, (pz + uz) / 2 + 0.01], [0.15, 0.12, 0.12], top, { seg: 8 });
  // t-shirt torso (lathe, flattened front-to-back)
  const yb = py - 0.04;
  p.add(
    {
      kind: "lathe",
      pts: [
        [0, 0],
        [0.14, 0],
        [0.156, 0.08],
        [0.16, 0.2],
        [0.174, 0.34],
        [0.178, 0.42],
        [0.158, 0.48],
        [0.09, 0.515],
        [0, 0.525],
      ],
      seg: 12,
    },
    [0, yb, uz],
    top,
    { scale: [1, 1, 0.68] },
  );
  // neck + collar
  p.cyl(0, uz, py + 0.44, py + 0.56, 0.046, 0.044, skin, { seg: 10 });
  p.cyl(0, uz + 0.004, py + 0.462, py + 0.482, 0.06, 0.058, darken(top, 0.12), { seg: 12 });
  head(p, L, [0, py + 0.655, uz + 0.008]);
  if (L.glasses === "on-shirt") {
    // hooked by one temple in the collar, hanging on the chest
    const gz = uz + 0.124;
    sunglasses(p, L, [0.012, py + 0.385, gz], false);
    tube(p, [[0.0, py + 0.395, gz - 0.002], [-0.004, py + 0.43, gz - 0.01], [-0.006, py + 0.47, gz - 0.03]], 0.004, FRAME, 4, 4);
  }

  // arms: shoulder ball (sleeve), sleeve tube, skin upper arm + forearm, hand
  const arm = (sh: V3, el: V3, wr: V3, hand: V3) => {
    p.sphere([sh[0], sh[1], sh[2]], [0.066, 0.06, 0.064], top, { seg: 12 });
    const sl: V3 = [sh[0] + (el[0] - sh[0]) * 0.5, sh[1] + (el[1] - sh[1]) * 0.5, sh[2] + (el[2] - sh[2]) * 0.5];
    tube(p, [sh, sl], 0.058, top, 10, 2);
    tube(p, [sh, el], 0.043, skin, 8, 2);
    tube(p, [el, wr], 0.039, skin, 8, 2);
    p.sphere(el, [0.041, 0.041, 0.041], skin, { seg: 4 });
    p.sphere(hand, [0.04, 0.05, 0.042], skin, { seg: 8 });
  };
  const shY = py + 0.415;
  if (pose === "standing") {
    for (const s of [-1, 1]) arm([s * 0.172, shY, uz], [s * 0.212, py + 0.18, uz + 0.0], [s * 0.214, py - 0.04, uz + 0.035], [s * 0.214, py - 0.085, uz + 0.042]);
  } else if (pose === "sitting") {
    for (const s of [-1, 1])
      arm([s * 0.172, shY, uz], [s * 0.205, py + 0.17, uz + 0.06], [s * 0.15, py + 0.12, pz + 0.27], [s * 0.135, py + 0.115, pz + 0.32]);
  } else {
    // right arm along the backrest, left hand resting on the lap
    arm([0.172, shY, uz], [0.33, shY - 0.005, uz - 0.05], [0.46, shY + 0.01, uz - 0.09], [0.5, shY + 0.012, uz - 0.1]);
    arm([-0.172, shY, uz], [-0.2, py + 0.16, uz + 0.07], [-0.08, py + 0.1, pz + 0.18], [-0.04, py + 0.1, pz + 0.21]);
  }
}

/** A sneaker: x center, heel z0 → toe z1, on the floor. */
function shoe(p: Parts, L: PersonLook, x: number, z0: number, z1: number): void {
  const sole = mix(L.shoes, luminance(L.shoes) > 0.6 ? "#b9b1a5" : "#f2ede4", 0.45);
  const len = z1 - z0;
  p.cyl(x, (z0 + z1) / 2, 0, 0.026, 0.053, len / 2, sole, { seg: 12 });
  p.sphere([x, 0.024, (z0 + z1) / 2 - 0.004], [0.049, 0.062, len / 2 - 0.006], L.shoes, { seg: 12 });
}

function standingLegs(p: Parts, L: PersonLook, py: number): void {
  const hip = py - 0.02;
  for (const s of [-1, 1]) {
    const x = s * 0.085;
    if (L.bottomStyle === "pants") {
      p.cyl(x, 0, 0.07, hip, 0.074, 0.074, L.bottom, { seg: 12, taper: 1.2 });
    } else if (L.bottomStyle === "shorts") {
      p.cyl(x, 0, hip - 0.42, hip, 0.082, 0.082, L.bottom, { seg: 12, taper: 0.92 });
      p.cyl(x, 0, 0.06, hip - 0.38, 0.056, 0.056, L.skin, { seg: 10, taper: 1.15 });
    } else {
      p.cyl(x, 0, 0.06, 0.42, 0.05, 0.05, L.skin, { seg: 10, taper: 1.15 });
    }
    shoe(p, L, x, -0.075, 0.165);
  }
  if (L.bottomStyle === "skirt") {
    p.add(
      {
        kind: "lathe",
        pts: [
          [0, 0.27],
          [0.236, 0.27],
          [0.232, 0.3],
          [0.196, py - 0.4],
          [0.168, py - 0.08],
          [0.152, py + 0.04],
          [0, py + 0.04],
        ],
        seg: 12,
      },
      [0, 0, 0],
      L.bottom,
      { scale: [1, 1, 0.74] },
    );
  }
}

/** Seated legs: thighs forward along +Z on the seat, shins down to the floor. */
function sittingLegs(p: Parts, L: PersonLook, py: number, pz: number, spread: number): void {
  const seat = py - 0.08;
  const ty = seat + 0.07;
  const kz = pz + 0.4;
  const legC = L.bottomStyle === "pants" ? L.bottom : L.skin;
  const skirt = L.bottomStyle === "skirt";
  for (const s of [-1, 1]) {
    const x = s * spread;
    if (L.bottomStyle === "shorts") {
      p.cylZ(x, ty, pz - 0.02, kz - 0.1, 0.084, 0.078, L.bottom, { seg: 12 });
      p.cylZ(x, ty - 0.005, kz - 0.14, kz, 0.064, 0.062, L.skin, { seg: 10 });
    } else if (!skirt) {
      p.cylZ(x, ty, pz - 0.02, kz, 0.078, 0.072, legC, { seg: 12 });
    }
    if (!skirt) p.sphere([x, ty - 0.004, kz], [0.074, 0.072, 0.07], legC, { seg: 8 });
    const lr = L.bottomStyle === "pants" ? 0.064 : 0.054;
    p.cyl(x, kz + 0.01, 0.07, ty, lr, lr, legC, { seg: 10, taper: 1.2 });
    shoe(p, L, x, kz - 0.07, kz + 0.17);
  }
  if (skirt) {
    // long skirt: a soft lap over both thighs + a drape falling from the knees to mid-calf
    const sx = spread + 0.1;
    p.sphere([0, ty + 0.005, (pz + kz) / 2 + 0.02], [sx, 0.088, (kz - pz) / 2 + 0.07], L.bottom, { seg: 12 });
    p.cyl(0, kz + 0.035, 0.2, ty + 0.03, sx + 0.01, 0.07, L.bottom, { seg: 12, taper: 0.92 });
    p.cyl(0, kz + 0.035, 0.2, 0.218, sx + 0.014, 0.074, darken(L.bottom, 0.15), { seg: 12 });
  }
}

function person(c: Ctx, pose: Pose): Parts {
  const L = personLook(c.attrs, c.color);
  const p = new Parts();
  if (pose === "standing") {
    const py = 1.75 - TOP;
    standingLegs(p, L, py);
    upperBody(p, L, py, 0, 0, pose);
  } else {
    const py = 1.3 - TOP; // 0.52 → seat ≈ 0.44 m
    const pz = -0.2;
    const uz = pose === "relaxed" ? pz - 0.075 : pz - 0.02;
    sittingLegs(p, L, py, pz, pose === "relaxed" ? 0.1 : 0.09);
    upperBody(p, L, py, pz, uz, pose);
  }
  return fitToBox(p, c.w, c.h, c.d);
}

export const personSitting: Build = (c) => person(c, "sitting");
export const personStanding: Build = (c) => person(c, "standing");
export const personSittingRelaxed: Build = (c) => person(c, "relaxed");
