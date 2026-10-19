import { create } from "zustand";
import type { Caption } from "../lib/slideshow";

/**
 * Bridge between the slideshow rig (inside <Canvas>) and its DOM overlay. The rig owns the clock;
 * it writes the veil / progress directly to DOM nodes every frame (no React re-render per frame)
 * and publishes the current shot (caption) here when it changes.
 */
export interface SlidesState {
  index: number;
  count: number;
  duration: number;
  caption: Caption | null;
  setShot: (index: number, count: number, duration: number, caption: Caption) => void;
}

export const useSlides = create<SlidesState>()((set) => ({
  index: 0,
  count: 0,
  duration: 6,
  caption: null,
  setShot: (index, count, duration, caption) => set({ index, count, duration, caption }),
}));

export const slideshowFx = {
  veil: null as HTMLElement | null,
  progress: null as HTMLElement | null,
  caption: null as HTMLElement | null,
  /** Dev hooks: start at shot N / at T seconds into it. */
  startShot: 0,
  startTime: 0,
  /** Dev hooks for clean captures (e.g. the Open Graph image): extra zoom on iso shots, no control bar. */
  zoomMul: 1,
  hideChrome: false,
  /**
   * Where the slideshow camera is looking, as an iso-editor view, refreshed every frame: when the
   * viewer grabs the 3D view, free navigation starts from here instead of jumping back.
   */
  handoff: { target: [0, 0, 0] as [number, number, number], az: Math.PI / 4, polar: 0.96, zoom: 0, valid: false },
};

type Cmd = "next" | "prev";
const listeners = new Set<(c: Cmd) => void>();
export const slideshowBus = {
  emit(c: Cmd) {
    listeners.forEach((l) => l(c));
  },
  on(l: (c: Cmd) => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
