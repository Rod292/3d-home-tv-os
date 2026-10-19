import { SCENE_VERSION, type Scene } from "./types";

export function createId(prefix = "id"): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand.replace(/-/g, "").slice(0, 12)}`;
}

export function emptyScene(name = "Mon appartement"): Scene {
  const now = new Date().toISOString();
  return {
    version: SCENE_VERSION,
    id: createId("scene"),
    name,
    units: "m",
    rooms: [],
    walls: [],
    openings: [],
    items: [],
    meta: { createdAt: now, updatedAt: now, source: "manual" },
  };
}
