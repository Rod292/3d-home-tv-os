/**
 * Look of the TV home screen (apps/tv-launcher), shared with the 3D TV that mirrors it: a mesh-like
 * gradient (soft color blobs on a deep base) following the sun. Keep in sync with Ambient.kt.
 */

export interface Blob {
  /** Center, as fractions of the width / height. */
  x: number;
  y: number;
  /** Radius, as a fraction of the width. */
  r: number;
  color: string;
  alpha: number;
}

export interface LauncherPalette {
  /** Base gradient, top → bottom. */
  base: [string, string];
  blobs: Blob[];
}

const NIGHT: LauncherPalette = {
  base: ["#0b1026", "#04050d"],
  blobs: [
    { x: 0.12, y: 0.18, r: 0.55, color: "#3b2a8f", alpha: 0.55 },
    { x: 0.88, y: 0.12, r: 0.5, color: "#0f4f7d", alpha: 0.5 },
    { x: 0.62, y: 1.0, r: 0.6, color: "#6a2b70", alpha: 0.38 },
    { x: 0.25, y: 0.9, r: 0.45, color: "#12386a", alpha: 0.45 },
  ],
};

const DAY: LauncherPalette = {
  base: ["#1e3a64", "#0b1626"],
  blobs: [
    { x: 0.15, y: 0.12, r: 0.55, color: "#4f86d6", alpha: 0.55 },
    { x: 0.85, y: 0.18, r: 0.45, color: "#f2a46b", alpha: 0.38 },
    { x: 0.65, y: 1.0, r: 0.55, color: "#2a9d8f", alpha: 0.35 },
    { x: 0.1, y: 0.92, r: 0.45, color: "#6d5bd0", alpha: 0.32 },
  ],
};

const GOLDEN: LauncherPalette = {
  base: ["#2a2350", "#0c0a1a"],
  blobs: [
    { x: 0.82, y: 0.2, r: 0.55, color: "#ff8a5b", alpha: 0.5 },
    { x: 0.15, y: 0.15, r: 0.5, color: "#5b4bc4", alpha: 0.5 },
    { x: 0.55, y: 1.0, r: 0.6, color: "#c2477a", alpha: 0.35 },
    { x: 0.1, y: 0.9, r: 0.4, color: "#1f3f7a", alpha: 0.4 },
  ],
};

/** Palette for a solar elevation (degrees; null: unknown → day). Golden hour within 8° of the horizon. */
export function launcherPalette(elevation: number | null | undefined): LauncherPalette {
  if (elevation == null || !Number.isFinite(elevation)) return DAY;
  if (elevation < -4) return NIGHT;
  if (elevation < 8) return GOLDEN;
  return DAY;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The TV shows the Maison home screen (app label read over ADB). */
export function isLauncherApp(app: string | undefined): boolean {
  if (!app) return false;
  const n = norm(app);
  return n === "tvlauncher" || n === "maison" || n === "comappart3dtvlauncher";
}
