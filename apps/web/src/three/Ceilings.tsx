import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room, Scene } from "@appart3d/scene";
import { isEyeView, useStore } from "../state/store";
import { nightFx } from "../state/night";
import { roomCeilingHeight } from "../lib/mount";

export const CEILING_COLOR = "#fbf6ee";
const noRaycast = () => null;
const CEILING_DAY_EMISSIVE = new THREE.Color(CEILING_COLOR).multiplyScalar(0.55);
const CEILING_NIGHT_EMISSIVE = new THREE.Color("#2a2c4a").multiplyScalar(0.25);

/**
 * Warm white ceiling per room, only when standing inside (photo mode « À hauteur d'yeux »).
 * Single-sided, facing down: invisible from above anyway, never casts shadows.
 */
export function Ceilings() {
  const eye = useStore(isEyeView);
  const rooms = useStore((s) => s.scene.rooms);
  const walls = useStore((s) => s.scene.walls);
  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: CEILING_COLOR,
        // Lit from below only by the hemisphere's ground color: lift it so it reads as white plaster.
        emissive: new THREE.Color(CEILING_COLOR).multiplyScalar(0.55),
        side: THREE.FrontSide,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  // Night: no fake bounce light — the ceiling is lit by the pendants / lamps below it.
  const lastMix = useRef(-1);
  useFrame(() => {
    if (nightFx.mix === lastMix.current) return;
    lastMix.current = nightFx.mix;
    material.emissive.copy(CEILING_DAY_EMISSIVE).lerp(CEILING_NIGHT_EMISSIVE, nightFx.mix);
  });
  if (!eye) return null;
  return (
    <group>
      {rooms.map((r) => (
        <Ceiling key={r.id} room={r} height={roomCeilingHeight({ walls, rooms } as Pick<Scene, "walls" | "rooms">, r)} material={material} />
      ))}
    </group>
  );
}

const Ceiling = memo(function Ceiling({ room, height, material }: { room: Room; height: number; material: THREE.Material }) {
  const geometry = useMemo(() => {
    // Shape in (x, z); rotating +90° about X maps it onto the XZ plane with its normal pointing down.
    const g = new THREE.ShapeGeometry(new THREE.Shape(room.floor.map(([x, z]) => new THREE.Vector2(x, z))));
    g.rotateX(Math.PI / 2);
    return g;
  }, [room.floor]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} position-y={height - 0.004} receiveShadow={false} raycast={noRaycast} />;
});
