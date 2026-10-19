import { pointInPolygon, type Item, type ItemCategory, type Scene, type Vec2, type Vec3 } from "@appart3d/scene";
import type { Device } from "@appart3d/home";
import { mountedPose } from "./mount";
import { homeLightFor, lookForItem, type GlowLook } from "./home";

/**
 * Night mode: which items light the apartment, and where the light comes from.
 * Pure logic (no three.js) so it can be unit tested; `three/NightLights.tsx` turns it into lights.
 */

export interface LampSource {
  itemId: string;
  category: ItemCategory;
  /** World position of the light (shade / bulb / screen front). */
  position: Vec3;
  /** Height of the item's lowest point (a shadow-casting light must sit below its own shade). */
  bottomY: number;
  color: string;
  /** Candela-ish (three.js physically based point lights). */
  intensity: number;
  /** Cut-off distance (m). */
  distance: number;
  decay: number;
  roomId?: string;
  /** Importance when the number of real lights is capped. */
  weight: number;
  /** Hanging from the ceiling (pendant, fan): candidate for the shadow-casting key light. */
  overhead: boolean;
  /** Fire: flickers. */
  flicker?: boolean;
}

/** Max real (dynamic) lights at night; other lamps only glow (emissive). Keeps 60 fps. */
export const MAX_NIGHT_LIGHTS = 10;

const WARM = "#ffbf80";
const WARM_SOFT = "#ffcf98";
const SCREEN = "#8fb0ff";
const FIRE = "#ff8a3a";

