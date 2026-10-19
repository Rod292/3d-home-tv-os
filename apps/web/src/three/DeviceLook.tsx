import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Item } from "@appart3d/scene";
import { screenOnTop, type ItemLook } from "../lib/home";
import { useStore } from "../state/store";
import { nightFx } from "../state/night";

/**
 * Maison mode: 3D items show the real state of their linked devices — lamp shades lit or not
 * (tinted by the light color and dimmed by its brightness), TV screen on / off, light strip glow
 * behind the TV, fan blades spinning. Works on per-item copies of the catalog's shared materials
 * (found by name `appart3d:<hex>|<role>|<highlight>`), so the catalog stays untouched.
 */

const ROLE_RE = /^appart3d:(#[0-9a-f]{6})\|(glow|screen)\|/i;
const LOOK_BASE = "appart3d:lookBase";
const LOOK_MAT = "appart3d:lookMat";

type Lookable = THREE.MeshToonMaterial;

interface LookMat {
  mat: Lookable;
  role: "glow" | "screen";
  /** Shade color as authored (the "off" look). */
  hex: THREE.Color;
  /** Original emissive / color / intensity (the catalog's "on" look). */
  emissive: THREE.Color;
  color: THREE.Color;
  intensity: number;
}

const copies = new WeakMap<THREE.Material, Map<string, LookMat>>();

function lookCopy(base: Lookable, itemId: string, role: "glow" | "screen", hex: string): LookMat {
  let perItem = copies.get(base);
  if (!perItem) copies.set(base, (perItem = new Map()));
  let c = perItem.get(itemId);
  if (!c) {
    const mat = base.clone();
    // Not "appart3d:" so the night controller leaves it alone (we apply the night boost ourselves).
    mat.name = `look:${itemId}:${base.name}`;
    c = { mat, role, hex: new THREE.Color(hex), emissive: base.emissive.clone(), color: base.color.clone(), intensity: base.emissiveIntensity };
    perItem.set(itemId, c);
  }
  return c;
}

/** Undo `applyLook` (call before the ghost swap so ghosting sees the catalog materials). */
export function restoreLook(root: THREE.Object3D | null) {
  root?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const base = mesh.userData[LOOK_BASE] as THREE.Material | undefined;
    if (base && mesh.material === mesh.userData[LOOK_MAT]) mesh.material = base;
    delete mesh.userData[LOOK_BASE];
    delete mesh.userData[LOOK_MAT];
  });
}

/** Swaps the glow / screen materials under `root` for per-item copies driven by `<LookDriver>`. */
export function applyLook(root: THREE.Object3D | null, itemId: string, look: ItemLook | undefined): LookMat[] {
  const out: LookMat[] = [];
  if (!root || !look) return out;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const m = mesh.material as Lookable;
    const r = ROLE_RE.exec(m.name);
    if (!r || !(m as Lookable).emissive) return;
    const role = r[2] as "glow" | "screen";
    if ((role === "glow" && !look.glow) || (role === "screen" && !look.screen)) return;
    const c = lookCopy(m, itemId, role, r[1]!);
    mesh.userData[LOOK_BASE] = m;
    mesh.userData[LOOK_MAT] = c.mat;
    mesh.material = c.mat;
    out.push(c);
  });
  return out;
}

const NIGHT_GLOW_BOOST = 2.1;
const OFF_SCREEN = new THREE.Color("#161a22");
const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

/**
 * Per-frame driver: eases the lit amount of the item's look materials, hides the TV image when
 * the TV is off, spins the fan. Renders on demand only while something moves.
 */
