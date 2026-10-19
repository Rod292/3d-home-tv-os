/**
 * Tiny color utilities (pure, no three.js) used to derive secondary colors
 * (darker legs, lighter cushions…) from an item's main color.
 */

export type RGB = [r: number, g: number, b: number];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n) || h.length < 6) return [0.8, 0.8, 0.8];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Linear mix in sRGB space: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/** Darken towards a warm near-black (keeps shadows from going grey/dead). */
export function darken(c: string, t: number): string {
  return mix(c, "#2a211c", clamp01(t));
}

/** Lighten towards a warm off-white. */
export function lighten(c: string, t: number): string {
  return mix(c, "#fffaf2", clamp01(t));
}

/** Relative luminance (0..1), useful to pick contrasting details. */
export function luminance(c: string): number {
  const [r, g, b] = hexToRgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A detail color that contrasts with `c`: darker on light colors, lighter on dark ones. */
export function contrast(c: string, t = 0.35): string {
  return luminance(c) > 0.45 ? darken(c, t) : lighten(c, t);
}

/** Normalize any accepted color string to a lowercase #rrggbb (cache-friendly). */
export function normalizeHex(c: string): string {
  return rgbToHex(hexToRgb(c));
}
