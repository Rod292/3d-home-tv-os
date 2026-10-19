/** Bridge-side scenes, planned as a pure function over the current devices. */
import type { Device, DeviceAction } from "@appart3d/home";

export interface ScenePlanItem {
  deviceId: string;
  actions: DeviceAction[];
}

export const SCENE_COLORS = {
  neutralKelvin: 4000,
  warmKelvin: 2700,
  amber: "#ff8a1f",
  movie: "#4b1fd1",
} as const;

const isLight = (d: Device) => d.kind === "light" || d.kind === "plug";

function lightOn(d: Device, brightness: number, look: { kelvin?: number; hex?: string }): DeviceAction[] {
  const actions: DeviceAction[] = [{ type: "power", on: true }];
  if (d.kind === "plug") return actions;
  if (d.capabilities.brightness) actions.push({ type: "brightness", value: brightness });
  if (look.hex && d.capabilities.color) actions.push({ type: "color", hex: look.hex });
  else if (look.kelvin && d.capabilities.kelvin) actions.push({ type: "kelvin", value: look.kelvin });
  else if (look.kelvin && d.capabilities.color) actions.push({ type: "color", hex: kelvinHexApprox(look.kelvin) });
  return actions;
}

function kelvinHexApprox(k: number): string {
  return k <= 3000 ? "#ffb46b" : k <= 4500 ? "#ffd8b0" : "#ffffff";
}

/** Power off, skipped when we already know it's off (and for a TV whose state is unknown: IR is a toggle). */
function off(d: Device): ScenePlanItem | null {
  if (d.state.on === false) return null;
  if (d.kind === "tv" && d.state.on === null) return null;
  return { deviceId: d.id, actions: [{ type: "power", on: false }] };
}

/** Pause a speaker that is playing (only when it offers pause right now). */
function pauseSpeaker(d: Device): ScenePlanItem | null {
  if (d.kind !== "speaker" || d.state.media?.state !== "playing" || !d.capabilities.media?.includes("pause")) return null;
  return { deviceId: d.id, actions: [{ type: "media", command: "pause" }] };
}

/**
 * Ambient light of « Film » / amber accent of « Cosy »: the TV's Ambilight (the TV device itself when
 * it carries one; then no light gets the accent), else the configured strip.
 */
export function findStrip(devices: Device[], ambientStrip: string | null): Device | undefined {
  return (
    devices.find((d) => d.kind === "tv" && !!d.capabilities.ambilight) ??
    devices.find((d) => d.kind === "light" && /ambilight/i.test(d.name)) ??
    devices.find((d) => d.id === ambientStrip) ??
    devices.find((d) => d.kind === "light" && /strip|ruban|bande/i.test(d.name))
  );
}

export function planScene(
  sceneId: string,
  devices: Device[],
  opts: { ambientStrip: string | null; livingRoom?: string; bedroom?: string },
): ScenePlanItem[] | null {
  const living = opts.livingRoom ?? "Salon";
  const bedroom = opts.bedroom ?? "Chambre";
  const strip = findStrip(devices, opts.ambientStrip);
  const plan: (ScenePlanItem | null)[] = [];
  const lights = devices.filter(isLight);

  switch (sceneId) {
    case "bright":
      for (const d of lights) plan.push({ deviceId: d.id, actions: lightOn(d, 100, { kelvin: SCENE_COLORS.neutralKelvin }) });
      break;
    case "cozy":
      for (const d of lights) {
        if (d.room !== living) continue;
        const look = d.id === strip?.id ? { hex: SCENE_COLORS.amber } : { kelvin: SCENE_COLORS.warmKelvin };
        plan.push({ deviceId: d.id, actions: lightOn(d, 45, look) });
      }
      break;
    case "movie":
      for (const d of lights) {
        if (d.id === strip?.id) plan.push({ deviceId: d.id, actions: lightOn(d, 25, { hex: SCENE_COLORS.movie }) });
        else plan.push(off(d));
      }
      for (const d of devices) {
        if (d.kind === "tv") {
          const actions: DeviceAction[] = [{ type: "power", on: true }];
          // Its Ambilight: low blue / violet behind the screen.
          if (d.id === strip?.id) actions.push({ type: "ambilight", on: true, hex: SCENE_COLORS.movie, ...(d.capabilities.ambilight?.brightness ? { brightness: 25 } : {}) });
          plan.push({ deviceId: d.id, actions });
        }
        // The film's sound comes from the TV: the music on the HomePod stops.
        plan.push(pauseSpeaker(d));
      }
      break;
    case "night":
      for (const d of lights) {
        if (d.kind === "plug" && d.room === bedroom) plan.push({ deviceId: d.id, actions: [{ type: "power", on: true }] });
        else plan.push(off(d));
      }
      for (const d of devices) {
        if (d.kind === "tv") plan.push(off(d));
        // The fan keeps blowing at night, only its light goes off.
        if (d.kind === "fan" && d.capabilities.fanLight && d.state.lightOn !== false)
          plan.push({ deviceId: d.id, actions: [{ type: "fanLight", on: false }] });
      }
      break;
    case "away":
      for (const d of devices) {
        if (d.kind === "tv") {
          // Ambilight first: it sleeps with the TV, and it may stay lit on its own.
          const actions: DeviceAction[] = d.state.ambilight?.on ? [{ type: "ambilight", on: false }] : [];
          const tvOff = off(d);
          if (tvOff) actions.push(...tvOff.actions);
          if (actions.length) plan.push({ deviceId: d.id, actions });
        } else if (isLight(d)) plan.push(off(d));
        plan.push(pauseSpeaker(d));
        if (d.kind === "fan") {
          const actions: DeviceAction[] = [];
          if (d.state.on !== false) actions.push({ type: "power", on: false });
          if (d.capabilities.fanLight && d.state.lightOn !== false) actions.push({ type: "fanLight", on: false });
          if (actions.length) plan.push({ deviceId: d.id, actions });
        }
      }
      break;
    default:
      return null;
  }
  return plan.filter((p): p is ScenePlanItem => p !== null);
}
