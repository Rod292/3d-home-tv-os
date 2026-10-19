/**
 * TV = Home Assistant media_player (off, volume, source; jointSPACE sleeps when the TV is off)
 *    + robot IR (the only way to switch it ON; any other remote button).
 */
import type { Device, DeviceAction, DeviceState } from "@appart3d/home";
import { HttpError } from "./types.ts";

export const TV_POWER_BUTTON = "tv_power";

export type TvStep =
  | { via: "robot"; button: string; repeat?: number }
  | { via: "ha"; service: string; data?: Record<string, unknown>; fallbackButton?: string };

export interface TvContext {
  ha: boolean;
  /** Robot reachable with IR remote support. */
  robot: boolean;
  buttons: string[];
}

function pick(buttons: string[], candidates: string[]): string | undefined {
  return candidates.find((c) => buttons.includes(c));
}

export function planTvAction(state: DeviceState, action: DeviceAction, ctx: TvContext): TvStep[] {
  const robotPower = ctx.robot && ctx.buttons.includes(TV_POWER_BUTTON);
  switch (action.type) {
    case "toggle":
      return planTvAction(state, { type: "power", on: state.on !== true }, ctx);
    case "power":
      if (action.on) {
        if (state.on === true) return [];
        if (robotPower) return [{ via: "robot", button: TV_POWER_BUTTON }];
        if (ctx.ha) return [{ via: "ha", service: "turn_on" }];
        throw new HttpError(503, "impossible d'allumer la TV : robot (IR, bouton tv_power) indisponible");
      }
      if (state.on === false) return [];
      if (ctx.ha)
        return [{ via: "ha", service: "turn_off", fallbackButton: robotPower && state.on === true ? TV_POWER_BUTTON : undefined }];
      if (robotPower) return [{ via: "robot", button: TV_POWER_BUTTON }];
      throw new HttpError(503, "impossible d'éteindre la TV");
    case "volume":
      if (!ctx.ha) throw new HttpError(400, "volume absolu indisponible sans Home Assistant");
      if (state.on !== true) throw new HttpError(409, "la TV est éteinte");
      return [{ via: "ha", service: "volume_set", data: { volume_level: Math.max(0, Math.min(100, action.value)) / 100 } }];
    case "volumeStep": {
      const up = action.delta > 0;
      if (ctx.ha && state.on === true) return [{ via: "ha", service: up ? "volume_up" : "volume_down" }];
      const b = ctx.robot ? pick(ctx.buttons, up ? ["volume_up", "vol_up", "tv_vol_up"] : ["volume_down", "vol_down", "tv_vol_down"]) : undefined;
      if (b) return [{ via: "robot", button: b }];
      throw new HttpError(409, "volume indisponible");
    }
    case "button":
      if (action.name.startsWith("source:")) {
        if (!ctx.ha) throw new HttpError(400, "changement de source indisponible sans Home Assistant");
        return [{ via: "ha", service: "select_source", data: { source: action.name.slice("source:".length) } }];
      }
      if (!ctx.robot) throw new HttpError(503, "robot indisponible");
      if (!ctx.buttons.includes(action.name)) throw new HttpError(400, `bouton inconnu: ${action.name}`);
      return [{ via: "robot", button: action.name }];
    default:
      throw new HttpError(400, `action ${action.type} non supportée par la TV`);
  }
}

/** Merge the HA TV (if any) with the robot's IR buttons into the single TV device. */
export function composeTv(haTv: Device | undefined, robot: { configured: boolean; online: boolean; buttons: string[] }): Device | undefined {
  if (haTv) {
    if (!robot.configured) return haTv;
    const sources = haTv.capabilities.buttons ?? [];
    return {
      ...haTv,
      state: { ...haTv.state, reachable: haTv.state.reachable || robot.online },
      capabilities: { ...haTv.capabilities, buttons: [...robot.buttons, ...sources] },
    };
  }
  if (!robot.configured) return undefined;
  return {
    id: "robot:tv",
    name: "TV",
    kind: "tv",
    source: "robot",
    room: "",
    state: { on: null, reachable: robot.online },
    capabilities: { buttons: [...robot.buttons] },
  };
}
