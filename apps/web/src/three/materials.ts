import * as THREE from "three";
import { toonMaterial } from "@appart3d/catalog";
import type { FloorMaterial } from "@appart3d/scene";

/**
 * Per-instance copy of the catalog's shared stylized material (so we can attach clipping planes,
 * maps or tints without touching the shared cache). The caller owns and disposes it.
 */
export function ownedToon(color: string, opts: { clip?: THREE.Plane; map?: THREE.Texture | null } = {}): THREE.Material {
  const m = toonMaterial(color).clone();
  if (opts.clip) {
    m.clippingPlanes = [opts.clip];
    m.clipShadows = true;
  }
  if (opts.map && "map" in m) {
    (m as THREE.MeshStandardMaterial).map = opts.map;
    m.needsUpdate = true;
  }
  return m;
}

/**
 * Same as `ownedToon`, but ignoring point and spot lights: for the OUTER faces of envelope walls,
 * so the night lamps inside (which cast no shadows) don't leak through them.
 */
export function outsideToon(color: string, opts: { clip?: THREE.Plane } = {}): THREE.Material {
  const m = ownedToon(color, opts);
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      THREE.ShaderChunk.lights_fragment_begin
        .replace("#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0")
        .replace("#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0"),
    );
  };
  m.customProgramCacheKey = () => "appart3d:outside";
  return m;
}

// ---------------------------------------------------------------------------------------------
// Procedural floor textures: 1 texture unit = 1 meter (floor UVs are plan coordinates in meters).
// Mostly white so the room's floorColor tints them.

const textureCache = new Map<FloorMaterial, THREE.Texture | null>();

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  return ctx ? [c, ctx] : null;
}

/** Deterministic pseudo-random so textures look the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawWood(ctx: CanvasRenderingContext2D, S: number) {
  const r = rng(7);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, S, S);
  const planks = 5; // 20 cm wide planks
  const ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const shade = 236 + Math.floor(r() * 18);
    ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
    ctx.fillRect(0, i * ph, S, ph);
    // grain
    ctx.strokeStyle = "rgba(120,80,40,0.05)";
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const y = i * ph + r() * ph;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(S * 0.3, y + r() * 4 - 2, S * 0.6, y + r() * 4 - 2, S, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(90,60,30,0.16)";
    ctx.fillRect(0, i * ph, S, 1.5);
    const joint = ((i * 0.37) % 1) * S;
    ctx.fillRect(joint, i * ph, 1.5, ph);
  }
}

function drawTile(ctx: CanvasRenderingContext2D, S: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, S, S);
  const n = 4; // 25 cm tiles
  const t = S / n;
  const r = rng(3);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = 244 + Math.floor(r() * 10);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(i * t + 1, j * t + 1, t - 2, t - 2);
    }
  ctx.fillStyle = "rgba(60,60,70,0.22)";
  for (let i = 0; i <= n; i++) {
    ctx.fillRect(i * t - 1, 0, 2, S);
    ctx.fillRect(0, i * t - 1, S, 2);
  }
}

function drawSpeckle(ctx: CanvasRenderingContext2D, S: number, alpha: number, count: number, size: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, S, S);
  const r = rng(11);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(0,0,0,${alpha * r()})`;
    ctx.beginPath();
    ctx.arc(r() * S, r() * S, size * (0.4 + r()), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function floorTexture(kind: FloorMaterial): THREE.Texture | null {
  if (textureCache.has(kind)) return textureCache.get(kind) ?? null;
  const S = 256;
  const made = makeCanvas(S);
  if (!made) return null;
  const [canvas, ctx] = made;
  if (kind === "wood") drawWood(ctx, S);
  else if (kind === "tile") drawTile(ctx, S);
  else if (kind === "carpet") drawSpeckle(ctx, S, 0.08, 2600, 1.2);
  else drawSpeckle(ctx, S, 0.06, 500, 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(kind, tex);
  return tex;
}

export const FLOOR_LABELS: Record<FloorMaterial, string> = {
  wood: "Parquet",
  tile: "Carrelage",
  carpet: "Moquette",
  concrete: "Béton ciré",
};

/** Opening palette (doors, frames, glass). */
export const OPENING_COLORS = {
  frame: "#f7f3ec",
  leaf: "#c9946a",
  knob: "#3a3330",
  sill: "#ece4d8",
  glass: "#a9cbd9",
};

/** Plinth sides under the floors (the dollhouse "base"). */
export const PLINTH_COLOR = "#cbb79f";
