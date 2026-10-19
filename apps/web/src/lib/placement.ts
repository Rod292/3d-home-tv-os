import { openingsOnWall, pointInPolygon, type Item, type Scene, type Vec2 } from "@appart3d/scene";
import { hasCollision } from "./collision";
import { centroid } from "./geom2d";
import { nearestRoom } from "./cutaway";
import { snapToGrid } from "./snapping";
import { ceilingHeightAt, ceilingItemY, effectiveMount, faceNormal, roomWallFaces, WALL_GAP } from "./mount";

export interface FreeSpot {
  position: Vec2;
  roomId?: string;
  /** Wall items: rotation turning the item away from its wall (absent = keep the item's rotation). */
  rotationY?: number;
  /** Elevation of the base: ceiling items touch the ceiling (absent = keep the item's y). */
  y?: number;
}

/**
 * Finds where to drop a new item near `wanted`: inside a room when possible,
 * spiralling outward until the footprint is free of walls and furniture.
 * Wall items go flush on a free wall face of that room; ceiling items start at the room center.
 */
export function findFreeSpot(item: Item, scene: Scene, wanted: Vec2): FreeSpot {
  const mount = effectiveMount(item);
  if (mount === "wall") {
    const spot = findWallSpot(item, scene, wanted);
    if (spot) return spot;
  }
  const room = nearestRoom(scene, wanted);
  let start: Vec2 = wanted;
  if (room && (mount === "ceiling" || !pointInPolygon(wanted, room.floor))) start = centroid(room.floor);
  start = [snapToGrid(start[0]), snapToGrid(start[1])];
  const y = mount === "ceiling" ? ceilingItemY(item, ceilingHeightAt(scene, start)) : item.position[1];
  const extra = mount === "ceiling" ? { y } : {};

  const test = (p: Vec2): boolean => {
    if (room && !pointInPolygon(p, room.floor)) return false;
    const candidate: Item = { ...item, position: [p[0], y, p[1]] };
    return !hasCollision(candidate, scene);
  };

  if (test(start)) return { position: start, roomId: room?.id, ...extra };
  const step = 0.25;
  for (let ring = 1; ring <= 16; ring++) {
    const r = ring * step;
    const n = Math.max(8, ring * 8);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const p: Vec2 = [snapToGrid(start[0] + Math.cos(a) * r), snapToGrid(start[1] + Math.sin(a) * r)];
      if (test(p)) return { position: p, roomId: room?.id, ...extra };
    }
  }
  return { position: start, roomId: room?.id, ...extra };
}

/**
 * Free spot on a wall face looking into the room nearest to `wanted`: not over a door / window at the
 * item's height, not overlapping another wall item; the closest such spot to `wanted` wins.
 */
export function findWallSpot(item: Item, scene: Scene, wanted: Vec2): FreeSpot | undefined {
  const room = nearestRoom(scene, wanted);
  if (!room) return undefined;
  const [w, h, d] = item.dimensions;
  const y = item.position[1];
  let best: { score: number; spot: FreeSpot } | undefined;
  for (const face of roomWallFaces(scene, room)) {
    const wall = scene.walls.find((x) => x.id === face.wallId)!;
    if (y + h > wall.height) continue;
    const L = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if (L < w + 0.1) continue;
    const dir: Vec2 = [(wall.end[0] - wall.start[0]) / L, (wall.end[1] - wall.start[1]) / L];
    const nrm = faceNormal(wall, face.side);
    const off = wall.thickness / 2 + d / 2 + WALL_GAP;
    const openings = openingsOnWall(scene, wall.id);
    const margin = 0.05;
    for (let along = w / 2 + margin; along <= L - w / 2 - margin + 1e-9; along += 0.1) {
      const blocked = openings.some(
        (o) =>
          Math.abs(o.offset - along) < (o.width + w) / 2 + 0.03 && Math.min(o.sill + o.height, y + h) - Math.max(o.sill, y) > -0.03,
      );
      if (blocked) continue;
      const p: Vec2 = [wall.start[0] + dir[0] * along + nrm[0] * off, wall.start[1] + dir[1] * along + nrm[1] * off];
      // Must be on the room's side (wall segments can run past the room outline).
      const probe: Vec2 = [p[0] + nrm[0] * 0.05, p[1] + nrm[1] * 0.05];
      if (!pointInPolygon(probe, room.floor)) continue;
      const rotationY = Math.atan2(nrm[0], nrm[1]);
      const candidate: Item = { ...item, mount: "wall", position: [p[0], y, p[1]], rotationY };
      if (hasCollision(candidate, scene)) continue;
      const score = Math.hypot(p[0] - wanted[0], p[1] - wanted[1]);
      if (!best || score < best.score) best = { score, spot: { position: p, roomId: room.id, rotationY } };
    }
  }
  return best?.spot;
}

/** Applies `findFreeSpot` to an item (position, room, and the wall/ceiling extras). */
export function placeItem(item: Item, scene: Scene, wanted: Vec2): Item {
  const spot = findFreeSpot(item, scene, wanted);
  const out: Item = {
    ...item,
    position: [spot.position[0], spot.y ?? item.position[1], spot.position[1]],
    rotationY: spot.rotationY ?? item.rotationY,
  };
  if (spot.roomId) out.roomId = spot.roomId;
  else delete out.roomId;
  return out;
}
