import type { Device, EmbedCommand, FrameTarget } from "@appart3d/home";

/**
 * Pure helpers of the embedded 3D view (`?view=3d`, loaded by the native apps in a web view).
 * Runtime side: state/embed.ts.
 */

export function isEmbedView(params: URLSearchParams): boolean {
  return params.get("view") === "3d";
}

/** Validates a command from the native side (object or JSON string); null when malformed. */
export function parseEmbedCommand(raw: unknown): EmbedCommand | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (typeof v !== "object" || v === null) return null;
  const c = v as Record<string, unknown>;
  const idOrNull = (x: unknown): x is string | null => x === null || (typeof x === "string" && x.length > 0 && x.length <= 200);
  switch (c.type) {
    case "focusItem":
      return idOrNull(c.itemId) ? { type: "focusItem", itemId: c.itemId } : null;
    case "highlightDevice":
      return idOrNull(c.deviceId) ? { type: "highlightDevice", deviceId: c.deviceId } : null;
    case "spotlightDevice":
      return idOrNull(c.deviceId) ? { type: "spotlightDevice", deviceId: c.deviceId } : null;
    case "setNight":
      return typeof c.night === "boolean" ? { type: "setNight", night: c.night } : null;
    case "setDaylight":
      return c.mode === "auto" || c.mode === "day" || c.mode === "night" ? { type: "setDaylight", mode: c.mode } : null;
    case "frame":
      return c.target === "living" || c.target === "all" ? { type: "frame", target: c.target } : null;
    case "overview":
      return { type: "overview" };
    case "autoRotate":
      return typeof c.enabled === "boolean" ? { type: "autoRotate", enabled: c.enabled } : null;
  }
  return null;
}

/** 3D item linked to a device (null: unknown device or not linked). */
export function itemForDevice(devices: readonly Device[], deviceId: string | null): string | null {
  if (!deviceId) return null;
  return devices.find((d) => d.id === deviceId)?.itemId ?? null;
}

/** Devices linked to a 3D item (empty for an unlinked item). */
export function deviceIdsForItem(devices: readonly Device[], itemId: string): string[] {
  return devices.filter((d) => d.itemId === itemId).map((d) => d.id);
}

/** Camera focus size (meters on screen) around an item: the item plus a good part of the room around it. */
export function itemFocusSize(dimensions: readonly [number, number, number]): number {
  return Math.max(dimensions[0], dimensions[2]) + 3.2;
}

/**
 * Zoom (pixels per meter) that frames the whole apartment at any azimuth (the footprint diagonal is
 * rotation-invariant), with comfortable margins on every side.
 */
export function embedFitZoom(width: number, height: number, diag: number, polar: number, wallHeight = 2.6): number {
  const span = diag + 0.4;
  const zw = width / span;
  const zh = height / (span * Math.cos(polar) + wallHeight * Math.sin(polar));
  return Math.max(4, Math.min(zw, zh) * 0.92);
}

/** Idle auto-rotation speed (rad/s): one turn in about 80 s. */
export const AUTO_ROTATE_SPEED = (Math.PI * 2) / 80;
/** Touch pauses the auto-rotation; it resumes after this much idle time (ms). */
export const AUTO_ROTATE_RESUME_MS = 6000;

export interface AutoRotateInput {
  enabled: boolean;
  /** A camera focus (focusItem) is active: hold still until overview. */
  focused: boolean;
  /** Finger / mouse currently down on the 3D. */
  interacting: boolean;
  /** Last interaction time (ms, same clock as now). */
  lastInteraction: number;
  now: number;
}

export function shouldAutoRotate(i: AutoRotateInput): boolean {
  return i.enabled && !i.focused && !i.interacting && i.now - i.lastInteraction >= AUTO_ROTATE_RESUME_MS;
}

/* ------------------------------------------------------------------ default framing (living room) */

/** Camera pose of the dollhouse view: ground target, azimuth / polar (three.js spherical), zoom (px per m). */
export interface Framing {
  target: [number, number, number];
  az: number;
  polar: number;
  zoom: number;
}

/** Living-room framing: a bit more side-on than the overview (≈ 53° from vertical). */
export const LIVING_POLAR = 0.92;
/** Share of the view the living room fills. */
export const LIVING_FILL = 0.85;
/** Idle sway around the default azimuth: ±35°, one back-and-forth in 40 s. */
export const SWAY_AMPLITUDE = (35 * Math.PI) / 180;
export const SWAY_PERIOD = 40;

export function swayOffset(t: number): number {
  return SWAY_AMPLITUDE * Math.sin((2 * Math.PI * t) / SWAY_PERIOD);
}

