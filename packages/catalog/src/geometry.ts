/**
 * GeomSpec → three.js BufferGeometry, memoized by a mm-rounded key so identical
 * parts across items share one GPU buffer. Works without a WebGL context.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { GeomSpec, Part } from "./parts";

const cache = new Map<string, THREE.BufferGeometry>();
const MAX_CACHE = 4000;

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function specKey(spec: GeomSpec): string {
  return JSON.stringify(spec, (_k, v: unknown) => (typeof v === "number" ? round(v) : v));
}

function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  addRoundedRect(s, w, d, r);
  return s;
}

function addRoundedRect(s: THREE.Path, w: number, d: number, r: number): void {
  const x = -w / 2;
  const y = -d / 2;
  const rr = Math.max(0, Math.min(r, w / 2 - 1e-4, d / 2 - 1e-4));
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  if (rr > 0) s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + d - rr);
  if (rr > 0) s.quadraticCurveTo(x + w, y + d, x + w - rr, y + d);
  s.lineTo(x + rr, y + d);
  if (rr > 0) s.quadraticCurveTo(x, y + d, x, y + d - rr);
  s.lineTo(x, y + rr);
  if (rr > 0) s.quadraticCurveTo(x, y, x + rr, y);
}

function ellipsePath(p: THREE.Path, rx: number, ry: number, clockwise: boolean): void {
  p.absellipse(0, 0, rx, ry, 0, Math.PI * 2, clockwise, 0);
}

/** Extrude a shape along +Z by h, then stand it up so the extrusion goes along +Y from 0 to h. */
function standUp(shape: THREE.Shape, h: number, curveSegments = 6): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments });
  // Shape XY → floor XZ (shape +y maps to -z; shapes are symmetric so it does not matter).
  g.rotateX(-Math.PI / 2);
  return g;
}

function build(spec: GeomSpec): THREE.BufferGeometry {
  switch (spec.kind) {
    case "box":
      return new THREE.BoxGeometry(...spec.size);
    case "rbox":
      return new RoundedBoxGeometry(spec.size[0], spec.size[1], spec.size[2], spec.seg, spec.r);
    case "cyl":
      return new THREE.CylinderGeometry(spec.rTop, spec.rBottom, spec.h, spec.seg, 1, false);
    case "ico":
      return new THREE.IcosahedronGeometry(spec.r, spec.detail);
    case "sphere":
      return new THREE.SphereGeometry(spec.r, spec.seg, Math.max(4, Math.round(spec.seg / 2)));
    case "lathe":
      return new THREE.LatheGeometry(
        spec.pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)),
        spec.seg,
      );
    case "ring": {
      const { w, d, h, wall, r, ellipse } = spec;
      const s = new THREE.Shape();
      const hole = new THREE.Path();
      if (ellipse) {
        ellipsePath(s, w / 2, d / 2, false);
        ellipsePath(hole, Math.max(w / 2 - wall, 0.005), Math.max(d / 2 - wall, 0.005), true);
      } else {
        addRoundedRect(s, w, d, r);
        addRoundedRect(hole, Math.max(w - 2 * wall, 0.01), Math.max(d - 2 * wall, 0.01), Math.max(r - wall, 0));
      }
      s.holes.push(hole);
      return standUp(s, h, ellipse ? 24 : 6);
    }
    case "slab":
      return standUp(roundedRectShape(spec.w, spec.d, spec.r), spec.h);
    case "prism": {
      const s = new THREE.Shape(spec.pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: spec.depth, bevelEnabled: false });
      g.translate(0, 0, -spec.depth / 2);
      return g;
    }
    case "torus":
      return new THREE.TorusGeometry(spec.R, spec.r, 6, spec.seg);
    case "tube": {
      const curve = new THREE.CatmullRomCurve3(spec.path.map((p) => new THREE.Vector3(...p)));
      return new THREE.TubeGeometry(curve, spec.steps, spec.r, spec.seg, false);
    }
  }
}

/** Cached geometry for a spec. Shared: never dispose. */
export function getGeometry(spec: GeomSpec): THREE.BufferGeometry {
  const key = specKey(spec);
  let g = cache.get(key);
  if (!g) {
    if (cache.size > MAX_CACHE) cache.clear();
    g = build(spec);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    cache.set(key, g);
  }
  return g;
}

export function triangleCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute("position").count / 3;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

export function partMatrix(part: Part, target = new THREE.Matrix4()): THREE.Matrix4 {
  _e.set(...(part.rot ?? [0, 0, 0]));
  _q.setFromEuler(_e);
  _p.set(...part.pos);
  _s.set(...(part.scale ?? [1, 1, 1]));
  return target.compose(_p, _q, _s);
}

/** Exact (vertex-precise) bounds of a list of parts in local space. */
export function partsBounds(parts: readonly Part[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const part of parts) {
    const g = getGeometry(part.geo);
    partMatrix(part, _m);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      box.expandByPoint(_v);
    }
  }
  return box;
}

export function partsTriangles(parts: readonly Part[]): number {
  let n = 0;
  for (const p of parts) n += triangleCount(getGeometry(p.geo));
  return n;
}

