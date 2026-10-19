import { describe, expect, it } from "vitest";
import { fanServiceCalls, lightServiceCalls, mapHaEntities, type HaRegistry, type HaState } from "../src/ha.ts";

const states: HaState[] = [
  {
    entity_id: "media_player.philips_tv",
    state: "on",
    attributes: { friendly_name: "TV Philips", volume_level: 0.18, source: "HDMI 1", source_list: ["HDMI 1", "Netflix"] },
  },
  { entity_id: "media_player.spotify_rod", state: "idle", attributes: { friendly_name: "Spotify" } },
  { entity_id: "fan.create_windcalm", state: "on", attributes: { friendly_name: "Windcalm", percentage: 50, percentage_step: 16.666666666666668 } },
  { entity_id: "light.create_windcalm_light", state: "off", attributes: { friendly_name: "Windcalm lumière" } },
  { entity_id: "light.lightstrip", state: "on", attributes: { friendly_name: "lightstrip" } },
];

const reg: HaRegistry = {
  entities: [
    { entity_id: "media_player.philips_tv", device_id: "dtv", platform: "philips_js" },
    { entity_id: "fan.create_windcalm", device_id: "dfan", platform: "tuya" },
    { entity_id: "light.create_windcalm_light", device_id: "dfan", platform: "tuya" },
    { entity_id: "light.lightstrip", device_id: "dhue", platform: "hue" },
  ],
  deviceAreas: new Map([["dtv", "salon"], ["dfan", "chambre"]]),
  areas: new Map([["salon", "Living room"], ["chambre", "Chambre"]]),
};

describe("HA entities -> devices", () => {
  const { devices, fanLights } = mapHaEntities(states, reg, null);

  it("keeps the TV and the fan, ignores Hue lights and non-TV players", () => {
    expect(devices.map((d) => d.id).sort()).toEqual(["ha:fan.create_windcalm", "ha:media_player.philips_tv"]);
  });

  it("maps the TV", () => {
    const tv = devices.find((d) => d.kind === "tv")!;
    expect(tv).toMatchObject({ name: "TV Philips", source: "homeassistant", room: "Living room" });
    expect(tv.state).toEqual({ on: true, reachable: true, volume: 18, source: "HDMI 1" });
    expect(tv.capabilities.buttons).toEqual(["source:HDMI 1", "source:Netflix"]);
  });

  it("maps the fan with its paired light (same HA device)", () => {
    const fan = devices.find((d) => d.kind === "fan")!;
    expect(fan.room).toBe("Chambre");
    expect(fan.state).toEqual({ on: true, reachable: true, speed: 50, lightOn: false });
    expect(fan.capabilities).toEqual({ speedSteps: 6, fanLight: true });
    expect(fanLights.get("fan.create_windcalm")).toBe("light.create_windcalm_light");
  });

  it("TV off / unavailable (jointSPACE asleep) -> on:false", () => {
    for (const s of ["off", "unavailable"]) {
      const { devices: d } = mapHaEntities([{ ...states[0]!, state: s }], reg, null);
      expect(d[0]!.state).toEqual({ on: false, reachable: true });
    }
  });

  it("fan unavailable -> unreachable; pairs by name without registry", () => {
    const { devices: d, fanLights: fl } = mapHaEntities([{ ...states[2]!, state: "unavailable" }, states[3]!], undefined, null);
    expect(d[0]!.state).toEqual({ on: null, reachable: false });
    expect(fl.get("fan.create_windcalm")).toBe("light.create_windcalm_light");
  });

  it("explicit tvEntity wins", () => {
    const { devices: d } = mapHaEntities(states, reg, "media_player.spotify_rod");
    expect(d.filter((x) => x.kind === "tv").map((x) => x.id)).toEqual(["ha:media_player.spotify_rod"]);
  });
});

describe("fan actions -> services", () => {
  const st = { on: true, reachable: true };
  it("speed, off, light", () => {
    expect(fanServiceCalls("fan.f", "light.l", st, [{ type: "speed", value: 66 }])).toEqual([
      { domain: "fan", service: "turn_on", data: { entity_id: "fan.f", percentage: 66 } },
    ]);
    expect(fanServiceCalls("fan.f", "light.l", st, [{ type: "speed", value: 0 }])[0]!.service).toBe("turn_off");
    expect(fanServiceCalls("fan.f", "light.l", st, [{ type: "toggle" }])[0]!.service).toBe("turn_off");
    expect(fanServiceCalls("fan.f", "light.l", st, [{ type: "fanLight", on: true }])).toEqual([
      { domain: "light", service: "turn_on", data: { entity_id: "light.l" } },
    ]);
    expect(() => fanServiceCalls("fan.f", undefined, st, [{ type: "fanLight", on: true }])).toThrow();
  });
});

describe("Ambilight", () => {
  it("maps the Philips TV light entity to an Ambilight light and drives it", () => {
    const states = [{ entity_id: "light.tv_ambilight", state: "on", attributes: { brightness: 128, hs_color: [240, 100] } }];
    const reg = { entities: [{ entity_id: "light.tv_ambilight", platform: "philips_js", device_id: "d1" }], areas: new Map(), deviceAreas: new Map() };
    const { devices } = mapHaEntities(states as unknown as HaState[], reg as unknown as HaRegistry, null);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ id: "ha:light.tv_ambilight", name: "Ambilight", kind: "light", state: { on: true, brightness: 50, color: "#0000ff" } });
    expect(lightServiceCalls("light.tv_ambilight", devices[0]!.state, [{ type: "color", hex: "#ff0000" }])).toEqual([
      { domain: "light", service: "turn_on", data: { entity_id: "light.tv_ambilight", rgb_color: [255, 0, 0] } },
    ]);
  });
});