export function LookDriver({
  look,
  mats,
  groupRef,
  spinRef,
}: {
  look: ItemLook;
  mats: React.RefObject<LookMat[]>;
  groupRef: React.RefObject<THREE.Group | null>;
  spinRef: React.RefObject<THREE.Group | null>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const st = useRef({ glow: look.glow?.on ? 1 : 0, screen: look.screen?.on ? 1 : 0, omega: 0, applied: "" });
  useEffect(() => invalidate(), [look, invalidate]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const s = st.current;
    let moving = false;
    const ease = (cur: number, target: number, rate: number) => {
      if (cur === target) return cur;
      moving = true;
      const step = dt * rate;
      return Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
    };
    s.glow = ease(s.glow, look.glow?.on ? 1 : 0, 4);
    s.screen = ease(s.screen, look.screen?.on ? 1 : 0, 5);
    // HomePod playing: the top light slowly swirls through its colors (and gently breathes).
    const swirl = look.music?.playing || (look.music && s.glow > 0) ? musicColor(performance.now() / 1000) : null;
    if (swirl) moving = true;
    const glowColor = swirl ? swirl.hex : look.glow?.color;
    const glowLevel = swirl ? swirl.level : look.glow?.level;

    const key = `${s.glow}|${s.screen}|${nightFx.mix}|${glowColor}|${glowLevel}|${mats.current?.length}`;
    if (key !== s.applied) {
      s.applied = key;
      const night = 1 + (NIGHT_GLOW_BOOST - 1) * nightFx.mix;
      for (const c of mats.current ?? []) {
        if (c.role === "glow" && look.glow) {
          const k = s.glow;
          const level = 0.35 + 0.65 * (glowLevel ?? 1);
          const light = tmp.set(glowColor ?? look.glow.color);
          // Lit: the catalog's warm look tinted toward the light color. Off: the bare shade color.
          tmp2.copy(c.emissive).lerp(light, 0.7);
          c.mat.emissive.copy(tmp2);
          c.mat.color.copy(c.hex).lerp(tmp2.copy(c.color).lerp(light, 0.35), k);
          c.mat.emissiveIntensity = c.intensity * night * level * k * 1.15;
        } else if (c.role === "screen" && look.screen) {
          const k = s.screen;
          c.mat.color.copy(OFF_SCREEN).lerp(c.color, k);
          c.mat.emissiveIntensity = c.intensity * (1 + 1.6 * nightFx.mix) * k * 1.4;
        }
      }
    }

    // TV image (unlit plane added by the catalog): only while the TV is on.
    if (look.screen && groupRef.current) {
      const visible = s.screen > 0.5;
      groupRef.current.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const m = mesh.material as THREE.MeshBasicMaterial | undefined;
        if (mesh.isMesh && m && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial && m.map && !m.name && mesh.visible !== visible) mesh.visible = visible;
      });
    }

    // Fan: slow, eased rotation (rad/s grows with the speed step).
    const spin = spinRef.current;
    if (spin) {
      const target = look.fan && look.fan.speed > 0 ? 1.2 + 9 * look.fan.speed : 0;
      if (s.omega !== target) {
        const step = dt * 2.5;
        s.omega = Math.abs(target - s.omega) <= step ? target : s.omega + Math.sign(target - s.omega) * step;
      }
      if (s.omega > 0) {
        spin.rotation.y = (spin.rotation.y + s.omega * dt) % (Math.PI * 2);
        moving = true;
      }
    }
    if (moving) invalidate();
  });

  // Leaving Maison mode: screen image visible again, fan still.
  useEffect(
    () => () => {
      groupRef.current?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const m = mesh.material as THREE.MeshBasicMaterial | undefined;
        if (mesh.isMesh && m?.isMeshBasicMaterial && m.map && !m.name) mesh.visible = true;
      });
      if (spinRef.current) spinRef.current.rotation.y = 0;
    },
    [groupRef, spinRef],
  );
  return null;
}

/* ------------------------------------------------------------------ music (HomePod) */

/** The HomePod mini's playing light: magenta → violet → blue → cyan → orange, slowly. */
export const MUSIC_COLORS = ["#ff4fd8", "#8b5cff", "#3d7bff", "#2fd4ff", "#ff9a3c"];
const musicTmp = new THREE.Color();
const musicTmp2 = new THREE.Color();

export function musicColor(t: number): { hex: string; level: number } {
  const n = MUSIC_COLORS.length;
  const u = (t * 0.22) % n;
  const i = Math.floor(u);
  const f = u - i;
  const e = f * f * (3 - 2 * f);
  musicTmp.set(MUSIC_COLORS[i]!).lerp(musicTmp2.set(MUSIC_COLORS[(i + 1) % n]!), e);
  return { hex: `#${musicTmp.getHexString()}`, level: 0.8 + 0.2 * Math.sin(t * 2.4) };
}