interface Spec {
  color: string;
  intensity: number;
  distance: number;
  decay: number;
  weight: number;
  overhead?: boolean;
  flicker?: boolean;
  /** Light position in item-local coordinates (x right, y up from the item's bottom, z front). */
  local: (item: Item) => Vec3;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const SPECS: Partial<Record<ItemCategory, Spec>> = {
  pendantLamp: {
    color: WARM,
    intensity: 2.6,
    distance: 5.5,
    decay: 1.5,
    weight: 5,
    overhead: true,
    local: (it) => [0, Math.min(it.dimensions[1] * 0.15, 0.14), 0],
  },
  ceilingFan: {
    color: WARM_SOFT,
    intensity: 2.2,
    distance: 5.5,
    decay: 1.5,
    weight: 4,
    overhead: true,
    local: (it) => [0, clamp(it.dimensions[1] * 0.18, 0.04, 0.09) * 0.4, 0],
  },
  floorLamp: {
    color: WARM,
    intensity: 1.8,
    distance: 4.5,
    decay: 1.5,
    weight: 4,
    local: (it) => {
      const [w, h, d] = it.dimensions;
      if (it.variant?.endsWith("/arc")) {
        const rs = Math.min(d / 2, w * 0.22);
        const shadeH = Math.min(rs * 0.9, h * 0.22);
        const shadeTop = h - Math.min(h * 0.18, 0.35);
        return [w / 2 - rs, shadeTop - shadeH * 0.7, 0];
      }
      const shadeH = clamp(h * 0.22, 0.15, 0.42);
      return [0, h - shadeH * 0.5, 0];
    },
  },
  lamp: {
    color: WARM,
    intensity: 1.1,
    distance: 3.5,
    decay: 1.5,
    weight: 3,
    local: (it) => [0, it.dimensions[1] * 0.74, 0],
  },
  fireplace: {
    color: FIRE,
    intensity: 1.8,
    distance: 4,
    decay: 1.5,
    weight: 3.5,
    flicker: true,
    local: (it) => [0, it.dimensions[1] * 0.3, it.dimensions[2] * 0.5 + 0.15],
  },
  television: {
    color: SCREEN,
    intensity: 0.4,
    distance: 2.4,
    decay: 1.5,
    weight: 1,
    local: (it) => [0, it.dimensions[1] * 0.55, it.dimensions[2] / 2 + 0.3],
  },
  monitor: {
    color: SCREEN,
    intensity: 0.25,
    distance: 1.8,
    decay: 1.5,
    weight: 0.8,
    local: (it) => [0, it.dimensions[1] * 0.6, it.dimensions[2] / 2 + 0.25],
  },
};

/** Categories that light up at night. */
export const LIT_CATEGORIES = Object.keys(SPECS) as ItemCategory[];

/** Item-local → world (three.js rotation about +Y). */
export function localToWorld(pos: Vec3, rotationY: number, local: Vec3): Vec3 {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return [pos[0] + local[0] * c + local[2] * s, pos[1] + local[1], pos[2] - local[0] * s + local[2] * c];
}

/** Every light source of the scene, in scene order. */
export function lampSources(scene: Pick<Scene, "items" | "walls" | "rooms">): LampSource[] {
  const out: LampSource[] = [];
  for (const item of scene.items) {
    const spec = SPECS[item.category];
    if (!spec) continue;
    const pose = mountedPose(item, scene);
    const position = localToWorld(pose.position, pose.rotationY, spec.local(item));
    const pt: Vec2 = [position[0], position[2]];
    const roomId = item.roomId ?? scene.rooms.find((r) => pointInPolygon(pt, r.floor))?.id;
    out.push({
      itemId: item.id,
      category: item.category,
      position,
      bottomY: pose.position[1],
      color: spec.color,
      intensity: spec.intensity,
      distance: spec.distance,
      decay: spec.decay,
      roomId,
      weight: spec.weight,
      overhead: !!spec.overhead,
      flicker: spec.flicker,
    });
  }
  return out;
}

/**
 * Picks at most `cap` sources to become real lights: the room the camera looks at first, then
 * importance (pendants > floor lamps > lamps > screens) and proximity. Stable for equal scores.
 */
export function selectLights(sources: readonly LampSource[], focus: Vec3, focusRoomId: string | undefined, cap = MAX_NIGHT_LIGHTS): LampSource[] {
  if (sources.length <= cap) return [...sources];
  const scored = sources.map((s, i) => {
    const d = Math.hypot(s.position[0] - focus[0], s.position[2] - focus[2]);
    const score = s.weight * 1.2 - d * 0.7 + (focusRoomId && s.roomId === focusRoomId ? 5 : 0);
    return { s, i, score };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, cap).map((x) => x.s);
}

/** The shadow-casting key light among the selected ones: the strongest overhead light nearest the focus. */
export function pickKeyLight(selected: readonly LampSource[], focus: Vec3): LampSource | undefined {
  let best: LampSource | undefined;
  let bestScore = -Infinity;
  for (const s of selected) {
    if (!s.overhead) continue;
    const score = s.weight - Math.hypot(s.position[0] - focus[0], s.position[2] - focus[2]) * 0.8;
    if (score > bestScore) [best, bestScore] = [s, score];
  }
  return best;
}

/* ------------------------------------------------------------------ Maison mode */

/** Suffix of the extra light source of a light strip linked to a screen item. */
export const STRIP_SUFFIX = "#strip";

/** Light strip behind a TV / monitor: a colored source between the screen and the wall. */
export function stripSource(item: Item, scene: Pick<Scene, "walls" | "rooms">): LampSource {
  const pose = mountedPose(item, scene);
  const [, h, d] = item.dimensions;
  const position = localToWorld(pose.position, pose.rotationY, [0, h * 0.55, -d / 2 + 0.1]);
  return {
    itemId: item.id + STRIP_SUFFIX,
    category: item.category,
    position,
    bottomY: pose.position[1],
    color: "#b07bff",
    intensity: 1.3,
    distance: 2.6,
    decay: 1.5,
    roomId: item.roomId ?? scene.rooms.find((r) => pointInPolygon([position[0], position[2]], r.floor))?.id,
    weight: 3.5,
    overhead: false,
  };
}

/**
 * Maison mode: what each source shows from the linked devices. `null` = not driven by a device
 * (keeps the usual night look); a GlowLook with `on: false` = dark.
 */
export function homeLightMap(sources: readonly LampSource[], byItem: ReadonlyMap<string, Device[]>): Map<string, GlowLook | null> {
  const out = new Map<string, GlowLook | null>();
  for (const s of sources) {
    if (s.itemId.endsWith(STRIP_SUFFIX)) {
      const look = lookForItem(s.category, byItem.get(s.itemId.slice(0, -STRIP_SUFFIX.length)));
      out.set(s.itemId, look?.strip ?? { on: false, color: s.color, level: 0 });
    } else out.set(s.itemId, homeLightFor(s.category, lookForItem(s.category, byItem.get(s.itemId))));
  }
  return out;
}

/** Light multiplier of a source: usual night fade, or the device state (visible in the day too). */
export function sourceFactor(look: GlowLook | null | undefined, nightMix: number): number {
  if (look === undefined || look === null) return nightMix;
  if (!look.on) return 0;
  return (0.4 + 0.6 * look.level) * Math.max(nightMix, HOME_DAY_FACTOR);
}

/** In daylight, lit lamps still cast a visible warm pool in Maison mode. */
export const HOME_DAY_FACTOR = 0.5;
