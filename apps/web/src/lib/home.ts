import type { Device, DeviceAction, HomeSnapshot, MediaInfo } from "@appart3d/home";
import type { ItemCategory } from "@appart3d/scene";
import { tvCardModel } from "./tvCard";

/**
 * "Maison" mode — pure logic shared by the panel, the 3D view and the tests:
 * labels, room counts, optimistic updates with rollback, device ↔ 3D item lookup.
 */

export const ALL_ROOMS = "all";

/** Default warm white shown for lights that report neither a color nor a temperature. */
export const WARM_WHITE = "#ffc27a";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function isReachable(d: Device): boolean {
  return d.state.reachable && d.state.on !== null;
}

/** Counted in "N lumières sur M": lights and plugs (plugs drive lamps). */
export function isLightLike(d: Device): boolean {
  return d.kind === "light" || d.kind === "plug";
}

/** Fans count as on when spinning or when their light is on; speakers while they play. */
export function isOn(d: Device): boolean {
  if (!isReachable(d)) return false;
  if (d.kind === "speaker") return d.state.media ? d.state.media.state === "playing" : d.state.on === true;
  if (d.kind === "fan") return (d.state.speed ?? 0) > 0 || !!d.state.lightOn || (d.state.on === true && d.state.speed === undefined);
  return d.state.on === true;
}

/** Fan speed as a discrete step (0..steps) from the 0..100 state value. */
export function fanStep(d: Device): number {
  const steps = d.capabilities.speedSteps ?? 6;
  const speed = d.state.speed ?? 0;
  if (speed <= 0 || d.state.on === false) return 0;
  // A running fan is at least on step 1 (Tuya reports e.g. 1 % for its lowest speed).
  return Math.max(1, Math.round((speed / 100) * steps));
}

export function stepToSpeed(step: number, steps: number): number {
  return Math.round((clamp(step, 0, steps) / steps) * 100);
}

