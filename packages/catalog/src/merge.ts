import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getGeometry } from "./geometry";
import type { MaterialRole } from "./theme";
import type { Part } from "./parts";

/** Parts sharing one material, baked into a single geometry (one draw call instead of one per part). */
export interface MergedGroup {
  geometry: THREE.BufferGeometry;
  color: string;
  role: MaterialRole;
  castShadow: boolean;
}

/** Material identity of a part: parts with the same key can be drawn together. */
export function mergeKey(p: Part): string {
  return `${p.color.toLowerCase()}|${p.role ?? "toon"}|${p.castShadow !== false}`;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

/**
 * Merges an item's parts by material, transforms baked in. A furniture model is made of tens of
 * small parts: drawn one by one, a whole apartment is ~1000 draw calls, which a TV's CPU can't keep
 * at 60 fps. Only position + normal are kept (the toon materials need nothing else).
 * The caller owns (and disposes) the returned geometries.
 */
export function mergeParts(parts: readonly Part[]): MergedGroup[] {
  const groups = new Map<string, { part: Part; geos: THREE.BufferGeometry[] }>();
  for (const p of parts) {
    const g = getGeometry(p.geo);
    const geo = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    m4.compose(v.set(...p.pos), q.setFromEuler(e.set(...(p.rot ?? [0, 0, 0]))), s.set(...(p.scale ?? [1, 1, 1])));
    geo.applyMatrix4(m4);
    const key = mergeKey(p);
    const entry = groups.get(key);
    if (entry) entry.geos.push(geo);
    else groups.set(key, { part: p, geos: [geo] });
  }
  const out: MergedGroup[] = [];
  for (const { part, geos } of groups.values()) {
    const geometry = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (geos.length > 1) for (const g of geos) g.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    out.push({ geometry, color: part.color, role: part.role ?? "toon", castShadow: part.castShadow !== false });
  }
  return out;
}
