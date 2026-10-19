import { getCatalogEntry } from "@appart3d/catalog";
import { effectiveMount } from "../lib/mount";
import type { Item, ItemMount, Scene } from "@appart3d/scene";

export const MOUNT_LABELS: Record<ItemMount, string> = { floor: "Sol", wall: "Mur", ceiling: "Plafond" };

/** Catalog default for the category ("floor" when the catalog says nothing). */
export function catalogMount(item: Pick<Item, "category">): ItemMount {
  return getCatalogEntry(item.category)?.mount ?? "floor";
}

/** How the item is actually held: explicit `item.mount`, else the catalog default (shared with the 3D code). */
export { effectiveMount } from "../lib/mount";

const DEFAULT_CEILING = 2.5;

/** Ceiling height used for ceiling-mounted items: the tallest wall of the plan (2.5 m when there are none). */
export function ceilingHeight(scene: Pick<Scene, "walls">): number {
  let h = 0;
  for (const w of scene.walls) h = Math.max(h, w.height);
  return h > 0 ? h : DEFAULT_CEILING;
}

/**
 * Elevation (position.y = bottom of the item) that makes sense for its mount:
 * floor → 0, wall → catalog default elevation (or ~1.2 m, kept under the ceiling),
 * ceiling → top touching the ceiling.
 */
export function defaultElevationFor(item: Pick<Item, "category" | "mount" | "dimensions">, scene: Pick<Scene, "walls">): number {
  const mount = effectiveMount(item);
  const ceil = ceilingHeight(scene);
  const h = item.dimensions[1];
  // An explicit "Sol" puts it down; otherwise keep the catalog's elevation (e.g. legacy artwork entries).
  if (mount === "floor") return item.mount === "floor" ? 0 : (getCatalogEntry(item.category)?.defaultElevation ?? 0);
  if (mount === "ceiling") return round2(Math.max(0, ceil - h));
  const wanted = getCatalogEntry(item.category)?.defaultElevation || 1.2;
  return round2(Math.max(0, Math.min(wanted, ceil - h)));
}

/** Highest sensible elevation for the item's bottom edge. */
export function maxElevation(item: Pick<Item, "dimensions">, scene: Pick<Scene, "walls">): number {
  return round2(Math.max(0, ceilingHeight(scene) - item.dimensions[1]));
}

const round2 = (v: number) => Math.round(v * 100) / 100;
