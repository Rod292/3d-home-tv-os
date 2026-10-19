import { describe, expect, it } from "vitest";
import { composeTv, planTvAction } from "../src/tv.ts";

const both = { ha: true, robot: true, buttons: ["tv_power", "volume_up", "volume_down", "mute"] };
const off = { on: false, reachable: true };
const on = { on: true, reachable: true };

describe("TV planning (HA + robot IR)", () => {
  it("power on: robot IR when HA says off, nothing when already on", () => {
    expect(planTvAction(off, { type: "power", on: true }, both)).toEqual([{ via: "robot", button: "tv_power" }]);
    expect(planTvAction(on, { type: "power", on: true }, both)).toEqual([]);
  });

  it("power on without robot falls back to HA, and fails without either", () => {
    expect(planTvAction(off, { type: "power", on: true }, { ha: true, robot: false, buttons: [] })).toEqual([{ via: "ha", service: "turn_on" }]);
    expect(() => planTvAction(off, { type: "power", on: true }, { ha: false, robot: false, buttons: [] })).toThrow();
    // robot reachable but no tv_power learned yet
    expect(planTvAction(off, { type: "power", on: true }, { ha: true, robot: true, buttons: [] })).toEqual([{ via: "ha", service: "turn_on" }]);
  });

  it("power off: HA with IR fallback; no-op when off", () => {
    expect(planTvAction(on, { type: "power", on: false }, both)).toEqual([{ via: "ha", service: "turn_off", fallbackButton: "tv_power" }]);
    expect(planTvAction(off, { type: "power", on: false }, both)).toEqual([]);
  });

  it("toggle follows state", () => {
    expect(planTvAction(on, { type: "toggle" }, both)[0]).toMatchObject({ via: "ha", service: "turn_off" });
    expect(planTvAction(off, { type: "toggle" }, both)[0]).toEqual({ via: "robot", button: "tv_power" });
  });

  it("volume via HA; steps fall back to IR when HA can't", () => {
    expect(planTvAction(on, { type: "volume", value: 30 }, both)).toEqual([{ via: "ha", service: "volume_set", data: { volume_level: 0.3 } }]);
    expect(planTvAction(on, { type: "volumeStep", delta: 1 }, both)).toEqual([{ via: "ha", service: "volume_up" }]);
    expect(planTvAction(on, { type: "volumeStep", delta: -1 }, { ...both, ha: false })).toEqual([{ via: "robot", button: "volume_down" }]);
    expect(() => planTvAction(off, { type: "volume", value: 30 }, both)).toThrow();
  });

  it("buttons: source:* via HA, others via robot", () => {
    expect(planTvAction(on, { type: "button", name: "source:HDMI 1" }, both)).toEqual([{ via: "ha", service: "select_source", data: { source: "HDMI 1" } }]);
    expect(planTvAction(on, { type: "button", name: "mute" }, both)).toEqual([{ via: "robot", button: "mute" }]);
    expect(() => planTvAction(on, { type: "button", name: "nope" }, both)).toThrow();
  });

  it("composes HA TV + robot buttons", () => {
    const ha = { id: "ha:media_player.tv", name: "TV", kind: "tv" as const, source: "homeassistant" as const, room: "", state: off, capabilities: { volume: true, buttons: ["source:HDMI 1"] } };
    expect(composeTv(ha, { configured: true, online: true, buttons: ["tv_power"] })!.capabilities.buttons).toEqual(["tv_power", "source:HDMI 1"]);
    expect(composeTv(undefined, { configured: true, online: false, buttons: [] })).toMatchObject({ id: "robot:tv", state: { on: null, reachable: false } });
    expect(composeTv(undefined, { configured: false, online: false, buttons: [] })).toBeUndefined();
  });
});
