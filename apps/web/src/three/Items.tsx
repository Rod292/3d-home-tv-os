import { Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { FurnitureModel, theme } from "@appart3d/catalog";
import { roomAt, type Item, type ItemMount, type Room, type Vec2, type Vec3 } from "@appart3d/scene";
import { isCutActive, useStore } from "../state/store";
import { itemCollisions } from "../lib/collision";
import { snapItem, snapToGrid } from "../lib/snapping";
import { ceilingItemY, mountedPose, roomCeilingHeight, snapToWall, type MountedPose } from "../lib/mount";
import { CUT_HEIGHT, nearestRoom } from "../lib/cutaway";
import { applyGhost } from "./ghost";
import { applyLook, LookDriver, MusicNotes, restoreLook, StripGlow } from "./DeviceLook";
import { useTvScreenTexture } from "./TvScreen";
import { useHome } from "../state/home";
import { embedItemTapped, useEmbed } from "../state/embed";
import { itemForDevice } from "../lib/embed";
import { lookForItem, screenOnTop, type ItemLook } from "../lib/home";
import { wallHeights } from "./wallCut";

const noRaycast = () => null;
const COLLISION_COLOR = "#d9443a";

/** Ceiling height lookup with one computation per room (rooms / walls change rarely). */
function useCeilingLookup() {
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  return useMemo(() => {
    const scene = { walls, rooms };
    const heights = new Map<Room, number>();
    return (pt: Vec2): number => {
      const room = roomAt({ rooms } as never, pt) ?? nearestRoom(scene as never, pt);
      let h = room ? heights.get(room) : undefined;
      if (h === undefined) {
        h = roomCeilingHeight(scene, room);
        if (room) heights.set(room, h);
      }
      return h;
    };
  }, [walls, rooms]);
}

export function Items() {
  const items = useStore((s) => s.scene.items);
  const scene = useStore((s) => s.scene);
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  const mode = useStore((s) => s.mode);
  const selectedId = useStore((s) => s.selectedItemId);
  const hoveredId = useStore((s) => s.hoveredItemId);
  // Ceiling items would hide the room from above: ghost them unless standing inside (or walls full).
  const ghostCeiling = useStore(isCutActive);
  const editing = mode === "arrange";
  // Maison mode: items linked to devices show their real state and toggle them on click.
  const homeMode = mode === "home";
  const byItem = useHome((s) => s.byItem);
  // Embedded 3D view (native apps): every item is tappable (reported to the app, no toggling), no
  // hover halos (touch), halo on the item of the highlighted device and briefly on the tapped item.
  const embed = useEmbed((s) => s.active);
  const highlightDeviceId = useEmbed((s) => s.highlightDeviceId);
  const flashItemId = useEmbed((s) => s.flashItemId);
  const devices = useHome((s) => s.devices);
  const highlightItemId = useMemo(() => (embed ? itemForDevice(devices, highlightDeviceId) : null), [embed, devices, highlightDeviceId]);
  const ceilingAt = useCeilingLookup();
  const startDrag = useItemDrag(ceilingAt);

  // Rendered poses; previous objects are reused when unchanged so memoized views don't re-render.
  const poseCache = useRef(new Map<string, MountedPose>());
  const poses = useMemo(() => {
    const prev = poseCache.current;
    const next = new Map<string, MountedPose>();
    for (const it of items) {
      const p = mountedPose(it, { walls, rooms }, ceilingAt);
      const old = prev.get(it.id);
      next.set(
        it.id,
        old && old.mount === p.mount && old.hostWallId === p.hostWallId && old.rotationY === p.rotationY && sameVec(old.position, p.position)
          ? old
          : p,
      );
    }
    poseCache.current = next;
    return next;
  }, [items, walls, rooms, ceilingAt]);

  const selected = editing ? items.find((i) => i.id === selectedId) : undefined;
  const collidingId = useMemo(() => {
    if (!selected) return null;
    const r = itemCollisions(selected, scene);
    return r.walls.length || r.items.length ? selected.id : null;
  }, [selected, scene]);

  // Looks are recomputed only when the devices change; unchanged items keep the same object (memo).
  const lookCache = useRef(new Map<string, { devices: unknown; category: string; onTop: boolean; look: ItemLook | undefined }>());
  const looks = useMemo(() => {
    const next = new Map<string, ItemLook | undefined>();
    if (!homeMode) return next;
    const cache = lookCache.current;
    for (const it of items) {
      const devices = byItem.get(it.id);
      const old = cache.get(it.id);
      // A screen standing on the furniture: its light strip is behind the top (desk backlight).
      const onTop = !!devices?.length && !!screenOnTop(it, items);
      if (old && old.devices === devices && old.category === it.category && old.onTop === onTop) next.set(it.id, old.look);
      else {
        const look = lookForItem(it.category, devices, { screenOnTop: onTop });
        cache.set(it.id, { devices, category: it.category, onTop, look });
        next.set(it.id, look);
      }
    }
    return next;
  }, [homeMode, items, byItem]);

  // Cursor feedback.
  const gl = useThree((s) => s.gl);
  const dragging = useStore((s) => s.dragging);
  const hoverClickable = homeMode && !!hoveredId && byItem.has(hoveredId);
  useEffect(() => {
    gl.domElement.style.cursor = dragging ? "grabbing" : editing && hoveredId ? "grab" : hoverClickable ? "pointer" : "";
  }, [gl, dragging, editing, hoveredId, hoverClickable]);

  return (
    <group>
      {items.map((it) => {
        const pose = poses.get(it.id)!;
        const clickable = homeMode && (embed || byItem.has(it.id));
        return (
          <ItemView
            key={it.id}
            item={it}
            pose={pose}
            ghost={pose.mount === "ceiling" && ghostCeiling}
            editing={editing}
            selected={editing && it.id === selectedId}
            hovered={!embed && (editing || clickable) && it.id === hoveredId}
            marked={embed && (it.id === highlightItemId || it.id === flashItemId)}
            embed={embed}
            colliding={it.id === collidingId}
            onDown={startDrag}
            look={looks.get(it.id)}
            clickable={clickable}
          />
        );
      })}
    </group>
  );
}

const sameVec = (a: Vec3, b: Vec3) => a === b || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

interface ItemViewProps {
  item: Item;
  pose: MountedPose;
  ghost: boolean;
  editing: boolean;
  selected: boolean;
  hovered: boolean;
  colliding: boolean;
  onDown: (e: ThreeEvent<PointerEvent>, item: Item, mount: ItemMount) => void;
  /** Maison mode: real state of the linked devices. */
  look?: ItemLook;
  /** Maison mode: linked to a device (hover + click toggles). */
  clickable?: boolean;
  /** Embedded view: highlighted device's item, or just tapped (strong halo). */
  marked?: boolean;
  /** Embedded view: taps are reported to the native app instead of toggling devices. */
  embed?: boolean;
}

/** Maison mode: where the current press on a linked item started. */
let homePress: { itemId: string; x: number; y: number; t: number } | null = null;

const ItemView = memo(function ItemView({ item, pose, ghost, editing, selected, hovered, colliding, onDown, look, clickable, marked, embed }: ItemViewProps) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const lookMats = useRef<ReturnType<typeof applyLook>>([]);
  // What the real TV shows (Maison mode), drawn on its screen.
  const screenTexture = useTvScreenTexture(look?.screen?.content);
  // Runs after every render, i.e. after R3F re-applied the shared catalog materials.
  useLayoutEffect(() => {
    restoreLook(group.current);
    applyGhost(group.current, ghost);
    lookMats.current = applyLook(group.current, item.id, look);
  });
  // The model mounts asynchronously (Suspense): pick its materials up once it is there.
  useEffect(() => {
    if (!look) return;
    const t = setTimeout(() => {
      restoreLook(group.current);
      lookMats.current = applyLook(group.current, item.id, look);
    }, 50);
    return () => clearTimeout(t);
  }, [look, item.id]);
  const handlers = editing
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          useStore.getState().hoverItem(item.id);
        },
        onPointerOut: () => {
          if (useStore.getState().hoveredItemId === item.id) useStore.getState().hoverItem(null);
        },
        onPointerDown: (e: ThreeEvent<PointerEvent>) => onDown(e, item, pose.mount),
        // Keep the click from reaching the floor underneath (which would deselect).
        onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
      }
    : clickable
      ? {
          ...(embed
            ? {}
            : {
                onPointerOver: (e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  useStore.getState().hoverItem(item.id);
                },
                onPointerOut: () => {
                  if (useStore.getState().hoveredItemId === item.id) useStore.getState().hoverItem(null);
                },
              }),
          // Click = press and release on the item without dragging (orbit). Done by hand: R3F's onClick
          // does not reach items while the orbit controls hold the pointer capture.
          onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            if (e.button !== 0) return;
            homePress = { itemId: item.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, t: performance.now() };
          },
          onPointerUp: (e: ThreeEvent<PointerEvent>) => {
            const p = homePress;
            homePress = null;
            if (!p || p.itemId !== item.id || e.button !== 0) return;
            if (Math.hypot(e.nativeEvent.clientX - p.x, e.nativeEvent.clientY - p.y) > 6 || performance.now() - p.t > 700) return;
            e.stopPropagation();
            if (embed) embedItemTapped(item.id);
            else useHome.getState().itemClicked(item.id);
          },
        }
      : {};
  return (
    <group ref={group} position={pose.position} rotation-y={pose.rotationY} {...handlers}>
      <group ref={spin}>
        <Suspense fallback={null}>
          <FurnitureModel item={item} selected={selected} hovered={hovered} screenTexture={look?.screen?.on ? screenTexture : null} />
        </Suspense>
      </group>
      {look && <LookDriver look={look} mats={lookMats} groupRef={group} spinRef={spin} />}
      {look?.strip && <StripGlow item={item} look={look} />}
      {look?.music && <MusicNotes item={item} playing={look.music.playing} />}
      {(selected || hovered || colliding || marked) && (
        <Halo
          w={item.dimensions[0]}
          h={item.dimensions[1]}
          d={item.dimensions[2]}
          color={colliding ? COLLISION_COLOR : theme.selection}
          strong={selected || !!marked}
        />
      )}
      {pose.hostWallId && (
        <HideWithWall groupRef={group} wallId={pose.hostWallId} bottom={pose.position[1]} top={pose.position[1] + item.dimensions[1]} keep={selected} />
      )}
    </group>
  );
});

