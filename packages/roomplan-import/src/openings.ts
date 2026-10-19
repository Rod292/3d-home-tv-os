/** Doors / windows / openings → scene openings attached to a wall. */
import type { Opening, OpeningKind, Vec2, Wall } from "@appart3d/scene";
import { DEG, column, dist2, dot2, norm2, pointSegment, rotatePlan, round, segAngle, sub2, toPlan, translation, type PlanFrame } from "./math";
import type { ParsedSurface } from "./parse";

export interface OpeningInput {
  surface: ParsedSurface;
  kind: OpeningKind;
}

export interface OpeningsResult {
  openings: Opening[];
  /** Openings dropped because no wall could host them. */
  orphans: number;
  /** Openings whose width/height had to be clamped. */
  clamped: number;
}

function lineAngleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/** Nearest wall that is near-parallel (≤ 15°), within 30 cm and whose extent covers the opening center. */
export function nearestCollinearWall(center: Vec2, angle: number | null, walls: Wall[]): Wall | null {
  let best: { w: Wall; d: number } | null = null;
  for (const w of walls) {
    if (angle !== null && lineAngleDiff(angle, segAngle(w.start, w.end)) > 15 * DEG) continue;
    const len = dist2(w.start, w.end);
    const { dist, t } = pointSegment(center, w.start, w.end);
    if (dist > 0.3) continue;
    if ((t <= 0 || t >= 1) && dist > 0.3) continue;
    // Reject when the center projects beyond the wall ends by more than 10 cm.
    const along = dot2(sub2(center, w.start), norm2(sub2(w.end, w.start)));
    if (along < -0.1 || along > len + 0.1) continue;
    if (!best || dist < best.d) best = { w, d: dist };
  }
  return best?.w ?? null;
}

export function buildOpenings(
  inputs: OpeningInput[],
  walls: Wall[],
  wallIdByRoomPlanId: Map<string, string>,
  frame: PlanFrame,
  nextId: () => string,
): OpeningsResult {
  const byId = new Map(walls.map((w) => [w.id, w]));
  const openings: Opening[] = [];
  let orphans = 0;
  let clamped = 0;
  for (const { surface: s, kind } of inputs) {
    const [cx, cy, cz] = translation(s.transform);
    const center = toPlan(frame, [cx, cz]);
    const [ax, , az] = column(s.transform, 0);
    const axis = rotatePlan([ax, az], frame.phi);
    const angle = Math.hypot(axis[0], axis[1]) > 1e-6 ? Math.atan2(axis[1], axis[0]) : null;

    const parent = s.parentId ? wallIdByRoomPlanId.get(s.parentId) : undefined;
    const wall = (parent && byId.get(parent)) || nearestCollinearWall(center, angle, walls);
    if (!wall) {
      orphans++;
      continue;
    }
    const len = dist2(wall.start, wall.end);
    const dir = norm2(sub2(wall.end, wall.start));
    let width = s.dimensions[0];
    let height = s.dimensions[1];
    let sill = cy - height / 2 - frame.floorY;
    let wasClamped = false;
    // Doors sit on the floor (RoomPlan door boxes often start a few cm above it); tiny sills are noise.
    if ((kind === "door" && sill < 0.15) || sill < 0.03) sill = 0;
    if (width > len) {
      width = len;
      wasClamped = true;
    }
    let offset = dot2(sub2(center, wall.start), dir);
    const lo = width / 2;
    const hi = len - width / 2;
    if (offset < lo || offset > hi) {
      if (offset < lo - 0.05 || offset > hi + 0.05) wasClamped = true;
      offset = Math.min(hi, Math.max(lo, offset));
    }
    if (sill + height > wall.height) {
      if (sill >= wall.height - 0.05) sill = Math.max(0, wall.height - Math.min(height, wall.height) - 0.001);
      height = wall.height - sill;
      wasClamped = true;
    }
    if (!(width > 0.05) || !(height > 0.05)) {
      orphans++;
      continue;
    }
    if (wasClamped) clamped++;
    // 0.1 mm rounding stays far below validateScene's 1 mm tolerance.
    const w4 = round(width);
    const h4 = round(height);
    openings.push({
      id: nextId(),
      wallId: wall.id,
      kind,
      offset: round(Math.min(len - w4 / 2, Math.max(w4 / 2, offset))),
      width: w4,
      height: h4,
      sill: round(sill),
    });
  }
  return { openings, orphans, clamped };
}
