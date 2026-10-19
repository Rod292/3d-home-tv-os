/** Rooms: floor polygons (iOS 17 floors / wall loops), kind & name from roomNames or section labels. */
import type { Room, RoomKind, Vec2, Wall } from "@appart3d/scene";
import { pointInPolygon } from "@appart3d/scene";
import { centroid, cleanPolygon, convexHull, dist2, round, signedArea, toPlan, transformPoint, type PlanFrame, type V3 } from "./math";
import type { ParsedSection, ParsedSurface } from "./parse";
import { FLOOR_COLOR, ROOM_KIND_LABEL, defaultFloorMaterial, kindFromName, kindFromSectionLabel } from "./labels";

/** World-space floor outline of a RoomPlan floor surface (polygonCorners are in the surface's local frame). */
export function floorOutlineWorld(f: ParsedSurface): V3[] {
  const local: V3[] =
    f.polygonCorners.length >= 3
      ? f.polygonCorners
      : (() => {
          const hw = f.dimensions[0] / 2;
          const hd = f.dimensions[1] / 2;
          return [
            [-hw, -hd, 0],
            [hw, -hd, 0],
            [hw, hd, 0],
            [-hw, hd, 0],
          ] as V3[];
        })();
  return local.map((p) => transformPoint(f.transform, p));
}

export interface RoomCandidate {
  /** Plan polygon (any orientation). */
  polygon: Vec2[];
  /** Capture (CapturedRoom) index this outline came from, when known. */
  capture: number | null;
}

/** Snaps polygon vertices onto nearby wall endpoints so floors and walls share corners. */
export function snapPolygonToWalls(poly: Vec2[], walls: Wall[], maxDist = 0.2): Vec2[] {
  const corners = walls.flatMap((w) => [w.start, w.end]);
  return poly.map((p) => {
    let best: Vec2 | null = null;
    let bd = maxDist;
    for (const c of corners) {
      const d = dist2(p, c);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best ? [best[0], best[1]] : p;
  });
}

/**
 * Traces a closed loop through the given walls (each corner shared by exactly two walls).
 * Returns null when the walls do not form a single simple loop.
 */
export function traceWallLoop(walls: Wall[]): Vec2[] | null {
  if (walls.length < 3) return null;
  const key = (p: Vec2) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const adj = new Map<string, number[]>();
  walls.forEach((w, i) => {
    for (const p of [w.start, w.end]) adj.set(key(p), [...(adj.get(key(p)) ?? []), i]);
  });
  if ([...adj.values()].some((v) => v.length !== 2)) return null;
  const used = new Set<number>([0]);
  const poly: Vec2[] = [walls[0]!.start];
  let cur = walls[0]!.end;
  let curWall = 0;
  while (key(cur) !== key(poly[0]!)) {
    poly.push(cur);
    const next = adj.get(key(cur))!.find((i) => i !== curWall);
    if (next === undefined || used.has(next)) return null;
    used.add(next);
    const w = walls[next]!;
    cur = key(w.start) === key(cur) ? w.end : w.start;
    curWall = next;
  }
  return used.size === walls.length ? poly : null;
}

export interface RoomBuildInput {
  candidates: RoomCandidate[];
  sections: ParsedSection[];
  roomNames: (string | null)[];
  walls: Wall[];
  frame: PlanFrame;
  nextId: () => string;
}

export function buildRooms(input: RoomBuildInput): Room[] {
  const { candidates, sections, roomNames, walls, frame, nextId } = input;
  const plannedSections = sections.map((s) => ({ label: s.label, at: toPlan(frame, [s.center[0], s.center[2]]) }));
  const rooms: Room[] = [];
  const nameCount = new Map<string, number>();
  for (const cand of candidates) {
    let poly = cleanPolygon(snapPolygonToWalls(cand.polygon, walls));
    if (poly.length < 3 || Math.abs(signedArea(poly)) < 0.25) continue;
    poly = poly.map(([x, z]) => [round(x), round(z)] as Vec2);
    if (signedArea(poly) < 0) poly.reverse();

    const rawName = cand.capture !== null ? roomNames[cand.capture] ?? null : null;
    // The iOS app pads unnamed rooms with "Pièce N": treat those as unnamed so the section label wins.
    const userName = rawName && !/^pi[eè]ce\s*\d+$/i.test(rawName.trim()) ? rawName : null;
    const section =
      plannedSections.find((s) => pointInPolygon(s.at, poly) && kindFromSectionLabel(s.label)) ??
      plannedSections.find((s) => pointInPolygon(s.at, poly));
    const kind: RoomKind =
      (userName ? kindFromName(userName) : null) ?? (section ? kindFromSectionLabel(section.label) : null) ?? "other";
    const base = userName ?? ROOM_KIND_LABEL[kind];
    const n = (nameCount.get(base) ?? 0) + 1;
    nameCount.set(base, n);
    const material = defaultFloorMaterial(kind);
    rooms.push({
      id: nextId(),
      name: n > 1 ? `${base} ${n}` : base,
      kind,
      floor: poly,
      floorMaterial: material,
      floorColor: FLOOR_COLOR[material],
    });
  }
  // Rename the first duplicate too ("Chambre" + "Chambre 2" → "Chambre 1" + "Chambre 2") only for auto names.
  for (const [base, count] of nameCount) {
    if (count < 2) continue;
    const first = rooms.find((r) => r.name === base);
    if (first) first.name = `${base} 1`;
  }
  return rooms;
}

/** Fallback outline for a capture without floors: wall loop, else convex hull of its wall endpoints. */
export function outlineFromWalls(walls: Wall[], rawEndpoints: Vec2[]): Vec2[] | null {
  const loop = traceWallLoop(walls);
  if (loop) return loop;
  const pts = rawEndpoints.length >= 3 ? rawEndpoints : walls.flatMap((w) => [w.start, w.end]);
  const hull = convexHull(pts);
  return hull.length >= 3 ? hull : null;
}

export { centroid };
