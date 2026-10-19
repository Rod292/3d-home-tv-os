import * as THREE from "three";

/**
 * "Ghost" look for items that would hide the room in the dollhouse view (ceiling lamps, fans):
 * a translucent copy of each shared catalog material, cached per source material.
 */
const ghosts = new WeakMap<THREE.Material, THREE.Material>();
const GHOST_FLAG = "appart3d:ghost";

function ghostOf(m: THREE.Material): THREE.Material {
  let g = ghosts.get(m);
  if (!g) {
    g = m.clone();
    g.transparent = true;
    g.opacity = Math.min(m.opacity, 1) * 0.28;
    g.depthWrite = false;
    g.userData = { ...g.userData, [GHOST_FLAG]: m };
    ghosts.set(m, g);
  }
  return g;
}

/** Swaps every mesh material under `root` to its ghost (or back). Cheap: no allocation once cached. */
export function applyGhost(root: THREE.Object3D | null, ghost: boolean) {
  if (!root) return;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const m = mesh.material;
    const original = m.userData[GHOST_FLAG] as THREE.Material | undefined;
    if (ghost && !original) {
      mesh.material = ghostOf(m);
      mesh.userData.ghostCastShadow = mesh.castShadow;
      mesh.castShadow = false;
    } else if (!ghost && original) {
      mesh.material = original;
      mesh.castShadow = mesh.userData.ghostCastShadow !== false;
    }
  });
}
