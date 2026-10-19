import * as THREE from "three";
import { sceneBounds, type Bounds2, type Scene } from "@appart3d/scene";

/** The subset of three-stdlib's OrbitControls we rely on (drei doesn't re-export its type). */
export interface ControlsLike extends THREE.EventDispatcher<{ change: object; start: object; end: object }> {
  target: THREE.Vector3;
  enabled: boolean;
  update: () => boolean;
}

export function boundsOf(walls: Scene["walls"], rooms: Scene["rooms"]): Bounds2 {
  const b = sceneBounds({ walls, rooms } as Scene);
  if (b.max[0] - b.min[0] < 0.5 && b.max[1] - b.min[1] < 0.5) {
    // Empty scene: pretend there is a 6 × 6 m room around the origin.
    return { min: [b.min[0] - 3, b.min[1] - 3], max: [b.max[0] + 3, b.max[1] + 3] };
  }
  return b;
}

export const boundsCenter = (b: Bounds2): THREE.Vector3 => new THREE.Vector3((b.min[0] + b.max[0]) / 2, 0, (b.min[1] + b.max[1]) / 2);

export const boundsDiag = (b: Bounds2): number => Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]);

/** Keeps a point inside the apartment bounds (plus a margin). Returns the correction applied. */
export function clampToBounds(p: THREE.Vector3, b: Bounds2, margin: number): THREE.Vector3 {
  const x = Math.min(Math.max(p.x, b.min[0] - margin), b.max[0] + margin);
  const z = Math.min(Math.max(p.z, b.min[1] - margin), b.max[1] + margin);
  return new THREE.Vector3(x - p.x, 0, z - p.z);
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Horizontal forward / right unit vectors of a camera. */
export function groundAxes(camera: THREE.Camera): { forward: THREE.Vector3; right: THREE.Vector3 } {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  return { forward, right };
}

/**
 * Pan direction from held keys (physical `KeyboardEvent.code`, so ZQSD works on AZERTY):
 * x = right, y = forward.
 */
export function heldPan(keys: Set<string>): [number, number] {
  let x = 0;
  let y = 0;
  if (keys.has("ArrowUp") || keys.has("KeyW")) y += 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) y -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  return [x, y];
}
