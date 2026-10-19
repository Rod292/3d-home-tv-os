import * as THREE from "three";
import type { Vec2 } from "@appart3d/scene";

/**
 * Screen → floor picking for DOM interactions (e.g. dropping a catalog card onto the 3D view).
 *
 * The camera lives inside <Canvas>; a rig registers a source with `registerPickSource` so the UI can
 * project a pointer onto the floor plane (y = 0). In dev, the `window.__appart3d` hook set by
 * Viewport is used as a fallback. When nothing is available, `groundAt` returns null and callers
 * fall back to the screen center.
 */
export interface PickSource {
  camera: THREE.Camera;
  domElement: HTMLElement;
}

let source: (() => PickSource | null) | null = null;

export function registerPickSource(fn: () => PickSource | null): () => void {
  source = fn;
  return () => {
    if (source === fn) source = null;
  };
}

function currentSource(): PickSource | null {
  if (source) return source();
  if (import.meta.env.DEV) {
    const hook = (window as unknown as { __appart3d?: { get?: () => { camera: THREE.Camera; gl: THREE.WebGLRenderer } } }).__appart3d;
    const st = hook?.get?.();
    if (st) return { camera: st.camera, domElement: st.gl.domElement };
  }
  return null;
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

/** Floor point under a client (viewport) coordinate, or null when unknown / looking above the horizon. */
export function groundAt(clientX: number, clientY: number): Vec2 | null {
  const src = currentSource();
  if (!src) return null;
  const rect = src.domElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, src.camera);
  if (!ray.ray.intersectPlane(floor, hit)) return null;
  return [hit.x, hit.z];
}
