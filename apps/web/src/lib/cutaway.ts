import { pointInPolygon, sceneBounds, type Room, type Scene, type Vec2, type Wall } from "@appart3d/scene";
import { add, dot, normalize, perp, pointSegment, scale, sub } from "./geom2d";

/** Height walls drop to when they face the camera (cutaway "dollhouse" view). */
export const CUT_HEIGHT = 0.35;

export interface WallFacing {
  /** Horizontal unit normal pointing to the outside of the apartment (or away from its center for inner walls). */
  normal: Vec2;
  /** True for walls on the apartment's envelope (rooms on one side only). */
  exterior: boolean;
}

function insideAnyRoom(pt: Vec2, rooms: Room[]): boolean {
  return rooms.some((r) => pointInPolygon(pt, r.floor));
}

export type WallsAndRooms = Pick<Scene, "walls" | "rooms">;

export function wallFacing(wall: Wall, scene: WallsAndRooms, center: Vec2): WallFacing {
  const dir = normalize(sub(wall.end, wall.start));
  const n = perp(dir);
  const mid: Vec2 = [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
  const towardCenterSign = dot(n, sub(mid, center)) >= 0 ? 1 : -1;
  const centerBased = scale(n, towardCenterSign);
  if (scene.rooms.length === 0) return { normal: centerBased, exterior: true };
  const probe = wall.thickness / 2 + 0.2;
  const inA = insideAnyRoom(add(mid, scale(n, probe)), scene.rooms);
  const inB = insideAnyRoom(add(mid, scale(n, -probe)), scene.rooms);
  if (inA && !inB) return { normal: scale(n, -1), exterior: true };
  if (inB && !inA) return { normal: n, exterior: true };
  return { normal: centerBased, exterior: !inA && !inB };
}

export function computeWallFacings(scene: WallsAndRooms): Map<string, WallFacing> {
  const b = sceneBounds(scene as Scene);
  const center: Vec2 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  return new Map(scene.walls.map((w) => [w.id, wallFacing(w, scene, center)]));
}

/**
 * Should this wall be lowered for a camera looking along `viewDir`
 * (horizontal direction from the camera toward its target)?
 * - Envelope walls drop when their outer face is turned toward the camera.
 * - Inner partitions drop when they stand roughly across the line of sight.
 */
export function isWallCut(facing: WallFacing, viewDir: Vec2): boolean {
  const l = Math.hypot(viewDir[0], viewDir[1]);
  if (l < 1e-6) return true; // straight top-down view: everything low
  const toCamera: Vec2 = [-viewDir[0] / l, -viewDir[1] / l];
  const f = dot(facing.normal, toCamera);
  return facing.exterior ? f > 0.08 : Math.abs(f) > 0.5;
}

/** Walls that run along one of the room's floor-polygon edges. */
export function wallsOfRoom(scene: Scene, room: Room): Wall[] {
  return scene.walls.filter((w) => {
    const wd = normalize(sub(w.end, w.start));
    for (let i = 0; i < room.floor.length; i++) {
      const a = room.floor[i]!;
      const b = room.floor[(i + 1) % room.floor.length]!;
      const ed = normalize(sub(b, a));
      if (Math.abs(dot(wd, ed)) < 0.98) continue;
      const tol = w.thickness / 2 + 0.08;
      // Line distance from wall endpoints to the edge's infinite line.
      const n = perp(ed);
      if (Math.abs(dot(sub(w.start, a), n)) > tol || Math.abs(dot(sub(w.end, a), n)) > tol) continue;
      // Overlap along the edge must be meaningful.
      const ta = dot(sub(w.start, a), ed);
      const tb = dot(sub(w.end, a), ed);
      const el = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const overlap = Math.min(Math.max(ta, tb), el) - Math.max(Math.min(ta, tb), 0);
      if (overlap > 0.15) return true;
    }
    return false;
  });
}

/** Nearest room (by distance to its outline) — used when a point falls outside every room. */
export function nearestRoom(scene: Scene, pt: Vec2): Room | undefined {
  let best: { room: Room; d: number } | undefined;
  for (const room of scene.rooms) {
    if (pointInPolygon(pt, room.floor)) return room;
    for (let i = 0; i < room.floor.length; i++) {
      const d = pointSegment(pt, room.floor[i]!, room.floor[(i + 1) % room.floor.length]!).dist;
      if (!best || d < best.d) best = { room, d };
    }
  }
  return best?.room;
}
