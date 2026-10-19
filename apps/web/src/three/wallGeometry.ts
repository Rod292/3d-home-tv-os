import * as THREE from "three";
import { wallLength, type Opening, type Wall } from "@appart3d/scene";

/** Openings clamped into the wall, in wall-local coordinates (u along the wall from start, v up). */
export interface LocalOpening {
  opening: Opening;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** Hole touching the floor: cut as a notch in the outline instead of an inner hole. */
  notch: boolean;
}

const EDGE = 0.02;

export function localOpenings(wall: Wall, openings: Opening[]): LocalOpening[] {
  const L = wallLength(wall);
  const out: LocalOpening[] = [];
  for (const o of openings) {
    const u0 = Math.max(EDGE, o.offset - o.width / 2);
    const u1 = Math.min(L - EDGE, o.offset + o.width / 2);
    if (u1 - u0 < 0.05) continue;
    const notch = o.sill <= EDGE;
    const v0 = notch ? 0 : o.sill;
    const v1 = Math.min(wall.height - 0.03, o.sill + o.height);
    if (v1 - v0 < 0.05) continue;
    out.push({ opening: o, u0, u1, v0, v1, notch });
  }
  out.sort((a, b) => a.u0 - b.u0);
  // Drop overlapping openings (bad data) — the first one wins.
  const kept: LocalOpening[] = [];
  for (const lo of out) {
    const prev = kept[kept.length - 1];
    if (prev && lo.u0 < prev.u1 + 0.01) continue;
    kept.push(lo);
  }
  return kept;
}

/**
 * Wall elevation shape (u ∈ [-extend, L + extend], v ∈ [0, H]) with doors notched out of the
 * bottom edge and windows as inner holes.
 */
export function wallShape(wall: Wall, openings: LocalOpening[], extend: number): THREE.Shape {
  const L = wallLength(wall);
  const H = wall.height;
  const shape = new THREE.Shape();
  shape.moveTo(-extend, 0);
  for (const o of openings) {
    if (!o.notch) continue;
    shape.lineTo(o.u0, 0);
    shape.lineTo(o.u0, o.v1);
    shape.lineTo(o.u1, o.v1);
    shape.lineTo(o.u1, 0);
  }
  shape.lineTo(L + extend, 0);
  shape.lineTo(L + extend, H);
  shape.lineTo(-extend, H);
  shape.closePath();
  for (const o of openings) {
    if (o.notch) continue;
    const hole = new THREE.Path();
    hole.moveTo(o.u0, o.v0);
    hole.lineTo(o.u0, o.v1);
    hole.lineTo(o.u1, o.v1);
    hole.lineTo(o.u1, o.v0);
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

/**
 * Material groups of a wall geometry. The wall group is rotated by `wallAngle`, so local +Z is the
 * RIGHT face (see `wallNormal`: the left normal is (dz, -dx), local +Z maps to (-dz, dx)).
 */
export const WALL_GROUP = { right: 0, left: 1, sides: 2 } as const;

/** Wall face of a material index from a raycast hit (`intersection.face.materialIndex`). */
export function sideOfMaterialIndex(index: number | undefined): "left" | "right" | null {
  return index === WALL_GROUP.right ? "right" : index === WALL_GROUP.left ? "left" : null;
}

/**
 * Extruded wall in local space: x along the wall from its start, y up, z across (centered).
 * Groups: 0 = right face (+Z), 1 = left face (-Z), 2 = top / ends / opening reveals.
 */
export function buildWallGeometry(wall: Wall, openings: LocalOpening[]): THREE.BufferGeometry {
  // Extend by half the thickness so corners close cleanly.
  const geo = new THREE.ExtrudeGeometry(wallShape(wall, openings, wall.thickness / 2), {
    depth: wall.thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.translate(0, 0, -wall.thickness / 2);
  geo.computeVertexNormals();
  // ExtrudeGeometry (non-indexed) puts both shape caps in group 0 and the extruded sides in group 1:
  // split the caps into the two wall faces with an index buffer.
  const pos = geo.getAttribute("position");
  const caps = geo.groups[0];
  const sides = geo.groups[1];
  const right: number[] = [];
  const left: number[] = [];
  const rest: number[] = [];
  if (caps) {
    for (let i = caps.start; i < caps.start + caps.count; i += 3) (pos.getZ(i) > 0 ? right : left).push(i, i + 1, i + 2);
  }
  if (sides) for (let i = sides.start; i < sides.start + sides.count; i++) rest.push(i);
  geo.setIndex([...right, ...left, ...rest]);
  geo.clearGroups();
  geo.addGroup(0, right.length, WALL_GROUP.right);
  geo.addGroup(right.length, left.length, WALL_GROUP.left);
  geo.addGroup(right.length + left.length, rest.length, WALL_GROUP.sides);
  return geo;
}
