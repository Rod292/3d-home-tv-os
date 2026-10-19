/**
 * Sun position for the home: Home Assistant's `sun.sun` entity when available, else a local
 * approximation (NOAA solar position equations) from the Mac's clock and the configured location.
 */
import type { SunInfo } from "@appart3d/home";

/** Same threshold as Home Assistant's above_horizon (refraction + solar disc radius). */
export const HORIZON = -0.833;

const rad = Math.PI / 180;
const deg = 180 / Math.PI;

/** Solar elevation in degrees (NOAA "General Solar Position Calculations"; ±0.1° is plenty here). */
export function solarElevation(date: Date, lat: number, lon: number): number {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360; // mean longitude
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t); // mean anomaly
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t); // orbit eccentricity
  const c =
    Math.sin(m * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * rad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * rad) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad); // apparent longitude
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad); // corrected obliquity
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)); // radians
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime =
    4 *
    deg *
    (y * Math.sin(2 * l0 * rad) -
      2 * e * Math.sin(m * rad) +
      4 * e * y * Math.sin(m * rad) * Math.cos(2 * l0 * rad) -
      0.5 * y * y * Math.sin(4 * l0 * rad) -
      1.25 * e * e * Math.sin(2 * m * rad)); // minutes
  const utcMin = (((date.getTime() / 60_000) % 1440) + 1440) % 1440;
  const trueSolarTime = (((utcMin + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const cosZenith = Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(hourAngle * rad);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * deg;
  return 90 - zenith;
}

/** Next time (after `from`, within `horizonH` hours) the sun crosses the horizon upward (rising) or downward. */
export function nextCrossing(from: Date, lat: number, lon: number, rising: boolean, horizonH = 48): Date | undefined {
  const step = 10 * 60_000;
  let t0 = from.getTime();
  let e0 = solarElevation(from, lat, lon) - HORIZON;
  for (let t = t0 + step; t <= from.getTime() + horizonH * 3_600_000; t += step) {
    const e1 = solarElevation(new Date(t), lat, lon) - HORIZON;
    if (rising ? e0 < 0 && e1 >= 0 : e0 >= 0 && e1 < 0) {
      let lo = t0;
      let hi = t;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        const em = solarElevation(new Date(mid), lat, lon) - HORIZON;
        if (rising ? em < 0 : em >= 0) lo = mid;
        else hi = mid;
      }
      return new Date(Math.round(hi / 1000) * 1000);
    }
    t0 = t;
    e0 = e1;
  }
  return undefined;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Local approximation from the clock and the home's coordinates. */
export function computeSun(date: Date, lat: number, lon: number): SunInfo {
  const elevation = solarElevation(date, lat, lon);
  const sun: SunInfo = { elevation: round2(elevation), isDay: elevation > HORIZON };
  const rising = nextCrossing(date, lat, lon, true);
  const setting = nextCrossing(date, lat, lon, false);
  if (rising) sun.nextRising = rising.toISOString();
  if (setting) sun.nextSetting = setting.toISOString();
  return sun;
}

/** Home Assistant `sun.sun` → SunInfo (null when unavailable or without an elevation). */
export function sunFromHa(state: { state: string; attributes: Record<string, unknown> } | undefined): SunInfo | null {
  if (!state || (state.state !== "above_horizon" && state.state !== "below_horizon")) return null;
  const elevation = state.attributes.elevation;
  if (typeof elevation !== "number" || !Number.isFinite(elevation)) return null;
  const sun: SunInfo = { elevation: round2(elevation), isDay: state.state === "above_horizon" };
  const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
  const r = iso(state.attributes.next_rising);
  const s = iso(state.attributes.next_setting);
  if (r) sun.nextRising = r;
  if (s) sun.nextSetting = s;
  return sun;
}

/** Push a new snapshot when the elevation moved by ≥ 0.5° or day / night flipped. */
export function shouldPushSun(prev: SunInfo | null | undefined, next: SunInfo | null | undefined): boolean {
  if (!next) return false;
  if (!prev) return true;
  return prev.isDay !== next.isDay || Math.abs(next.elevation - prev.elevation) >= 0.5;
}
