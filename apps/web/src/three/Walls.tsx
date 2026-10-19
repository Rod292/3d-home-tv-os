import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { theme } from "@appart3d/catalog";
import { wallAngle, wallFaceColor, wallNormal, type Opening, type Wall } from "@appart3d/scene";
import { isCutActive, useStore } from "../state/store";
import { nightFx } from "../state/night";
import { useWallFace } from "../state/wallFace";
import { CUT_HEIGHT, computeWallFacings, isWallCut, type WallFacing } from "../lib/cutaway";
import { roomOfFace } from "../lib/mount";
import { buildWallGeometry, localOpenings, sideOfMaterialIndex, WALL_GROUP, type LocalOpening } from "./wallGeometry";
import { OPENING_COLORS, outsideToon, ownedToon } from "./materials";
import { wallHeights } from "./wallCut";

const noRaycast = () => null;

export function Walls() {
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  const openings = useStore((s) => s.scene.openings);
  const facings = useMemo(() => computeWallFacings({ walls, rooms }), [walls, rooms]);
  const byWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    for (const o of openings) m.set(o.wallId, [...(m.get(o.wallId) ?? []), o]);
    return m;
  }, [openings]);
  // Picked face (rooms mode only, and only while its room is the selected one).
  const face = useWallFace((s) => s.face);
  const showFace = useStore((s) => s.mode === "rooms" && !!face && face.roomId === s.selectedRoomId);
  return (
    <group>
      {walls.map((w) => (
        <WallMesh
          key={w.id}
          wall={w}
          openings={byWall.get(w.id) ?? EMPTY}
          facing={facings.get(w.id)!}
          pickedSide={showFace && face?.wallId === w.id ? face.side : null}
        />
      ))}
    </group>
  );
}

const EMPTY: Opening[] = [];
const tmpDir = new THREE.Vector3();
const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });

/** Rooms mode: clicking a wall face picks it (and the room it looks into) for painting. */
function onWallClick(e: ThreeEvent<MouseEvent>, wall: Wall) {
  const s = useStore.getState();
  if (s.mode !== "rooms" || e.delta > 5) return;
  const side = sideOfMaterialIndex(e.face?.materialIndex);
  if (!side) return;
  e.stopPropagation();
  const room = roomOfFace(s.scene, wall, side);
  useWallFace.getState().setFace({ wallId: wall.id, side, roomId: room?.id ?? null });
  if (room) s.selectRoom(room.id);
}

const WallMesh = memo(function WallMesh({
  wall,
  openings,
  facing,
  pickedSide,
}: {
  wall: Wall;
  openings: Opening[];
  facing: WallFacing;
  pickedSide: "left" | "right" | null;
}) {
  const local = useMemo(() => localOpenings(wall, openings), [wall, openings]);
  const geometry = useMemo(() => buildWallGeometry(wall, local), [wall, local]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), wall.height), [wall.height]);
  // One material per distinct color (both faces share it when they match); ends / reveals stay neutral.
  const leftColor = wallFaceColor(wall, "left") ?? theme.wall;
  const rightColor = wallFaceColor(wall, "right") ?? theme.wall;
  const sideColor = wall.color ?? theme.wall;
  // Outer face of an envelope wall: not lit by the interior night lamps.
  const outerSide = facing.exterior ? (wallNormal(wall)[0] * facing.normal[0] + wallNormal(wall)[1] * facing.normal[1] > 0 ? "left" : "right") : null;
  const materials = useMemo(() => {
    const byColor = new Map<string, THREE.Material>();
    const get = (c: string, outside = false) => {
      const k = outside ? `out:${c}` : c;
      let m = byColor.get(k);
      if (!m) byColor.set(k, (m = outside ? outsideToon(c, { clip: plane }) : ownedToon(c, { clip: plane })));
      return m;
    };
    const list: THREE.Material[] = [];
    list[WALL_GROUP.right] = get(rightColor, outerSide === "right");
    list[WALL_GROUP.left] = get(leftColor, outerSide === "left");
    list[WALL_GROUP.sides] = get(sideColor);
    return { list, owned: [...byColor.values()] };
  }, [leftColor, rightColor, sideColor, plane, outerSide]);
  useEffect(() => () => materials.owned.forEach((m) => m.dispose()), [materials]);
  const cap = useMemo(
    () => new THREE.MeshBasicMaterial({ color: theme.wallCap, side: THREE.BackSide, clippingPlanes: [plane] }),
    [plane],
  );
  useEffect(() => () => cap.dispose(), [cap]);
  const pickMaterials = useMemo(() => {
    if (!pickedSide) return null;
    const hl = new THREE.MeshBasicMaterial({
      color: theme.selection,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      clippingPlanes: [plane],
    });
    const list: THREE.Material[] = [hiddenMaterial, hiddenMaterial, hiddenMaterial];
    list[WALL_GROUP[pickedSide]] = hl;
    return { list, hl };
  }, [pickedSide, plane]);
  useEffect(() => () => pickMaterials?.hl.dispose(), [pickMaterials]);

  const height = useRef(wall.height);
  useEffect(() => () => void wallHeights.delete(wall.id), [wall.id]);
  useFrame(({ camera, invalidate }, dt) => {
    const s = useStore.getState();
    const full = wall.height - 0.002;
    let target = full;
    if (isCutActive(s)) {
      camera.getWorldDirection(tmpDir);
      if (isWallCut(facing, [tmpDir.x, tmpDir.z])) target = Math.min(CUT_HEIGHT, full);
    }
    const diff = target - height.current;
    if (Math.abs(diff) > 0.0005) {
      height.current += diff * (1 - Math.exp(-Math.min(dt, 0.1) * 9));
      invalidate();
    } else height.current = target;
    plane.constant = height.current;
    wallHeights.set(wall.id, height.current);
  });

  return (
    <group position={[wall.start[0], 0, wall.start[1]]} rotation-y={wallAngle(wall)}>
      <mesh geometry={geometry} material={materials.list} castShadow receiveShadow onClick={(e) => onWallClick(e, wall)} />
      <mesh geometry={geometry} material={cap} raycast={noRaycast} />
      {pickMaterials && <mesh geometry={geometry} material={pickMaterials.list} raycast={noRaycast} renderOrder={2} />}
      {local.length > 0 && <Openings wall={wall} openings={local} plane={plane} />}
    </group>
  );
});