/** Approximate sRGB of a black-body white (Tanner Helland's fit), as #rrggbb. */
export function kelvinToHex(kelvin: number): string {
  const t = clamp(kelvin, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Color a light shows right now (falls back to its white temperature, then warm white). */
export function lightColor(d: Device): string {
  if (d.state.color) return d.state.color;
  if (d.state.kelvin) return kelvinToHex(d.state.kelvin);
  return WARM_WHITE;
}

/** Tint of a tile / glow when the device is on. */
export function deviceTint(d: Device): string {
  switch (d.kind) {
    case "light":
    case "plug":
      return lightColor(d);
    case "fan":
      return d.state.lightOn ? WARM_WHITE : "#8fd3ff";
    case "tv":
      return "#7aa7ff";
    case "speaker":
      return "#d77dff";
    default:
      return "#c9c9d6";
  }
}

/** Main state word, without the room ("70 %", "Éteint", "Vitesse 3"…). */
export function stateWord(d: Device): string {
  if (!isReachable(d)) return "Injoignable";
  switch (d.kind) {
    case "light":
    case "plug":
      if (!isOn(d)) return "Éteint";
      return d.capabilities.brightness && typeof d.state.brightness === "number" ? `${Math.round(d.state.brightness)} %` : "Allumé";
    case "fan": {
      const step = fanStep(d);
      if (step > 0) return d.state.lightOn ? `Vitesse ${step} · lumière` : `Vitesse ${step}`;
      return d.state.lightOn ? "Lumière allumée" : "Éteint";
    }
    case "tv": {
      if (!isOn(d)) return "Éteinte";
      const what = d.state.media?.app ?? d.state.media?.channel ?? (d.state.source ? sourceLabel(d.state.source) : undefined);
      return what ? `Allumée · ${what}` : "Allumée";
    }
    case "speaker": {
      const m = d.state.media;
      if (m?.state === "playing") return m.title ? `Lecture · ${m.title}` : "Lecture";
      if (m?.state === "paused") return m.title ? `En pause · ${m.title}` : "En pause";
      return "En veille";
    }
    default:
      return d.state.on ? "Allumé" : "Éteint";
  }
}

/** Tile state line: "Éteint · Salon", "70 % · Salon". */
export function tileLabel(d: Device): string {
  return d.room ? `${stateWord(d)} · ${d.room}` : stateWord(d);
}

export const UNREACHABLE_HINT = "Injoignable (interrupteur coupé ?)";

/** "Chez Alex" from the bridge's home name. */
export function homeTitle(home: string | undefined): string {
  const h = (home ?? "").trim();
  if (!h) return "Maison";
  return /^chez\b/i.test(h) ? h : `Chez ${h}`;
}

/** "2 lumières sur 5 allumées". */
export function lightsSummary(devices: readonly Device[]): string {
  const lights = devices.filter(isLightLike);
  const on = lights.filter(isOn).length;
  const total = lights.length;
  if (total === 0) return devices.length ? `${devices.length} appareil${devices.length > 1 ? "s" : ""}` : "Aucun appareil";
  if (on === 0) return total === 1 ? "La lumière est éteinte" : "Toutes les lumières sont éteintes";
  if (on === total && total > 1) return "Toutes les lumières sont allumées";
  return `${on} lumière${on > 1 ? "s" : ""} sur ${total} allumée${on > 1 ? "s" : ""}`;
}

export interface RoomCount {
  room: string;
  total: number;
  on: number;
}

const ROOM_ORDER = ["Salon", "Séjour", "Cuisine", "Chambre", "Bureau", "Salle de bain", "Entrée"];

/** "Tous" first, then the rooms (usual order first, then alphabetical), with the number of devices on. */
export function roomCounts(devices: readonly Device[]): RoomCount[] {
  const map = new Map<string, RoomCount>();
  for (const d of devices) {
    const room = d.room || "Autre";
    const r = map.get(room) ?? { room, total: 0, on: 0 };
    r.total++;
    if (isOn(d)) r.on++;
    map.set(room, r);
  }
  const rank = (r: string) => {
    const i = ROOM_ORDER.indexOf(r);
    return i < 0 ? ROOM_ORDER.length : i;
  };
  const rooms = [...map.values()].sort((a, b) => rank(a.room) - rank(b.room) || a.room.localeCompare(b.room, "fr"));
  return [{ room: ALL_ROOMS, total: devices.length, on: devices.filter(isOn).length }, ...rooms];
}

export function devicesInRoom(devices: readonly Device[], room: string): Device[] {
  return room === ALL_ROOMS ? [...devices] : devices.filter((d) => (d.room || "Autre") === room);
}

/** Devices linked to each 3D item (a TV item may carry the TV and the light strip behind it). */
export function devicesByItem(devices: readonly Device[]): Map<string, Device[]> {
  const map = new Map<string, Device[]>();
  for (const d of devices) {
    if (!d.itemId) continue;
    const list = map.get(d.itemId);
    if (list) list.push(d);
    else map.set(d.itemId, [d]);
  }
  return map;
}

/** A light strip glows behind this item (a light linked to it, or a TV carrying its Ambilight). */
export function hasStripGlow(devices: readonly Device[]): boolean {
  return devices.some((d) => d.kind === "light" || d.kind === "plug" || (d.kind === "tv" && !!d.state.ambilight));
}

/* ------------------------------------------------------------------ shared tile order */

/**
 * Global order after dragging `id` onto the place of `targetId` in a (possibly room-filtered) view:
 * it moves just before the target when going up, just after it when going down, the other devices
 * keeping their relative order.
 */
export function moveInOrder(order: readonly string[], id: string, targetId: string): string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = order.filter((x) => x !== id);
  const t = next.indexOf(targetId);
  next.splice(from < to ? t + 1 : t, 0, id);
  return next;
}

/** Devices sorted by a shared order (ids not listed keep their relative order, after the listed ones). */
export function sortByOrder<T extends { id: string }>(devices: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return devices
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (rank.get(a.d.id) ?? order.length + a.i) - (rank.get(b.d.id) ?? order.length + b.i))
    .map((x) => x.d);
}