/**
 * Wall items vanish once the cutaway lowers their wall past them (following the wall's eased height),
 * so mirrors and frames never float in mid-air. The selected item stays visible while it is edited.
 */
function HideWithWall({
  groupRef,
  wallId,
  bottom,
  top,
  keep,
}: {
  groupRef: React.RefObject<THREE.Group | null>;
  wallId: string;
  bottom: number;
  top: number;
  keep: boolean;
}) {
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const h = wallHeights.get(wallId);
    // Low, short items (radiators) still touch the cut wall stub: keep them. Others go once the wall
    // top drops below their middle.
    const threshold = bottom < CUT_HEIGHT && top - bottom < 1 ? bottom : bottom + (top - bottom) * 0.5;
    const visible = keep || h === undefined || h >= threshold;
    if (g.visible !== visible) g.visible = visible;
  });
  useEffect(
    () => () => {
      if (groupRef.current) groupRef.current.visible = true;
    },
    [groupRef],
  );
  return null;
}

/** Footprint ring on the floor + box edges, drawn around the selected / hovered item. */
function Halo({ w, h, d, color, strong }: { w: number; h: number; d: number; color: string; strong: boolean }) {
  const ring = useMemo(() => {
    const pad = 0.05;
    const band = strong ? 0.06 : 0.035;
    const outer = roundedRect(w / 2 + pad + band, d / 2 + pad + band, 0.08);
    outer.holes.push(roundedRect(w / 2 + pad, d / 2 + pad, 0.05));
    const g = new THREE.ShapeGeometry(outer, 4);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [w, d, strong]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.03, h + 0.03, d + 0.03)), [w, h, d]);
  useEffect(() => () => ring.dispose(), [ring]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <group>
      <mesh geometry={ring} position-y={0.012} raycast={noRaycast} renderOrder={3}>
        <meshBasicMaterial color={color} transparent opacity={strong ? 0.95 : 0.6} depthWrite={false} />
      </mesh>
      {strong && (
        <lineSegments geometry={edges} position-y={h / 2} raycast={noRaycast} renderOrder={3}>
          <lineBasicMaterial color={color} transparent opacity={0.9} depthTest={false} />
        </lineSegments>
      )}
    </group>
  );
}

