import { wallLength } from "./geometry";
import { ITEM_CATEGORIES, SCENE_VERSION, type Scene } from "./types";

/** Returns human-readable problems; an empty array means the scene is valid. */
export function validateScene(input: unknown): string[] {
  const errors: string[] = [];
  const s = input as Partial<Scene>;
  if (!s || typeof s !== "object") return ["scene is not an object"];
  if (s.version !== SCENE_VERSION) errors.push(`unsupported version ${String(s.version)}`);
  for (const key of ["rooms", "walls", "openings", "items"] as const) {
    if (!Array.isArray(s[key])) errors.push(`${key} must be an array`);
  }
  if (errors.length) return errors;
  const scene = s as Scene;
  const ids = new Set<string>();
  const all = [...scene.rooms, ...scene.walls, ...scene.openings, ...scene.items];
  for (const el of all) {
    if (ids.has(el.id)) errors.push(`duplicate id ${el.id}`);
    ids.add(el.id);
  }
  const walls = new Map(scene.walls.map((w) => [w.id, w]));
  for (const w of scene.walls) {
    if (wallLength(w) <= 0) errors.push(`wall ${w.id} has zero length`);
    if (w.height <= 0 || w.thickness <= 0) errors.push(`wall ${w.id} has invalid height/thickness`);
  }
  for (const o of scene.openings) {
    const w = walls.get(o.wallId);
    if (!w) {
      errors.push(`opening ${o.id} references unknown wall ${o.wallId}`);
      continue;
    }
    const len = wallLength(w);
    if (o.offset - o.width / 2 < -1e-3 || o.offset + o.width / 2 > len + 1e-3) errors.push(`opening ${o.id} overflows wall ${w.id}`);
    if (o.sill + o.height > w.height + 1e-3) errors.push(`opening ${o.id} is taller than wall ${w.id}`);
  }
  for (const r of scene.rooms) if (r.floor.length < 3) errors.push(`room ${r.id} floor needs >= 3 points`);
  for (const it of scene.items) {
    if (!ITEM_CATEGORIES.includes(it.category)) errors.push(`item ${it.id} has unknown category ${it.category}`);
    if (it.dimensions.some((d) => !(d > 0))) errors.push(`item ${it.id} has non-positive dimensions`);
    if (it.roomId && !scene.rooms.some((r) => r.id === it.roomId)) errors.push(`item ${it.id} references unknown room ${it.roomId}`);
  }
  return errors;
}

export function assertScene(input: unknown): Scene {
  const errors = validateScene(input);
  if (errors.length) throw new Error(`Invalid scene:\n- ${errors.join("\n- ")}`);
  return input as Scene;
}