function Openings({ wall, openings, plane }: { wall: Wall; openings: LocalOpening[]; plane: THREE.Plane }) {
  const mats = useMemo(
    () => ({
      frame: ownedToon(OPENING_COLORS.frame, { clip: plane }),
      leaf: ownedToon(OPENING_COLORS.leaf, { clip: plane }),
      knob: ownedToon(OPENING_COLORS.knob, { clip: plane }),
      sill: ownedToon(OPENING_COLORS.sill, { clip: plane }),
      glass: new THREE.MeshStandardMaterial({
        color: OPENING_COLORS.glass,
        transparent: true,
        opacity: 0.32,
        roughness: 0.1,
        metalness: 0,
        depthWrite: false,
        clippingPlanes: [plane],
      }),
    }),
    [plane],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  // Night: the glass turns deep blue with a faint cool sheen (sky reflection).
  const lastMix = useRef(-1);
  useFrame(() => {
    const k = nightFx.mix;
    if (k === lastMix.current) return;
    lastMix.current = k;
    const g = mats.glass;
    g.color.lerpColors(GLASS_DAY, GLASS_NIGHT, k);
    g.emissive.copy(GLASS_SHEEN);
    g.emissiveIntensity = 0.32 * k;
    g.opacity = 0.32 + 0.5 * k;
  });
  const t = wall.thickness;
  return (
    <group>
      {openings.map((o) =>
        o.opening.kind === "door" ? (
          <Door key={o.opening.id} o={o} t={t} mats={mats} />
        ) : o.opening.kind === "window" ? (
          <Window key={o.opening.id} o={o} t={t} mats={mats} />
        ) : null,
      )}
    </group>
  );
}

type Mats = Record<"frame" | "leaf" | "knob" | "sill", THREE.Material> & { glass: THREE.MeshStandardMaterial };

const GLASS_DAY = new THREE.Color(OPENING_COLORS.glass);
const GLASS_NIGHT = new THREE.Color("#16204a");
const GLASS_SHEEN = new THREE.Color("#4d6bb8");

function Box({ size, position, material, shadow = true }: { size: [number, number, number]; position: [number, number, number]; material: THREE.Material; shadow?: boolean }) {
  return (
    <mesh position={position} material={material} castShadow={shadow} receiveShadow raycast={noRaycast}>
      <boxGeometry args={size} />
    </mesh>
  );
}

const FRAME = 0.06;

function Door({ o, t, mats }: { o: LocalOpening; t: number; mats: Mats }) {
  const w = o.u1 - o.u0;
  const h = o.v1;
  const depth = t + 0.03;
  const leafW = w - FRAME * 2;
  const leafH = h - FRAME;
  const ajar = o.opening.isOpen === false ? 0 : -0.45;
  return (
    <group>
      <Box size={[FRAME, h, depth]} position={[o.u0 + FRAME / 2, h / 2, 0]} material={mats.frame} />
      <Box size={[FRAME, h, depth]} position={[o.u1 - FRAME / 2, h / 2, 0]} material={mats.frame} />
      <Box size={[w, FRAME, depth]} position={[(o.u0 + o.u1) / 2, h - FRAME / 2, 0]} material={mats.frame} />
      {leafW > 0.2 && (
        <group position={[o.u0 + FRAME, 0, t / 2 - 0.02]} rotation-y={ajar}>
          <Box size={[leafW, leafH, 0.04]} position={[leafW / 2, leafH / 2, 0]} material={mats.leaf} />
          <mesh position={[leafW - 0.08, 1.0, 0.04]} material={mats.knob} raycast={noRaycast}>
            <sphereGeometry args={[0.025, 10, 8]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Window({ o, t, mats }: { o: LocalOpening; t: number; mats: Mats }) {
  const w = o.u1 - o.u0;
  const h = o.v1 - o.v0;
  const cu = (o.u0 + o.u1) / 2;
  const cv = (o.v0 + o.v1) / 2;
  const P = 0.05;
  const depth = 0.08;
  return (
    <group>
      <Box size={[P, h, depth]} position={[o.u0 + P / 2, cv, 0]} material={mats.frame} />
      <Box size={[P, h, depth]} position={[o.u1 - P / 2, cv, 0]} material={mats.frame} />
      <Box size={[w, P, depth]} position={[cu, o.v1 - P / 2, 0]} material={mats.frame} />
      <Box size={[w, P, depth]} position={[cu, o.v0 + P / 2, 0]} material={mats.frame} />
      {w > 0.9 && <Box size={[P * 0.8, h - P * 2, depth * 0.8]} position={[cu, cv, 0]} material={mats.frame} />}
      <Box size={[w + 0.1, 0.035, t + 0.08]} position={[cu, o.v0 - 0.0175, 0]} material={mats.sill} />
      <mesh position={[cu, cv, 0]} material={mats.glass} raycast={noRaycast} renderOrder={2}>
        <boxGeometry args={[w - P * 2, h - P * 2, 0.012]} />
      </mesh>
    </group>
  );
}
