import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { theme, toonMaterial } from "@appart3d/catalog";
import { polygonArea, type Room } from "@appart3d/scene";
import { useStore } from "../state/store";
import { cameraBus } from "../state/view";
import { centroid } from "../lib/geom2d";
import { PLINTH_COLOR, floorTexture, ownedToon } from "./materials";

const SLAB = 0.08;
const noRaycast = () => null;

function roomShape(room: Room): THREE.Shape {
  // Shape coords (x, -z): after rotateX(-90°) the shape lies on the XZ plane with the right handedness.
  const pts = room.floor.map(([x, z]) => new THREE.Vector2(x, -z));
  return new THREE.Shape(pts);
}

export function roomFocusSize(room: Room): number {
  const xs = room.floor.map((p) => p[0]);
  const zs = room.floor.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1.5);
}

export function Floors() {
  const rooms = useStore((s) => s.scene.rooms);
  const mode = useStore((s) => s.mode);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const hoveredRoomId = useStore((s) => s.hoveredRoomId);
  const showRoomUi = mode === "rooms";
  return (
    <group>
      {rooms.map((r) => (
        <Floor
          key={r.id}
          room={r}
          highlight={showRoomUi ? (r.id === selectedRoomId ? "selected" : r.id === hoveredRoomId ? "hovered" : null) : null}
          label={showRoomUi}
        />
      ))}
    </group>
  );
}

const plinthMaterial = toonMaterial(PLINTH_COLOR);

const Floor = memo(function Floor({ room, highlight, label }: { room: Room; highlight: "selected" | "hovered" | null; label: boolean }) {
  const slab = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roomShape(room), { depth: SLAB, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -SLAB, 0);
    return g;
  }, [room.floor]); // eslint-disable-line react-hooks/exhaustive-deps
  const overlay = useMemo(() => {
    const g = new THREE.ShapeGeometry(roomShape(room));
    g.rotateX(-Math.PI / 2);
    return g;
  }, [room.floor]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => slab.dispose(), [slab]);
  useEffect(() => () => overlay.dispose(), [overlay]);

  const color = room.floorColor ?? theme.floor[room.floorMaterial];
  const top = useMemo(() => ownedToon(color, { map: floorTexture(room.floorMaterial) }), [color, room.floorMaterial]);
  useEffect(() => () => top.dispose(), [top]);
  const materials = useMemo(() => [top, plinthMaterial], [top]);

  const center = useMemo(() => centroid(room.floor), [room.floor]);
  const area = Math.abs(polygonArea(room.floor));

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    const s = useStore.getState();
    if (s.mode === "rooms") {
      e.stopPropagation();
      s.selectRoom(room.id);
    } else if (s.mode === "arrange" && !s.dragging) {
      s.selectItem(null);
    }
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    cameraBus.emit({ type: "focus", center, size: roomFocusSize(room) });
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (useStore.getState().mode !== "rooms") return;
    e.stopPropagation();
    useStore.getState().hoverRoom(room.id);
  };
  const onOut = () => {
    if (useStore.getState().hoveredRoomId === room.id) useStore.getState().hoverRoom(null);
  };

  return (
    <group>
      <mesh geometry={slab} material={materials} receiveShadow onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onOver} onPointerOut={onOut} />
      {highlight && (
        <mesh geometry={overlay} position-y={0.004} raycast={noRaycast} renderOrder={1}>
          <meshBasicMaterial color={theme.selection} transparent opacity={highlight === "selected" ? 0.32 : 0.16} depthWrite={false} />
        </mesh>
      )}
      {label && (
        <Html position={[center[0], 0.15, center[1]]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className={`room-tag${highlight === "selected" ? " is-selected" : ""}`}>
            <strong>{room.name}</strong>
            <span>{area.toFixed(1).replace(".", ",")} m²</span>
          </div>
        </Html>
      )}
    </group>
  );
});