interface ItemLike {
  id: string;
  category: string;
  position: readonly [number, number, number];
  rotationY: number;
  dimensions: readonly [number, number, number];
  roomId?: string;
}
interface RoomLike {
  id: string;
  floor: [number, number][];
}

function shoelace(poly: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

function inPolygon([x, z]: readonly [number, number], poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The living room: room of the first TV linked to a device (else the first TV), else the largest room.
 * Returns the TV too (the camera faces it).
 */
export function findLivingRoom<I extends ItemLike, R extends RoomLike>(
  items: readonly I[],
  rooms: readonly R[],
  devices: readonly Pick<Device, "itemId">[],
): { room: R; tv: I | null } | null {
  const linked = new Set(devices.map((d) => d.itemId).filter(Boolean));
  const tvs = items.filter((i) => i.category === "television");
  const tv = tvs.find((t) => linked.has(t.id)) ?? tvs[0] ?? null;
  if (tv) {
    const room = rooms.find((r) => r.floor.length >= 3 && inPolygon([tv.position[0], tv.position[2]], r.floor)) ?? rooms.find((r) => r.id === tv.roomId);
    if (room) return { room, tv };
  }
  let best: R | null = null;
  for (const r of rooms) if (r.floor.length >= 3 && (!best || shoelace(r.floor) > shoelace(best.floor))) best = r;
  return best ? { room: best, tv: null } : null;
}

/** Screen axes of the orthographic camera (right, up) for an azimuth / polar angle. */
function screenAxes(az: number, polar: number) {
  const right: [number, number, number] = [Math.cos(az), 0, -Math.sin(az)];
  const up: [number, number, number] = [-Math.cos(polar) * Math.sin(az), Math.sin(polar), -Math.cos(polar) * Math.cos(az)];
  return { right, up };
}

/**
 * Frames a room (floor polygon + walls up to `wallHeight`) so it fills `fill` of the view at the
 * given angles; the target is moved on the ground so the room is centered on screen.
 */
export function frameRoom(
  floor: readonly [number, number][],
  width: number,
  height: number,
  az: number,
  polar: number,
  fill = LIVING_FILL,
  wallHeight = 2.6,
): Framing {
  const { right, up } = screenAxes(az, polar);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, z] of floor) {
    for (const y of [0, wallHeight]) {
      const sx = x * right[0] + z * right[2];
      const sy = x * up[0] + y * up[1] + z * up[2];
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
  }
  const zoom = Math.max(4, fill * Math.min(width / Math.max(0.5, maxX - minX), height / Math.max(0.5, maxY - minY)));
  // Screen center → ground point: along `right` for x; along the ground "forward" (−camera dir) for y.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const fwd: [number, number] = [-Math.sin(az), -Math.cos(az)];
  const k = cy / Math.max(0.2, Math.cos(polar));
  return { target: [cx * right[0] + k * fwd[0], 0, cx * right[2] + k * fwd[1]], az, polar, zoom };
}

/** Azimuth of a camera standing in front of the TV (on the sofa side), looking at it. */
export function facingAzimuth(tv: ItemLike | null, roomFloor: readonly [number, number][], fallback: number): number {
  if (!tv) return fallback;
  let cx = 0;
  let cz = 0;
  for (const [x, z] of roomFloor) {
    cx += x / roomFloor.length;
    cz += z / roomFloor.length;
  }
  const fx = Math.sin(tv.rotationY);
  const fz = Math.cos(tv.rotationY);
  const tx = cx - tv.position[0];
  const tz = cz - tv.position[2];
  // The model's front should point into the room; if not (odd rotation), use the TV → room center direction.
  if (fx * tx + fz * tz < 0 && Math.hypot(tx, tz) > 0.3) return Math.atan2(tx, tz);
  return Math.atan2(fx, fz);
}

function segHitsBox(a: readonly [number, number], b: readonly [number, number], x0: number, z0: number, x1: number, z1: number): boolean {
  // Liang–Barsky clip of segment ab against the open box (x0, x1) × (z0, z1).
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - x0],
    [dx, x1 - a[0]],
    [-dz, a[1] - z0],
    [dz, z1 - a[1]],
  ] as const) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

/**
 * Main part of a room around the TV: the largest rectangle (aligned with the TV wall) inside the floor
 * polygon that contains the TV — so an L-shaped living room is framed on its sofa / TV area, not on the
 * hallway or kitchen leg. Returns its 4 corners (world), or the polygon itself when nothing fits.
 */
