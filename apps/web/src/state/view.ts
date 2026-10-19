import type { Vec2 } from "@appart3d/scene";

/**
 * Bridge between the DOM UI and the three.js camera rigs (which live inside <Canvas>).
 * The UI emits commands; the active rig listens. The rig publishes where it is looking.
 */
export type CameraCommand =
  | { type: "overview"; animate?: boolean }
  | { type: "focus"; center: Vec2; size: number }
  | { type: "rotate"; dir: 1 | -1 }
  /** Embedded view: glide back to the default framing (living room / whole apartment). */
  | { type: "home" }
  /** Embedded view: short flight toward a device that just switched, then back to the default framing. */
  | { type: "fly"; target: [number, number, number]; size: number }
  /** Embedded view: several devices switched at once — brief pull-back to the whole apartment. */
  | { type: "flyAll" }
  | { type: "capture" }
  /** Wake the render loop (frameloop="demand") e.g. when a pan key is pressed. */
  | { type: "wake" };

type Listener = (cmd: CameraCommand) => void;
const listeners = new Set<Listener>();

export const cameraBus = {
  emit(cmd: CameraCommand) {
    listeners.forEach((l) => l(cmd));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Live view info written by the camera rig every frame it moves. */
export const viewState = {
  /** Ground point at the center of the screen. */
  target: [0, 0] as Vec2,
  /** Camera azimuth around the target (radians). */
  azimuth: Math.PI / 4,
};

/** Physical key codes currently held for continuous panning (arrows / WASD — ZQSD on AZERTY). */
export const heldKeys = new Set<string>();
