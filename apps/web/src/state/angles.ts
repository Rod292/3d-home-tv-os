export { normalizeAngle } from "../lib/geom2d";

/** Removes float drift so that repeated 15° steps land exactly on multiples of 15°. */
export function snapToGridAngle(a: number, stepDeg = 0.5): number {
  const step = (stepDeg * Math.PI) / 180;
  return Math.round(a / step) * step;
}

export const toDeg = (r: number): number => Math.round(((r * 180) / Math.PI) * 10) / 10;
