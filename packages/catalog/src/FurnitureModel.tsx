import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Item } from "@appart3d/scene";
import { mergeParts } from "./merge";
import { attributesKey, modelFor } from "./model";
import { getMaterial, type Highlight } from "./theme";
import type { Part } from "./parts";

export interface FurnitureModelProps {
  item: Item;
  /** Visual state hints; the model lifts its emissive slightly and does a tiny bounce on select. */
  selected?: boolean;
  hovered?: boolean;
  /**
   * Live picture for the main "screen" part (the Maison mode draws what the real TV shows). Takes
   * precedence over `attributes.screenImage`; rendered unlit, like ScreenImage.
   */
  screenTexture?: THREE.Texture | null;
}

/**
 * Renders one item in LOCAL space: origin = center of the footprint on the floor,
 * front facing +Z, fitting exactly in item.dimensions. The caller applies position / rotationY.
 */
export function FurnitureModel({ item, selected = false, hovered = false, screenTexture = null }: FurnitureModelProps) {
  const { category, variant, color, id, attributes } = item;
  const [w, h, d] = item.dimensions;
  // attributes are compared by content (a stable serialization), not by object identity
  const attrKey = attributesKey(attributes);
  const model = useMemo(
    () => modelFor({ category, variant, color, id, dimensions: [w, h, d], attributes }),
    [category, variant, color, id, w, h, d, attrKey],
  );
  const highlight: Highlight = selected ? 2 : hovered ? 1 : 0;
  // One mesh per material, not per part (draw calls: see mergeParts).
  const merged = useMemo(() => mergeParts(model.parts), [model]);
  useEffect(() => () => merged.forEach((g) => g.geometry.dispose()), [merged]);

  // Small squash-and-stretch bounce when the item becomes selected.
  const bounce = useRef<THREE.Group>(null);
  const anim = useRef({ t: 1, wasSelected: selected });
  useFrame((_, dt) => {
    const a = anim.current;
    if (selected && !a.wasSelected) a.t = 0;
    a.wasSelected = selected;
    const g = bounce.current;
    if (!g) return;
    if (a.t < 1) {
      a.t = Math.min(1, a.t + dt / 0.35);
      const k = Math.sin(a.t * Math.PI) * (1 - a.t) * 0.12;
      g.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
    } else if (g.scale.y !== 1) {
      g.scale.set(1, 1, 1);
    }
  });

  return (
    <group ref={bounce}>
      <group position={model.fit.position} scale={model.fit.scale}>
        {merged.map((g, i) => (
          <mesh key={i} geometry={g.geometry} material={getMaterial(g.color, g.role, highlight)} castShadow={g.castShadow} receiveShadow />
        ))}
        {screenTexture && <LiveScreen parts={model.parts} texture={screenTexture} />}
        {!screenTexture &&
          (attributes?.screenImage || attributes?.image) &&
          model.parts.map((p, i) =>
            p.role === "screen" ? (
              // `image` (a print on a wall) is lit like paper; `screenImage` (TV, monitor) glows.
              <ScreenImage key={`s${i}`} part={p} url={(attributes.image ?? attributes.screenImage)!} lit={!!attributes.image} />
            ) : null,
          )}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------- live screen */

/** Largest unrotated box "screen" part (the TV panel; reflection bands are rotated). */
export function mainScreenPart(parts: readonly Part[]): Part | null {
  let best: Part | null = null;
  let area = 0;
  for (const p of parts) {
    if (p.role !== "screen" || p.geo.kind !== "box" || p.rot) continue;
    const s = p.scale ?? [1, 1, 1];
    const a = p.geo.size[0] * s[0] * p.geo.size[1] * s[1];
    if (a > area) {
      area = a;
      best = p;
    }
  }
  return best;
}

function LiveScreen({ parts, texture }: { parts: readonly Part[]; texture: THREE.Texture }) {
  const part = useMemo(() => mainScreenPart(parts), [parts]);
  // Unnamed basic material with a map: the Maison look driver hides it when the TV is off.
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  useEffect(() => () => material.dispose(), [material]);
  if (!part || part.geo.kind !== "box") return null;
  const [sx, sy, sz] = part.geo.size;
  const [px, py, pz] = part.pos;
  const scale = part.scale ?? [1, 1, 1];
  return (
    <mesh position={[px, py, pz + (sz * scale[2]) / 2 + 0.0025]} material={material}>
      <planeGeometry args={[sx * scale[0], sy * scale[1]]} />
    </mesh>
  );
}

/* ------------------------------------------------------------- screen image */

const textures = new Map<string, Promise<THREE.Texture>>();

function loadTexture(url: string): Promise<THREE.Texture> {
  let t = textures.get(url);
  if (!t) {
    t = new THREE.TextureLoader().loadAsync(url).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    });
    textures.set(url, t);
  }
  return t;
}

/**
 * `item.attributes.screenImage`: an image shown on the front face of a "screen" part (TV, monitor),
 * unlit so it glows like a real screen (day and night). Only unrotated box screens are supported.
 */
function ScreenImage({ part, url, lit = false }: { part: Part; url: string; lit?: boolean }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    loadTexture(url).then(
      (t) => alive && setTex(t),
      () => undefined, // broken URL: keep the plain screen
    );
    return () => {
      alive = false;
    };
  }, [url]);
  const material = useMemo(
    () => (tex ? (lit ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 }) : new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })) : null),
    [tex, lit],
  );
  useEffect(() => () => material?.dispose(), [material]);
  if (!material || part.geo.kind !== "box" || part.rot) return null;
  const [sx, sy, sz] = part.geo.size;
  const [px, py, pz] = part.pos;
  const scale = part.scale ?? [1, 1, 1];
  return (
    <mesh position={[px, py, pz + (sz * scale[2]) / 2 + 0.0015]} material={material}>
      <planeGeometry args={[sx * scale[0], sy * scale[1]]} />
    </mesh>
  );
}
