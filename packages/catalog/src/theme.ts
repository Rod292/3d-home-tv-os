import * as THREE from "three";
import { lighten, mix, normalizeHex } from "./color";

/** Shared palette of the "dollhouse" art direction. */
export const palette = {
  cream: "#f3e7d3",
  offWhite: "#faf6ef",
  porcelain: "#f4f6f5",
  terracotta: "#d9774f",
  blush: "#e8b2a0",
  sage: "#8fae8b",
  sageDark: "#5f8a68",
  slate: "#5b7fa6",
  slateDark: "#3f5a7a",
  mustard: "#e3b55b",
  wood: "#b98a5e",
  woodLight: "#ead2a8",
  woodDark: "#7a5438",
  charcoal: "#3a3a40",
  ink: "#26262b",
  steel: "#c3c8cc",
  stone: "#e2ddd4",
  water: "#a9d3e0",
  glow: "#ffd98f",
} as const;

export type PaletteColor = keyof typeof palette;

export interface Theme {
  background: string;
  wall: string;
  wallCap: string;
  floor: Record<"wood" | "tile" | "carpet" | "concrete", string>;
  accent: string;
  selection: string;
  /** Furniture palette (added; optional for consumers). */
  palette: typeof palette;
}

export const theme: Theme = {
  background: "#f6efe6",
  wall: "#fbf7f1",
  wallCap: "#3a3330",
  floor: { wood: "#d9b48a", tile: "#e6e9ec", carpet: "#cfc6bd", concrete: "#bdbab5" },
  accent: "#e2725b",
  selection: "#ffb347",
  palette,
};

/**
 * 3-step toon ramp (shadow / mid / light). Kept fairly bright in the shadows so the
 * dollhouse stays warm and readable from a top-down iso camera.
 */
let gradient: THREE.DataTexture | null = null;
export function toonGradientMap(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([128, 128, 128, 255, 198, 198, 198, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.colorSpace = THREE.NoColorSpace;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/**
 * Material roles used by the procedural models.
 * - toon: default 3-tone shading
 * - glow: lamp shades, flames (self-lit)
 * - screen: TV / oven displays (dark with a slight emissive tint)
 * - glass: shower panels, oven windows (transparent)
 * - mirror: bright, slightly emissive bluish surface
 */
export type MaterialRole = "toon" | "glow" | "screen" | "glass" | "mirror";

/** 0 = normal, 1 = hovered, 2 = selected. */
export type Highlight = 0 | 1 | 2;

const HIGHLIGHT_EMISSIVE: Record<Highlight, number> = { 0: 0, 1: 0.12, 2: 0.22 };

const cache = new Map<string, THREE.Material>();

/** Cached material for a color / role / highlight level. Never dispose these: they are shared. */
export function getMaterial(color: string, role: MaterialRole = "toon", highlight: Highlight = 0): THREE.Material {
  const hex = normalizeHex(color);
  const key = `${hex}|${role}|${highlight}`;
  let m = cache.get(key);
  if (m) return m;
  const lift = HIGHLIGHT_EMISSIVE[highlight];
  const params: THREE.MeshToonMaterialParameters = { color: hex, gradientMap: toonGradientMap() };
  switch (role) {
    case "glow":
      // warm, lit look: the emissive is pushed towards amber so shades read as "on"
      // Light sources: warm amber emissive and NOT tone-mapped, so the lit side clips to a
      // bright warm yellow and the shadow side stays amber (reads as "on" in the toon style).
      params.color = mix(hex, "#b07a3a", 0.45);
      params.emissive = new THREE.Color(mix(hex, "#ff8a2e", 0.55));
      params.emissiveIntensity = 0.62 + lift;
      params.toneMapped = false;
      break;
    case "screen":
      params.emissive = new THREE.Color(lighten(hex, 0.25));
      params.emissiveIntensity = 0.28 + lift;
      break;
    case "glass":
      params.transparent = true;
      params.opacity = 0.32;
      params.depthWrite = false;
      params.emissive = new THREE.Color(hex);
      params.emissiveIntensity = 0.15 + lift;
      break;
    case "mirror":
      params.emissive = new THREE.Color(hex);
      params.emissiveIntensity = 0.35 + lift;
      break;
    default:
      if (lift > 0) {
        params.emissive = new THREE.Color(lighten(hex, 0.4));
        params.emissiveIntensity = lift;
      }
  }
  m = new THREE.MeshToonMaterial(params);
  m.name = `appart3d:${key}`;
  cache.set(key, m);
  return m;
}

/** Shared, cached stylized (toon) material. Also used by the web app for walls and floors. */
export function toonMaterial(color: string): THREE.Material {
  return getMaterial(color, "toon", 0);
}
