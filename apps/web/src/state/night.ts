/**
 * Shared, frame-rate state of the day ↔ night transition (outside React: read every frame by the
 * lights, walls, ceilings…). `mix` goes 0 (day) → 1 (night), eased over ~0.8 s by <NightController>.
 */
export const nightFx = {
  /** Linear progress toward the target (0..1). */
  progress: 0,
  /** Eased value everyone reads (0 = day, 1 = night). */
  mix: 0,
  /** Golden-hour warmth (0..1), only when following the sun near the horizon. */
  dusk: 0,
};

export const NIGHT_TRANSITION = 0.8;
export const NIGHT_STORAGE_KEY = "appart3d:night:v1";

/** Night background colors (canvas capture, fades). Keep in sync with `.app::before` in styles.css. */
export const NIGHT_SKY = { top: "#141633", mid: "#272456", bottom: "#3d2f5c", glow: "#8a5a6a" };

export function loadNightPref(): boolean {
  try {
    return globalThis.localStorage?.getItem(NIGHT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveNightPref(night: boolean) {
  try {
    globalThis.localStorage?.setItem(NIGHT_STORAGE_KEY, night ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ follow the sun */

export type DaylightMode = "auto" | "day" | "night";
export const DAYLIGHT_STORAGE_KEY = "appart3d:daylight:v1";

/** Full day above this solar elevation (degrees), full night below its opposite. */
export const SUN_DAY_ELEVATION = 6;

/** Linear night progress (0 day … 1 night) for a solar elevation: eased by smoothstep like the toggle. */
export function nightProgressForElevation(elevation: number): number {
  return Math.min(1, Math.max(0, (SUN_DAY_ELEVATION - elevation) / (2 * SUN_DAY_ELEVATION)));
}

/** Golden-hour warmth (0..1): strongest just above the horizon, gone by +9° / −7°. */
export function duskForElevation(elevation: number): number {
  const d = elevation >= 1 ? (elevation - 1) / 8 : (1 - elevation) / 8;
  const k = Math.max(0, 1 - d);
  return k * k * (3 - 2 * k);
}

export function parseDaylight(v: string | null | undefined): DaylightMode | null {
  return v === "auto" || v === "day" || v === "night" ? v : null;
}

export function loadDaylightPref(): DaylightMode {
  try {
    return parseDaylight(globalThis.localStorage?.getItem(DAYLIGHT_STORAGE_KEY)) ?? "auto";
  } catch {
    return "auto";
  }
}

export function saveDaylightPref(mode: DaylightMode) {
  try {
    globalThis.localStorage?.setItem(DAYLIGHT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Target of the day ↔ night blend: { progress (linear 0..1, eased later), dusk }. In `auto` with a
 * known sun it follows the elevation; otherwise the plain Jour / Nuit flag.
 */
export function daylightTarget(mode: DaylightMode, sunElevation: number | null, night: boolean): { progress: number; dusk: number } {
  if (mode === "auto" && sunElevation !== null) return { progress: nightProgressForElevation(sunElevation), dusk: duskForElevation(sunElevation) };
  if (mode === "day") return { progress: 0, dusk: 0 };
  if (mode === "night") return { progress: 1, dusk: 0 };
  return { progress: night ? 1 : 0, dusk: 0 };
}