let noteTextures: THREE.Texture[] | null = null;

/** White ♪ / ♫ / ♬ glyphs with a soft halo (tinted by the sprite color). */
function noteTexturesGet(): THREE.Texture[] {
  if (noteTextures) return noteTextures;
  noteTextures = ["♪", "♫", "♬"].map((glyph) => {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `bold 96px "Apple Symbols", "Segoe UI Symbol", "Noto Music", serif`;
    g.shadowColor = "rgba(255,255,255,0.9)";
    g.shadowBlur = 14;
    g.fillStyle = "#ffffff";
    g.fillText(glyph, size / 2, size / 2 + 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return noteTextures;
}

const NOTE_COUNT = 6;
const NOTE_CYCLE = 3.6;

/**
 * Little music notes floating up from a playing speaker and fading out (sprites: they always face the
 * camera). When the music stops, the notes in flight finish fading.
 */
export function MusicNotes({ item, playing }: { item: Item; playing: boolean }) {
  const [w, h] = item.dimensions;
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const sprites = useMemo(() => {
    const tex = noteTexturesGet();
    return Array.from({ length: NOTE_COUNT }, (_, i) => {
      const m = new THREE.SpriteMaterial({ map: tex[i % tex.length]!, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
      m.name = "music-note";
      const s = new THREE.Sprite(m);
      s.raycast = () => undefined;
      s.renderOrder = 4;
      return s;
    });
  }, []);
  useEffect(() => () => sprites.forEach((s) => s.material.dispose()), [sprites]);
  const k = useRef(playing ? 1 : 0);
  useEffect(() => invalidate(), [playing, invalidate]);
  // Notes scale with the speaker but stay readable from the usual isometric distance.
  const size = Math.max(0.13, Math.min(0.2, w * 1.4));
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const target = playing ? 1 : 0;
    if (k.current !== target) k.current = Math.abs(target - k.current) <= dt * 1.2 ? target : k.current + Math.sign(target - k.current) * dt * 1.2;
    const g = group.current;
    if (!g) return;
    g.visible = k.current > 0;
    if (!g.visible) return;
    const t = performance.now() / 1000;
    sprites.forEach((s, i) => {
      const u = (t / NOTE_CYCLE + i / NOTE_COUNT) % 1;
      const side = i % 2 ? 1 : -1;
      s.position.set(Math.sin(u * Math.PI * 2 + i * 1.7) * size * 0.55 + side * size * 0.25, h + 0.02 + u * size * 5.5, Math.cos(u * Math.PI * 1.5 + i) * size * 0.3);
      const fadeIn = Math.min(1, u / 0.15);
      const fadeOut = 1 - Math.max(0, (u - 0.55) / 0.45);
      s.material.opacity = fadeIn * fadeOut * k.current * 0.95;
      const sc = size * (0.75 + 0.35 * Math.sin(u * Math.PI));
      s.scale.set(sc, sc, 1);
      s.material.color.set(MUSIC_COLORS[(i + Math.floor(t / NOTE_CYCLE)) % MUSIC_COLORS.length]!).lerp(musicTmp2.set("#ffffff"), 0.25);
    });
    invalidate();
  });
  return (
    <group ref={group}>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ light strip glow */

let glowTexture: THREE.Texture | null = null;

/** Soft rounded-rectangle halo (white, alpha falloff), tinted by the material color. */
function stripTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  // Inner box (the TV) where the glow is strongest; falls off outside it.
  const ix = 0.3;
  const iy = 0.28;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs(x / (size - 1) - 0.5);
      const v = Math.abs(y / (size - 1) - 0.5);
      const dx = Math.max(0, u - ix) / (0.5 - ix);
      const dy = Math.max(0, v - iy) / (0.5 - iy);
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - d, 2.2);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

let riseGlowTexture: THREE.Texture | null = null;

/** Halo rising from a strip at the bottom edge: brightest along the bottom, fading upward and to the sides. */
function riseTexture(): THREE.Texture {
  if (riseGlowTexture) return riseGlowTexture;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const ix = 0.26;
  for (let y = 0; y < size; y++) {
    const v = 1 - y / (size - 1); // 0 at the bottom (the strip), 1 at the top
    const vert = Math.pow(1 - v, 1.7) * Math.min(1, (1 - v) * 14);
    for (let x = 0; x < size; x++) {
      const u = Math.abs(x / (size - 1) - 0.5);
      const du = Math.min(1, Math.max(0, u - ix * (1 - 0.5 * v)) / (0.5 - ix * (1 - 0.5 * v)));
      const horiz = Math.pow(1 - du, 2);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(vert * horiz * 255);
    }
  }
  g.putImageData(img, 0, 0);
  riseGlowTexture = new THREE.CanvasTexture(c);
  riseGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return riseGlowTexture;
}

const noRaycast = () => null;

/**
 * Colored halo of a light strip: on the wall behind a TV, rising behind a desk top (behind the
 * monitor standing on it, with a soft spill on the top), or on the floor under furniture.
 */
export function StripGlow({ item, look }: { item: Item; look: ItemLook }) {
  const [w, h, d] = item.dimensions;
  const behindTop = look.stripPlacement === "behindTop";
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: behindTop ? riseTexture() : stripTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }),
    [behindTop],
  );
  const spill = useMemo(
    () => new THREE.MeshBasicMaterial({ map: stripTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => spill.dispose(), [spill]);
  mat.name = "strip-glow";
  spill.name = "strip-glow-spill";
  const items = useStore((s) => s.scene.items);
  const anchor = useMemo(() => (behindTop ? screenOnTop(item, items) : null), [behindTop, item, items]);
  const invalidate = useThree((s) => s.invalidate);
  const k = useRef(look.strip?.on ? 1 : 0);
  useEffect(() => invalidate(), [look, invalidate]);
  useFrame((_, dtRaw) => {
    const strip = look.strip;
    const target = strip?.on ? 1 : 0;
    const dt = Math.min(dtRaw, 0.1);
    if (k.current !== target) {
      const step = dt * 3.5;
      k.current = Math.abs(target - k.current) <= step ? target : k.current + Math.sign(target - k.current) * step;
      invalidate();
    }
    if (strip) mat.color.set(strip.color);
    const level = strip ? 0.45 + 0.55 * strip.level : 0;
    mat.opacity = k.current * level * (0.7 + 0.3 * nightFx.mix);
    spill.color.copy(mat.color);
    spill.opacity = mat.opacity * (0.35 + 0.25 * nightFx.mix);
  });
  if (behindTop) {
    // Strip stuck to the back of the top: halo rising from the back edge (often against a wall, so it
    // stays just inside the desk depth) from the top up ~0.7 m,
    // centered on the monitor standing there; plus a soft colored spill on the top itself.
    const cx = anchor ? Math.max(-w / 2, Math.min(w / 2, anchor.x)) : 0;
    const haloW = Math.min(w * 1.15, Math.max(0.9, (anchor?.width ?? w * 0.6) * 1.9));
    const haloH = 0.78;
    return (
      <>
        <mesh position={[cx, h - 0.06 + haloH / 2, -d / 2 + 0.015]} material={mat} raycast={noRaycast} renderOrder={2}>
          <planeGeometry args={[haloW, haloH]} />
        </mesh>
        <mesh position={[cx, h + 0.006, -d * 0.12]} rotation={[-Math.PI / 2, 0, 0]} material={spill} raycast={noRaycast} renderOrder={2}>
          <planeGeometry args={[Math.min(w, haloW * 1.1), d * 0.9]} />
        </mesh>
      </>
    );
  }
  if (look.stripPlacement === "under") {
    // Strip under furniture (desk): a pool of colored light on the floor, a bit larger than the item.
    return (
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat} raycast={noRaycast} renderOrder={2}>
        <planeGeometry args={[w * 1.5, d * 1.9]} />
      </mesh>
    );
  }
  // Halo ~1.9× the TV, just in front of its back face (on the wall it hangs on / stands against).
  return (
    <mesh position={[0, h * 0.55, -d / 2 + 0.004]} material={mat} raycast={noRaycast} renderOrder={2}>
      <planeGeometry args={[w * 1.9, h * 2.1]} />
    </mesh>
  );
}