export function mainArea(floor: readonly [number, number][], tv: Pick<ItemLike, "position" | "rotationY"> | null): [number, number][] {
  if (floor.length < 4) return [...floor];
  const rot = tv?.rotationY ?? 0;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const toLocal = ([x, z]: readonly [number, number]): [number, number] => [x * c - z * sn, x * sn + z * c];
  const toWorld = ([x, z]: readonly [number, number]): [number, number] => [x * c + z * sn, -x * sn + z * c];
  const poly = floor.map(toLocal);
  const xs = [...new Set(poly.map((p) => Math.round(p[0] * 1000) / 1000))].sort((a, b) => a - b);
  const zs = [...new Set(poly.map((p) => Math.round(p[1] * 1000) / 1000))].sort((a, b) => a - b);
  if (xs.length * zs.length > 1600) return [...floor];
  const t = tv ? toLocal([tv.position[0], tv.position[2]]) : null;
  const e = 0.02;
  let best: [number, number, number, number] | null = null;
  let bestArea = 0;
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++)
      for (let k = 0; k < zs.length; k++)
        for (let l = k + 1; l < zs.length; l++) {
          const [x0, x1, z0, z1] = [xs[i]!, xs[j]!, zs[k]!, zs[l]!];
          const area = (x1 - x0) * (z1 - z0);
          if (area <= bestArea || x1 - x0 < 1 || z1 - z0 < 1) continue;
          if (t && (t[0] < x0 - 0.3 || t[0] > x1 + 0.3 || t[1] < z0 - 0.3 || t[1] > z1 + 0.3)) continue;
          if (!inPolygon([(x0 + x1) / 2, (z0 + z1) / 2], poly)) continue;
          let clear = true;
          for (let m = 0; m < poly.length && clear; m++) if (segHitsBox(poly[m]!, poly[(m + 1) % poly.length]!, x0 + e, z0 + e, x1 - e, z1 - e)) clear = false;
          if (!clear) continue;
          best = [x0, x1, z0, z1];
          bestArea = area;
        }
  if (!best) return [...floor];
  const [x0, x1, z0, z1] = best;
  return ([[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as [number, number][]).map(toWorld);
}

/** Default framing of the embedded view: the living room seen from the sofa side, facing the TV. */
export interface LivingOptions {
  /** Polar angle (from vertical); LIVING_POLAR by default. */
  polar?: number;
  /** "full": the camera turns all the way around (zoom: median over the turn, tighter than a full fit). */
  orbit?: Orbit;
}

export type Orbit = "sway" | "full";

/** `?orbit=full`: continuous 360° turn around the default target instead of the idle sway. */
export function parseOrbit(v: string | null): Orbit {
  return v === "full" ? "full" : "sway";
}

/** `?tilt=<degrees from vertical>` (30..80), lower values look more from above; null when absent / invalid. */
export function parseTilt(v: string | null): number | null {
  const deg = v == null ? NaN : Number(v);
  return Number.isFinite(deg) && deg >= 30 && deg <= 80 ? (deg * Math.PI) / 180 : null;
}

/** Height (m) the full turn aims at: the middle of the furniture, so the room stays centered at every angle. */
export const ORBIT_TARGET_Y = 0.8;
/** Full turn: a bit wider than the median fit, so the back walls stay in view. */
export const ORBIT_ZOOM = 0.9;

/** Area centroid of a polygon (vertex average for degenerate ones). */
export function centroid(poly: readonly [number, number][]): [number, number] {
  let a = 0;
  let x = 0;
  let z = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    const c = x1 * z2 - x2 * z1;
    a += c;
    x += (x1 + x2) * c;
    z += (z1 + z2) * c;
  }
  if (Math.abs(a) < 1e-9) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  return [x / (3 * a), z / (3 * a)];
}

export function livingFraming(
  items: readonly ItemLike[],
  rooms: readonly RoomLike[],
  devices: readonly Pick<Device, "itemId">[],
  width: number,
  height: number,
  fallbackAz: number,
  opts: LivingOptions = {},
): Framing | null {
  const found = findLivingRoom(items, rooms, devices);
  if (!found) return null;
  const polar = opts.polar ?? LIVING_POLAR;
  const az = facingAzimuth(found.tv, found.room.floor, fallbackAz);
  const area = mainArea(found.room.floor, found.tv);
  const facing = frameRoom(area, width, height, az, polar);
  if (opts.orbit === "full") {
    const zooms = Array.from({ length: 12 }, (_, i) => frameRoom(area, width, height, az + (i * Math.PI) / 6, polar).zoom).sort((a, b) => a - b);
    // Turn around the room's own center (a ground point offset for one azimuth would wander on screen).
    const [cx, cz] = centroid(area);
    return { target: [cx, ORBIT_TARGET_Y, cz], az, polar, zoom: ((zooms[5]! + zooms[6]!) / 2) * ORBIT_ZOOM };
  }
  // The room projects wider at the ends of the idle sway: meet halfway so it stays mostly in view.
  const swayed = Math.min(
    frameRoom(area, width, height, az + SWAY_AMPLITUDE, polar).zoom,
    frameRoom(area, width, height, az - SWAY_AMPLITUDE, polar).zoom,
  );
  return { ...facing, zoom: (facing.zoom + Math.min(facing.zoom, swayed)) / 2 };
}