function roundedRect(hx: number, hz: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const rr = Math.min(r, hx, hz);
  s.moveTo(-hx + rr, -hz);
  s.lineTo(hx - rr, -hz);
  s.quadraticCurveTo(hx, -hz, hx, -hz + rr);
  s.lineTo(hx, hz - rr);
  s.quadraticCurveTo(hx, hz, hx - rr, hz);
  s.lineTo(-hx + rr, hz);
  s.quadraticCurveTo(-hx, hz, -hx, hz - rr);
  s.lineTo(-hx, -hz + rr);
  s.quadraticCurveTo(-hx, -hz, -hx + rr, -hz);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Dragging: floor items on the floor plane (grid + wall magnet), wall items slide along wall faces,
// ceiling items move in XZ under the ceiling.

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

interface ControlsLike {
  enabled: boolean;
}

function useItemDrag(ceilingAt: (pt: Vec2) => number) {
  const get = useThree((s) => s.get);
  const ceilingRef = useRef(ceilingAt);
  ceilingRef.current = ceilingAt;
  return useMemo(
    () => (e: ThreeEvent<PointerEvent>, item: Item, mount: ItemMount) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const store = useStore.getState();
      store.selectItem(item.id);

      const { gl, invalidate } = get();
      const controls = get().controls as unknown as ControlsLike | null;
      if (controls) controls.enabled = false;

      // Drag on a horizontal plane at the height the user grabbed (the item's middle for wall items).
      const planeY = mount === "wall" ? item.position[1] + item.dimensions[1] / 2 : mount === "ceiling" ? e.point.y : 0;
      const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const groundAt = (clientX: number, clientY: number): THREE.Vector3 | null => {
        const rect = gl.domElement.getBoundingClientRect();
        ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, get().camera);
        return raycaster.ray.intersectPlane(dragPlane, hit);
      };

      const native = e.nativeEvent;
      const pointerId = native.pointerId;
      const start = groundAt(native.clientX, native.clientY);
      // Wall items follow the pointer itself (it picks the wall); others keep the grab offset.
      const offset: [number, number] = start && mount !== "wall" ? [item.position[0] - start.x, item.position[2] - start.z] : [0, 0];
      const sx = native.clientX;
      const sy = native.clientY;
      let moving = false;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (!moving) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
          moving = true;
          useStore.getState().beginGesture();
          useStore.getState().setDragging(true);
        }
        const p = groundAt(ev.clientX, ev.clientY);
        if (!p) return;
        const s = useStore.getState();
        const x = p.x + offset[0];
        const z = p.z + offset[1];
        let position: Vec3;
        let rotationY = item.rotationY;
        if (mount === "wall") {
          const snap = snapToWall(item, x, z, s.scene, { disabled: ev.altKey });
          position = snap ? [snap.position[0], item.position[1], snap.position[1]] : [x, item.position[1], z];
          if (snap) rotationY = snap.rotationY;
        } else if (mount === "ceiling") {
          const px = ev.altKey ? x : snapToGrid(x);
          const pz = ev.altKey ? z : snapToGrid(z);
          position = [px, ceilingItemY(item, ceilingRef.current([px, pz])), pz];
        } else {
          const snap = snapItem(item, x, z, s.scene, { disabled: ev.altKey });
          position = snap.position;
          rotationY = snap.rotationY;
        }
        // Wall items: the room is the one in front of the face, not the one under the wall.
        const probe: Vec2 = mount === "wall" ? [position[0] + Math.sin(rotationY) * 0.2, position[2] + Math.cos(rotationY) * 0.2] : [position[0], position[2]];
        const room = roomAt(s.scene, probe);
        s.gestureUpdate((d) => {
          const it = d.items.find((i) => i.id === item.id);
          if (!it) return;
          it.position = position;
          it.rotationY = rotationY;
          if (room) it.roomId = room.id;
          else delete it.roomId;
        });
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (controls) controls.enabled = true;
        if (moving) {
          useStore.getState().endGesture();
          useStore.getState().setDragging(false);
        }
        invalidate();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [get],
  );
}
