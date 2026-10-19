/**
 * Color conversions for Hue lights (CIE xy / mired / bri) <-> UI values (hex / kelvin / 0..100).
 * Formulas: Philips "RGB to xy" application note (wide gamut D65 matrix, sRGB gamma).
 */

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1]!;
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const toLinear = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** Hex -> CIE xy (Hue clamps to the light's gamut itself). */
export function hexToXy(hex: string): [number, number] {
  const rgb = parseHex(hex) ?? [255, 255, 255];
  const [r, g, b] = rgb.map((c) => toLinear(c / 255)) as [number, number, number];
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const sum = X + Y + Z;
  if (sum <= 0) return [0.3227, 0.329]; // white point
  return [round4(X / sum), round4(Y / sum)];
}

/** CIE xy -> hex at full brightness (brightness is reported separately). */
export function xyToHex(x: number, y: number): string {
  if (y <= 0) return "#ffffff";
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  const max = Math.max(r, g, b);
  if (max > 1) {
    r /= max;
    g /= max;
    b /= max;
  }
  [r, g, b] = [r, g, b].map((c) => clamp(fromLinear(c), 0, 1)) as [number, number, number];
  // Normalise so the brightest channel is 255 (color only, no brightness).
  const m = Math.max(r, g, b) || 1;
  return toHex((r / m) * 255, (g / m) * 255, (b / m) * 255);
}

/** Hue/sat (Hue v1 units: hue 0..65535, sat 0..254) -> hex at full value. */
export function hsToHex(hue: number, sat: number): string {
  const h = (hue / 65535) * 360;
  const s = sat / 254;
  const c = s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = 1 - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Kelvin -> approximate hex (Tanner Helland's fit), for displaying white lights. */
export function kelvinToHex(kelvin: number): string {
  const t = clamp(kelvin, 1000, 40000) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return toHex(r, g, b);
}

export const miredToKelvin = (ct: number): number => Math.round(1_000_000 / ct);
export const kelvinToMired = (k: number): number => Math.round(1_000_000 / k);

/** Hue bri 1..254 -> 0..100 (an "on" light never reports 0). */
export function briToPercent(bri: number): number {
  return clamp(Math.round((bri / 254) * 100), 1, 100);
}

/** 0..100 -> Hue bri 1..254. */
export function percentToBri(p: number): number {
  return clamp(Math.round((p / 100) * 254), 1, 254);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
