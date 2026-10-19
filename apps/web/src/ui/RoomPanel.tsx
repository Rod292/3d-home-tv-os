import { useMemo } from "react";
import { theme } from "@appart3d/catalog";
import { polygonArea, wallFaceColor, type FloorMaterial, type Room, type RoomKind } from "@appart3d/scene";
import { useStore } from "../state/store";
import { cameraBus } from "../state/view";
import { roomWallFaces } from "../lib/mount";
import { useWallFace } from "../state/wallFace";
import { centroid } from "../lib/geom2d";
import { FLOOR_LABELS } from "../three/materials";
import { roomFocusSize } from "../three/Floors";
import { ColorField, FLOOR_SWATCHES, WALL_SWATCHES } from "./ColorField";
import { IconClose, IconTarget } from "./icons";

const KIND_LABELS: Record<RoomKind, string> = {
  living: "Séjour",
  bedroom: "Chambre",
  kitchen: "Cuisine",
  bathroom: "Salle de bain",
  toilet: "WC",
  hallway: "Entrée / couloir",
  office: "Bureau",
  dining: "Salle à manger",
  storage: "Rangement",
  other: "Autre",
};

const area = (r: Room) => Math.abs(polygonArea(r.floor)).toFixed(1).replace(".", ",");
const focus = (r: Room) => cameraBus.emit({ type: "focus", center: centroid(r.floor), size: roomFocusSize(r) });

/** Left panel in "Pièces" mode: list of rooms. */
export function RoomList() {
  const rooms = useStore((s) => s.scene.rooms);
  const selectedId = useStore((s) => s.selectedRoomId);
  const selectRoom = useStore((s) => s.selectRoom);
  const hoverRoom = useStore((s) => s.hoverRoom);
  const total = rooms.reduce((s, r) => s + Math.abs(polygonArea(r.floor)), 0);
  return (
    <aside className="catalog room-panel panel" aria-label="Pièces">
      <div className="panel-head">
        <h2>Pièces</h2>
        <span className="muted">{total.toFixed(0)} m²</span>
      </div>
      <div className="catalog-scroll">
        {rooms.length === 0 && <p className="empty">Aucune pièce dans ce plan.</p>}
        <ul className="room-list">
          {rooms.map((r) => (
            <li key={r.id}>
              <button
                className={`room-row${r.id === selectedId ? " is-active" : ""}`}
                onClick={() => {
                  selectRoom(r.id);
                  focus(r);
                }}
                onMouseEnter={() => hoverRoom(r.id)}
                onMouseLeave={() => hoverRoom(null)}
              >
                <span className="room-dot" style={{ background: r.floorColor ?? theme.floor[r.floorMaterial] }} />
                <span className="room-name">{r.name}</span>
                <span className="muted">{area(r)} m²</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="hint-text">Cliquez sur un sol pour choisir une pièce, double-cliquez pour la cadrer.</p>
      </div>
    </aside>
  );
}

/** Right panel in "Pièces" mode: style of the selected room. */
export function RoomInspector() {
  const room = useStore((s) => s.scene.rooms.find((r) => r.id === s.selectedRoomId));
  const walls = useStore((s) => s.scene.walls);
  const edit = useStore((s) => s.edit);
  const selectRoom = useStore((s) => s.selectRoom);
  // Faces of the room's walls that look INTO the room: painting them leaves the neighbour's side alone.
  const faces = useMemo(() => (room ? roomWallFaces(useStore.getState().scene, room) : []), [room, walls]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = useWallFace((s) => s.face);
  const setPicked = useWallFace((s) => s.setFace);
  if (!room) return null;

  const update = (recipe: (r: Room) => void, key?: string) =>
    edit((d) => {
      const r = d.rooms.find((x) => x.id === room.id);
      if (r) recipe(r);
    }, key);

  const firstFace = faces[0];
  const firstWall = firstFace && walls.find((w) => w.id === firstFace.wallId);
  const wallColor = (firstWall && wallFaceColor(firstWall, firstFace.side)) ?? theme.wall;
  const paintFaces = (targets: { wallId: string; side: "left" | "right" }[], c: string, key?: string) =>
    edit((d) => {
      for (const f of targets) {
        const w = d.walls.find((x) => x.id === f.wallId);
        if (!w) continue;
        w.faceColors = { ...w.faceColors, [f.side]: c };
      }
    }, key);

  const face = picked && picked.roomId === room.id ? picked : null;
  const faceWall = face && walls.find((w) => w.id === face.wallId);

  return (
    <aside className="inspector panel" aria-label="Style de la pièce">
      <div className="panel-head">
        <div>
          <p className="eyebrow">
            {KIND_LABELS[room.kind]} · {area(room)} m²
          </p>
          <h2>{room.name}</h2>
        </div>
        <button className="icon-btn ghost" onClick={() => selectRoom(null)} aria-label="Désélectionner">
          <IconClose />
        </button>
      </div>
      <div className="inspector-scroll">
        <label className="field">
          <span>Nom</span>
          <input type="text" value={room.name} onChange={(e) => update((r) => void (r.name = e.target.value), `room-name:${room.id}`)} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={room.kind} onChange={(e) => update((r) => void (r.kind = e.target.value as RoomKind))}>
            {(Object.keys(KIND_LABELS) as RoomKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Revêtement de sol</span>
          <div className="seg">
            {(Object.keys(FLOOR_LABELS) as FloorMaterial[]).map((m) => (
              <button
                key={m}
                className={room.floorMaterial === m ? "is-active" : ""}
                onClick={() =>
                  update((r) => {
                    r.floorMaterial = m;
                    r.floorColor = theme.floor[m];
                  })
                }
              >
                {FLOOR_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Couleur du sol</span>
          <ColorField
            value={room.floorColor ?? theme.floor[room.floorMaterial]}
            swatches={FLOOR_SWATCHES}
            onChange={(c, live) => update((r) => void (r.floorColor = c), live ? `floor-color:${room.id}` : undefined)}
          />
        </div>
        <div className="field">
          <span>
            Couleur des murs <em className="muted">({faces.length} mur{faces.length > 1 ? "s" : ""})</em>
          </span>
          {faces.length === 0 ? (
            <p className="muted small">Aucun mur détecté le long de cette pièce.</p>
          ) : (
            <ColorField
              value={wallColor}
              swatches={WALL_SWATCHES}
              onChange={(c, live) => paintFaces(faces, c, live ? `wall-color:${room.id}` : undefined)}
            />
          )}
          <p className="muted small">Cliquez sur un mur pour ne peindre que cette face.</p>
        </div>
        {face && faceWall && (
          <div className="field">
            <span>
              Face sélectionnée{" "}
              <button
                type="button"
                onClick={() => setPicked(null)}
                style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", opacity: 0.7, textDecoration: "underline", cursor: "pointer" }}
              >
                (désélectionner)
              </button>
            </span>
            <ColorField
              value={wallFaceColor(faceWall, face.side) ?? theme.wall}
              swatches={WALL_SWATCHES}
              onChange={(c, live) => paintFaces([face], c, live ? `wall-face:${face.wallId}:${face.side}` : undefined)}
            />
          </div>
        )}
      </div>
      <div className="inspector-foot">
        <button onClick={() => focus(room)}>
          <IconTarget /> Cadrer la pièce
        </button>
      </div>
    </aside>
  );
}
