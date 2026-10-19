import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { sceneBounds, type Scene } from "@appart3d/scene";
import { isEyeView, useStore } from "../state/store";
import { nightFx } from "../state/night";
import { useEmbed } from "../state/embed";
import { NightController, NightLights } from "./NightLights";

const DAY = {
  sky: new THREE.Color("#fff7ec"),
  ground: new THREE.Color("#cdb8a2"),
  hemi: 1.35,
  ambient: new THREE.Color("#ffffff"),
  ambientEye: new THREE.Color("#fff6ea"),
  sun: new THREE.Color("#fff1dd"),
  sunI: 2.1,
};
const NIGHT = {
  sky: new THREE.Color("#5b6cb4"),
  ground: new THREE.Color("#2a2140"),
  hemi: 0.13,
  ambient: new THREE.Color("#5d68b0"),
  sun: new THREE.Color("#a9bcff"),
  sunI: 0.75,
};

/** Golden hour (sun near the horizon, following the real sun): warm low light. */
const DUSK = {
  sky: new THREE.Color("#ffb98f"),
  ground: new THREE.Color("#9c6a62"),
  sun: new THREE.Color("#ff9a52"),
  ambient: new THREE.Color("#ffc9a8"),
};
const lowSun = new THREE.Vector3();

/**
 * Warm sky/ground fill + one soft sun with shadows sized to the apartment. At night (eased by
 * `nightFx.mix`) the fill turns faint blue-violet and the sun becomes a low, cool moon; the
 * interior lamps take over (<NightLights>).
 */
export function Lights() {
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  // Standing inside under a ceiling: a bit more fill so the room doesn't go dim.
  const eye = useStore(isEyeView);
  const b = useMemo(() => sceneBounds({ walls, rooms } as Scene), [walls, rooms]);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[1] + b.max[1]) / 2;
  const radius = Math.max(4, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2 + 1.5);

  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight("#fff1dd", 2.1);
    l.castShadow = true;
    // Embedded view (phones): a lighter shadow map.
    const size = useEmbed.getState().active ? 1024 : 2048;
    l.shadow.mapSize.set(size, size);
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 4;
    return l;
  }, []);
  useEffect(() => () => sun.dispose(), [sun]);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const catcher = useRef<THREE.ShadowMaterial>(null);

  // Sun (day) and moon (night) positions; the light glides between them during the transition.
  const sunPos = useMemo(() => new THREE.Vector3(cx - radius * 0.6, radius * 2.2, cz + radius * 0.9), [cx, cz, radius]);
  // Low moon behind the apartment (opposite the default camera): visible faces stay dark, its light
  // falls through the far windows onto the floors.
  const moonPos = useMemo(() => new THREE.Vector3(cx - radius * 1.25, radius * 1.05, cz - radius * 1.35), [cx, cz, radius]);

  useEffect(() => {
    sun.target.position.set(cx, 0, cz);
    sun.target.updateMatrixWorld();
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -radius * 1.15;
    cam.right = cam.top = radius * 1.15;
    cam.near = 0.5;
    cam.far = radius * 6;
    cam.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
  }, [sun, cx, cz, radius]);

  const last = useRef({ mix: -1, dusk: -1, eye, sunPos });
  useFrame(() => {
    const k = nightFx.mix;
    const dk = nightFx.dusk;
    const l = last.current;
    if (k === l.mix && dk === l.dusk && eye === l.eye && sunPos === l.sunPos) return;
    last.current = { mix: k, dusk: dk, eye, sunPos };
    // Golden hour: the sun drops toward the horizon (long shadows) and turns orange; the fill warms up.
    lowSun.set(cx - radius * 1.5, radius * 0.75, cz + radius * 1.1);
    sun.position.lerpVectors(sunPos, lowSun, dk * 0.7).lerp(moonPos, k);
    sun.color.lerpColors(DAY.sun, NIGHT.sun, k).lerp(DUSK.sun, dk * 0.75);
    sun.intensity = DAY.sunI + (NIGHT.sunI - DAY.sunI) * k;
    if (hemi.current) {
      hemi.current.color.lerpColors(DAY.sky, NIGHT.sky, k).lerp(DUSK.sky, dk * 0.6);
      hemi.current.groundColor.lerpColors(DAY.ground, NIGHT.ground, k).lerp(DUSK.ground, dk * 0.5);
      hemi.current.intensity = DAY.hemi + (NIGHT.hemi - DAY.hemi) * k;
    }
    if (ambient.current) {
      ambient.current.color.lerpColors(eye ? DAY.ambientEye : DAY.ambient, NIGHT.ambient, k).lerp(DUSK.ambient, dk * 0.5);
      const dayI = eye ? 0.55 : 0.25;
      const nightI = eye ? 0.12 : 0.05;
      ambient.current.intensity = dayI + (nightI - dayI) * k;
    }
    if (catcher.current) catcher.current.opacity = 0.13 - 0.09 * k;
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff7ec", "#cdb8a2", 1.35]} />
      {/* Intensities / colors are driven every transition frame below (not by props). */}
      <ambientLight ref={ambient} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      {/* Soft shadow catcher under the dollhouse */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.081, cz]} receiveShadow raycast={() => null}>
        <circleGeometry args={[radius * 2.2, 48]} />
        <shadowMaterial ref={catcher} transparent opacity={0.13} />
      </mesh>
      <NightController />
      <NightLights />
    </>
  );
}
