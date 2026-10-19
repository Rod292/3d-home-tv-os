import { useDeferredValue } from "react";
import { useStore } from "../state/store";
import { conflictsOf, needsReview } from "../state/analysis";

/** Colliding items of the current scene (deferred so dragging stays smooth). */
export function useConflicts() {
  const scene = useDeferredValue(useStore((s) => s.scene));
  return conflictsOf(scene);
}

export function useReviewCount() {
  return useStore((s) => s.scene.items.reduce((n, i) => n + (needsReview(i) ? 1 : 0), 0));
}