/* ------------------------------------------------------------------ fly toward a device that changed */

/** Flight pose: lower (≈ 65° from vertical), close, target a little above the item. */
export const FLIGHT_POLAR = 1.13;
export const FLIGHT_IN_S = 1.2;
export const FLIGHT_HOLD_S = 2.5;
export const FLIGHT_OUT_S = 1.6;
/** Changes closer than this are one burst (scene, "all off"): pull back to the whole apartment instead. */
export const FLIGHT_BURST_MS = 600;

interface WallLike {
  id?: string;
  start: readonly [number, number];
  end: readonly [number, number];
  height: number;
}

/**
 * Azimuth from which `target` is seen with no wall in between, as close as possible to `preferred`
 * (tries every `step` both ways). The camera sits at target + (sinφ·sinθ, cosφ, sinφ·cosθ) (three.js
 * spherical, φ = polar): the line of sight rises 1/tan(φ) per horizontal meter, so a wall blocks it
 * when the sight line is still under the wall's top where it crosses it. `heightAt` gives the height a
 * wall really has from that angle (the dollhouse view lowers the walls facing the camera).
 */
export function clearAzimuth(
  target: readonly [number, number, number],
  walls: readonly WallLike[],
  preferred: number,
  polar: number,
  heightAt: (wall: WallLike, az: number) => number = (w) => w.height,
  step = Math.PI / 18,
): number {
  const rise = 1 / Math.tan(polar);
  const blocked = (az: number) => {
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    for (const w of walls) {
      const ex = w.end[0] - w.start[0];
      const ez = w.end[1] - w.start[1];
      const det = ex * dz - dx * ez;
      if (Math.abs(det) < 1e-9) continue;
      const qx = w.start[0] - target[0];
      const qz = w.start[1] - target[2];
      const s = (ex * qz - ez * qx) / det; // horizontal distance along the sight line
      const u = (dx * qz - dz * qx) / det; // position along the wall
      if (s <= 0.12 || u < 0 || u > 1) continue; // behind, or the wall the item sits against
      if (target[1] + s * rise < heightAt(w, az)) return true;
    }
    return false;
  };
  const turns = Math.ceil(Math.PI / step);
  for (let k = 0; k <= turns; k++) {
    for (const sign of k ? [1, -1] : [1]) {
      const az = preferred + sign * k * step;
      if (!blocked(az)) return az;
    }
  }
  return preferred;
}

export function flightTarget(item: Pick<ItemLike, "position" | "dimensions">): { target: [number, number, number]; size: number } {
  const [x, y, z] = item.position;
  const [w, h, d] = item.dimensions;
  // Low items: aim at most 1.2 m high (the lit floor around them counts); hanging ones (pendants,
  // ceiling fans) stay in the frame: aim at least at their lower third.
  return { target: [x, Math.min(y + h * 0.6, Math.max(1.2, y + h * 0.3)), z], size: Math.max(w, d, h * 0.8) + 3.4 };
}

/**
 * On/off state of every device linked to a 3D item; `changed` lists the items whose device switched
 * (unknown → known is not a change: first snapshot, reconnection of an unreachable device).
 */
export function switchedItems(prev: ReadonlyMap<string, boolean>, devices: readonly Device[], isOn: (d: Device) => boolean): { next: Map<string, boolean>; changed: string[] } {
  const next = new Map<string, boolean>();
  const changed: string[] = [];
  for (const d of devices) {
    if (!d.itemId || !d.state.reachable) continue;
    const on = isOn(d);
    next.set(d.id, on);
    const before = prev.get(d.id);
    if (before !== undefined && before !== on && !changed.includes(d.itemId)) changed.push(d.itemId);
  }
  return { next, changed };
}

export function parseFrame(v: string | null): FrameTarget | null {
  return v === "living" || v === "all" ? v : null;
}