export function devicesForItem(devices: readonly Device[], itemId: string): Device[] {
  return devices.filter((d) => d.itemId === itemId);
}

const SOURCE_LABELS: Record<string, string> = { youtube: "YouTube", netflix: "Netflix", "hdmi 1": "HDMI 1", "hdmi 2": "HDMI 2", tv_power: "Marche / arrêt", amp_mute: "Muet ampli", amp_power: "Marche ampli", primevideo: "Prime Video", disney: "Disney+", hdmi1: "HDMI 1", hdmi2: "HDMI 2", tv: "TV" };

export function sourceLabel(raw: string): string {
  const name = raw.replace(/^source:/, "");
  return SOURCE_LABELS[name.toLowerCase()] ?? SOURCE_LABELS[name] ?? name.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ now playing */

/** Speaker with something loaded (playing first, then paused). */
export function nowPlaying(devices: readonly Device[]): Device | undefined {
  const speakers = devices.filter((d) => d.kind === "speaker" && isReachable(d) && d.state.media && d.state.media.state !== "idle");
  return speakers.find((d) => d.state.media!.state === "playing") ?? speakers[0];
}

/** Seconds into the track now: interpolated from `position` sampled at `updatedAt` while playing. */
export function mediaPosition(m: MediaInfo | undefined, nowMs: number): number | undefined {
  if (!m || typeof m.position !== "number") return undefined;
  let pos = m.position;
  if (m.state === "playing" && m.updatedAt) {
    const at = Date.parse(m.updatedAt);
    if (Number.isFinite(at)) pos += Math.max(0, (nowMs - at) / 1000);
  }
  return typeof m.duration === "number" && m.duration > 0 ? clamp(pos, 0, m.duration) : Math.max(0, pos);
}

/** "3:07", "1:02:09". */
export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "–:––";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Transport control offered right now (`playPause` = play or pause). */
export function canMedia(d: Device, command: "play" | "pause" | "next" | "previous" | "playPause"): boolean {
  const list = d.capabilities.media ?? [];
  return command === "playPause" ? list.includes("play") || list.includes("pause") : list.includes(command);
}

/** Artwork URL usable by the browser (relative bridge URLs resolved against the bridge base). */
export function resolveAsset(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/* ------------------------------------------------------------------ optimistic updates */

/** What a device most likely looks like once `action` is applied (also the mock bridge's behavior). */
export function predict(d: Device, action: DeviceAction): Device {
  const s = { ...d.state };
  const steps = d.capabilities.speedSteps ?? 6;
  switch (action.type) {
    case "toggle":
      if (d.kind === "speaker") return predict(d, { type: "media", command: "playPause" });
      if (d.kind === "fan") {
        const spinning = (s.speed ?? 0) > 0;
        s.speed = spinning ? 0 : stepToSpeed(2, steps);
        s.on = !spinning;
      } else s.on = !isOn(d);
      break;
    case "power":
      s.on = action.on;
      if (d.kind === "fan" && !action.on) {
        s.speed = 0;
        s.lightOn = false;
      }
      break;
    case "brightness":
      s.brightness = clamp(Math.round(action.value), 0, 100);
      s.on = s.brightness > 0;
      if (s.brightness === 0) s.brightness = d.state.brightness;
      break;
    case "color":
      s.color = action.hex;
      delete s.kelvin;
      s.on = true;
      break;
    case "kelvin":
      s.kelvin = action.value;
      s.color = kelvinToHex(action.value);
      s.on = true;
      break;
    case "speed":
      s.speed = clamp(Math.round(action.value), 0, 100);
      s.on = s.speed > 0 || !!s.lightOn;
      break;
    case "fanLight":
      s.lightOn = action.on;
      s.on = (s.speed ?? 0) > 0 || action.on;
      break;
    case "volume":
      s.volume = clamp(Math.round(action.value), 0, 100);
      break;
    case "volumeStep":
      // Unknown level (e.g. an amp driven by infrared): don't invent a number.
      if (typeof s.volume === "number") s.volume = clamp(s.volume + action.delta, 0, 100);
      break;
    case "ambilight": {
      if (action.on === false) s.ambilight = { on: false };
      else {
        const a = { ...(s.ambilight ?? { on: true }), on: true };
        if (action.hex) {
          a.color = action.hex;
          delete a.effect;
        }
        if (action.brightness !== undefined) a.brightness = clamp(Math.round(action.brightness), 1, 100);
        if (action.effect) {
          a.effect = action.effect;
          delete a.color;
        }
        s.ambilight = a;
      }
      break;
    }
    case "button":
      if (action.name === "tv_power") s.on = !isOn(d);
      else if (action.name.startsWith("app:")) {
        // Opening an app switches the TV on (bridge side) and brings the app to the front.
        const app = d.capabilities.apps?.find((a) => `app:${a.id}` === action.name);
        s.on = true;
        if (app) s.media = { ...(s.media?.state ? { state: s.media.state } : { state: "playing" as const }), app: app.label };
      } else {
        s.on = true;
        s.source = action.name;
      }
      break;
    case "media": {
      if (!s.media) break;
      const m: MediaInfo = { ...s.media };
      const now = Date.now();
      const pos = mediaPosition(m, now);
      if (pos !== undefined) m.position = pos;
      m.updatedAt = new Date(now).toISOString();
      if (action.command === "play" || (action.command === "playPause" && m.state !== "playing")) m.state = "playing";
      else if (action.command === "pause" || action.command === "playPause") m.state = "paused";
      else if (m.position !== undefined) m.position = 0;
      s.media = m;
      if (d.kind === "speaker") s.on = m.state === "playing";
      break;
    }
  }
  return { ...d, state: s };
}

export interface DevicesState {
  devices: Device[];
  /** In-flight actions per device: the latest sequence number and the last server-confirmed device. */
  pending: Record<string, { seq: number; base: Device }>;
}

function replace(devices: Device[], device: Device): Device[] {
  const i = devices.findIndex((d) => d.id === device.id);
  if (i < 0) return [...devices, device];
  const next = devices.slice();
  next[i] = device;
  return next;
}

/** Applies the predicted state right away and remembers the last confirmed one for a rollback. */
export function startAction(st: DevicesState, id: string, action: DeviceAction, seq: number): DevicesState {
  const d = st.devices.find((x) => x.id === id);
  if (!d) return st;
  const base = st.pending[id]?.base ?? d;
  return { devices: replace(st.devices, predict(d, action)), pending: { ...st.pending, [id]: { seq, base } } };
}

/** Server answer: shown if it answers the latest action, otherwise it only becomes the rollback point. */
export function resolveAction(st: DevicesState, id: string, seq: number, device: Device): DevicesState {
  const p = st.pending[id];
  if (!p) return { ...st, devices: replace(st.devices, device) };
  if (p.seq === seq) {
    const { [id]: _, ...rest } = st.pending;
    return { devices: replace(st.devices, device), pending: rest };
  }
  return { ...st, pending: { ...st.pending, [id]: { seq: p.seq, base: device } } };
}

/** Failed action: back to the last confirmed state (unless a newer action is still in flight). */
export function failAction(st: DevicesState, id: string, seq: number): DevicesState {
  const p = st.pending[id];
  if (!p || p.seq !== seq) return st;
  const { [id]: _, ...rest } = st.pending;
  return { devices: replace(st.devices, p.base), pending: rest };
}

/** Pushed by the bridge (SSE): updates the rollback point of pending devices, the display otherwise. */
export function applyServerDevice(st: DevicesState, device: Device): DevicesState {
  const p = st.pending[device.id];
  if (p) return { ...st, pending: { ...st.pending, [device.id]: { seq: p.seq, base: device } } };
  return { ...st, devices: replace(st.devices, device) };
}

export function applySnapshot(st: DevicesState, snap: Pick<HomeSnapshot, "devices">): DevicesState {
  const pending: DevicesState["pending"] = {};
  const devices = snap.devices.map((d) => {
    const p = st.pending[d.id];
    if (!p) return d;
    pending[d.id] = { seq: p.seq, base: d };
    return st.devices.find((x) => x.id === d.id) ?? d;
  });
  return { devices, pending };
}

/* ------------------------------------------------------------------ 3D look */

export interface GlowLook {
  on: boolean;
  color: string;
  /** 0..1 (brightness). */
  level: number;
}

/** How a 3D item shows its linked devices in Maison mode. */
export interface ItemLook {
  /** Lamp shade / bulb / fan light. */
  glow?: GlowLook;
  /** Colored glow of a light strip: behind a screen (TV backlight), behind a desk's top, under furniture. */
  strip?: GlowLook;
  /**
   * Where the strip glow goes: `behind` a screen (on its wall), `behindTop` = stuck to the back of a
   * desk / table behind what stands on it (halo rising from the top + spill on the top), `under` = on
   * the floor under the furniture.
   */
  stripPlacement?: "behind" | "behindTop" | "under";
  /** TV screen on / off, and what it shows when known. */
  screen?: { on: boolean; content?: TvContent };
  /** Fan rotation, 0..1 of the max speed. */
  fan?: { speed: number };
  /** Speaker (HomePod): colorful swirl on the top + music notes while it plays. */
  music?: { playing: boolean };
}

/** What the TV shows, for the 3D screen (null fields: unknown). */
export interface TvContent {
  app?: string;
  channel?: string;
  title?: string;
  source?: string;
  /** Browser-usable artwork URL is resolved by the view (relative bridge URL here). */
  artworkUrl?: string;
}

const LAMP_CATEGORIES = new Set<ItemCategory>(["pendantLamp", "floorLamp", "lamp", "ceilingFan"]);
const SCREEN_CATEGORIES = new Set<ItemCategory>(["television", "monitor"]);
/** Furniture whose strip is behind the top (desk backlight) rather than under it. */
const TOP_STRIP_CATEGORIES = new Set<ItemCategory>(["desk", "table"]);
const ON_TOP_SCREENS = new Set<ItemCategory>(["television", "monitor", "laptop"]);

interface PlacedItem {
  id: string;
  category: ItemCategory;
  position: readonly [number, number, number];
  rotationY: number;
  dimensions: readonly [number, number, number];
}

/**
 * A screen standing on a piece of furniture (monitor on a desk): its center in the furniture's local
 * frame (x along the width, z along the depth) and its width. null when nothing stands on it.
 */
export function screenOnTop(furniture: PlacedItem, items: readonly PlacedItem[]): { x: number; z: number; width: number } | null {
  const [fx, fy, fz] = furniture.position;
  const [w, h, d] = furniture.dimensions;
  const c = Math.cos(furniture.rotationY);
  const sn = Math.sin(furniture.rotationY);
  for (const it of items) {
    if (it.id === furniture.id || !ON_TOP_SCREENS.has(it.category)) continue;
    // Standing on the top (± a few cm, or on an arm clamped to it).
    if (Math.abs(it.position[1] - (fy + h)) > 0.2) continue;
    const dx = it.position[0] - fx;
    const dz = it.position[2] - fz;
    // World → local (inverse of the Y rotation).
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    if (Math.abs(lx) <= w / 2 + 0.05 && Math.abs(lz) <= d / 2 + 0.05) return { x: lx, z: lz, width: it.dimensions[0] };
  }
  return null;
}

export function isLampCategory(c: ItemCategory): boolean {
  return LAMP_CATEGORIES.has(c);
}

function glowOf(d: Device): GlowLook {
  const on = isOn(d);
  const level = d.capabilities.brightness && typeof d.state.brightness === "number" ? clamp(d.state.brightness / 100, 0.08, 1) : 1;
  return { on, color: lightColor(d), level };
}

/**
 * Look of an item from its linked devices. Lamps without a device stay off in Maison mode (the 3D
 * shows the real state); other unlinked items keep their usual look (undefined).
 */
export function lookForItem(category: ItemCategory, devices: readonly Device[] | undefined, opts: { screenOnTop?: boolean } = {}): ItemLook | undefined {
  if (!devices?.length) return LAMP_CATEGORIES.has(category) ? { glow: { on: false, color: WARM_WHITE, level: 0 } } : undefined;
  const look: ItemLook = {};
  const screen = SCREEN_CATEGORIES.has(category);
  for (const d of devices) {
    if (d.kind === "fan") {
      const steps = d.capabilities.speedSteps ?? 6;
      look.fan = { speed: isReachable(d) ? fanStep(d) / steps : 0 };
      if (d.capabilities.fanLight || d.state.lightOn !== undefined) look.glow = { on: isReachable(d) && !!d.state.lightOn, color: WARM_WHITE, level: 1 };
    } else if (d.kind === "tv") {
      look.screen = { on: isOn(d) };
      const content = tvContent(d);
      // On without any info (Philips Android TVs don't say which app is open): an "on" card, never a stale image.
      if (look.screen.on) look.screen.content = content ?? {};
      // Its Ambilight (folded into the TV by the bridge): the halo behind the screen.
      const amb = d.state.ambilight;
      if (amb && screen) {
        const on = isReachable(d) && amb.on;
        look.strip = { on, color: amb.color ?? WARM_WHITE, level: typeof amb.brightness === "number" ? clamp(amb.brightness / 100, 0.08, 1) : 1 };
        look.stripPlacement = "behind";
      }
    } else if (d.kind === "speaker") {
      const playing = isOn(d);
      look.music = { playing };
      look.glow = { on: playing, color: "#d77dff", level: 1 };
    } else if (d.kind === "light" || d.kind === "plug") {
      if (screen) {
        look.strip = glowOf(d);
        look.stripPlacement = "behind";
      } else if (LAMP_CATEGORIES.has(category)) look.glow = glowOf(d);
      else {
        // A light linked to furniture is a strip mounted on it: on a desk / table (or anything carrying
        // a screen) it is stuck behind the top, behind the monitor; otherwise under it (floor glow).
        look.strip = glowOf(d);
        look.stripPlacement = TOP_STRIP_CATEGORIES.has(category) || opts.screenOnTop ? "behindTop" : "under";
      }
    }
  }
  if (!look.glow && LAMP_CATEGORIES.has(category) && !look.fan) look.glow = { on: false, color: WARM_WHITE, level: 0 };
  // Ambilight following the picture reports no color: tint its halo with what the TV shows.
  if (look.strip && look.screen?.content) {
    const tv = devices.find((d) => d.kind === "tv" && d.state.ambilight);
    const strip = devices.find((d) => d.kind === "light" || d.kind === "plug");
    const accent = tvCardModel(look.screen.content)?.brand.accent;
    const noColor = tv ? !tv.state.ambilight?.color : strip && !strip.state.color && !strip.state.kelvin;
    if (noColor && accent) look.strip = { ...look.strip, color: accent };
  }
  return look;
}

/** TV content from its state (undefined when nothing is known beyond on / off). */
export function tvContent(d: Device): TvContent | undefined {
  const m = d.state.media;
  const c: TvContent = {};
  if (m?.app) c.app = m.app;
  if (m?.channel) c.channel = m.channel;
  if (m?.title) c.title = m.title;
  if (m?.artworkUrl) c.artworkUrl = m.artworkUrl;
  if (d.state.source) c.source = d.state.source;
  return Object.keys(c).length ? c : undefined;
}

/** Light-pool contribution of an item in Maison mode (null: not driven by a device → usual night look). */
export function homeLightFor(category: ItemCategory, look: ItemLook | undefined): GlowLook | null {
  if (!look) return LAMP_CATEGORIES.has(category) ? { on: false, color: WARM_WHITE, level: 0 } : null;
  if (look.glow) return look.glow;
  if (look.screen) return { on: look.screen.on, color: "#8fb0ff", level: 1 };
  return null;
}
