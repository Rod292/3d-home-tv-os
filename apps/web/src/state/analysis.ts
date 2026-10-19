import { getCatalogEntry } from "@appart3d/catalog";
import { roomAt, type Item, type Scene } from "@appart3d/scene";
import { itemCollisions, type CollisionReport } from "../lib/collision";

/** Scanned items the detector was unsure about (to be checked by the user). */
export const REVIEW_THRESHOLD = 0.5;

export function needsReview(item: Item): boolean {
  return item.source === "scan" && item.confidence !== undefined && item.confidence < REVIEW_THRESHOLD;
}

/** Lowercase, accent-free text for forgiving search ("etagere" finds "Étagère"). */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Every whitespace-separated word of `query` must appear in one of `fields`. */
export function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.filter(Boolean).map((f) => normalizeText(f!)).join(" ");
  return words.every((w) => hay.includes(w));
}

export function itemTitle(item: Item): string {
  return item.label || getCatalogEntry(item.category)?.label || item.category;
}

export interface Conflict {
  id: string;
  report: CollisionReport;
}

/** Items that overlap a wall or another item (rugs, tucked chairs, etc. are ignored by the collision helpers). */
export function findConflicts(scene: Scene): Conflict[] {
  const out: Conflict[] = [];
  for (const item of scene.items) {
    const report = itemCollisions(item, scene);
    if (report.walls.length || report.items.length) out.push({ id: item.id, report });
  }
  return out;
}

export interface RoomGroup {
  roomId: string | null;
  name: string;
  items: Item[];
}

/** Items grouped by room (explicit roomId, else the room under the item), in plan order; orphans last. */
export function groupItemsByRoom(scene: Scene, items: Item[] = scene.items): RoomGroup[] {
  const known = new Map(scene.rooms.map((r) => [r.id, r] as const));
  const buckets = new Map<string | null, Item[]>();
  for (const it of items) {
    let rid = it.roomId && known.has(it.roomId) ? it.roomId : null;
    if (!rid) rid = roomAt(scene, [it.position[0], it.position[2]])?.id ?? null;
    const list = buckets.get(rid);
    if (list) list.push(it);
    else buckets.set(rid, [it]);
  }
  const groups: RoomGroup[] = [];
  for (const r of scene.rooms) {
    const list = buckets.get(r.id);
    if (list) groups.push({ roomId: r.id, name: r.name, items: list });
  }
  const orphans = buckets.get(null);
  if (orphans) groups.push({ roomId: null, name: "Hors des pièces", items: orphans });
  return groups;
}

const conflictCache = new WeakMap<Scene, Map<string, CollisionReport>>();

/** Memoized per scene object (scenes are immutable): item id → collision report, only for colliding items. */
export function conflictsOf(scene: Scene): Map<string, CollisionReport> {
  let m = conflictCache.get(scene);
  if (!m) {
    m = new Map(findConflicts(scene).map((c) => [c.id, c.report] as const));
    conflictCache.set(scene, m);
  }
  return m;
}
