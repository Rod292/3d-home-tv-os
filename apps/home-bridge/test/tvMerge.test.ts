import type { Device, DeviceAction } from "@appart3d/home";
import { describe, expect, it } from "vitest";
import { DEMO_LINKS, defaultConfig } from "../src/config.ts";
import { ambilightEffects, ambilightServiceCall, mapHaEntities, type HaAdapter, type HaRegistry, type HaState } from "../src/ha.ts";
import { Hub } from "../src/hub.ts";
import { planScene, SCENE_COLORS } from "../src/scenes.ts";
import { installedApps, isPackageName, launchCommands, launchFailed, parsePackages } from "../src/tvApp.ts";
import type { Adapter } from "../src/types.ts";

const REAL_EFFECTS = [
  "FOLLOW_AUDIO: ENERGY_ADAPTIVE_BRIGHTNESS",
  "FOLLOW_AUDIO: PARTY: Expert",
  "FOLLOW_AUDIO: VU_METER",
  "FOLLOW_COLOR: CUSTOM_COLOR",
  "FOLLOW_COLOR: HOT_LAVA",
  "FOLLOW_VIDEO: STANDARD",
  "FOLLOW_VIDEO: VIVID",
  "Mode: lounge",
];

const tvStates: HaState[] = [
  { entity_id: "media_player.tv", state: "on", attributes: { friendly_name: "TV", device_class: "tv", source_list: ["Watch TV", "HDMI 1"] } },
  {
    entity_id: "light.tv_ambilight",
    state: "on",
    attributes: { friendly_name: "TV Ambilight", supported_color_modes: ["hs"], color_mode: "onoff", effect: "FOLLOW_VIDEO: STANDARD", effect_list: REAL_EFFECTS, hs_color: null, brightness: null },
  },
];
const tvReg: HaRegistry = {
  entities: [
    { entity_id: "media_player.tv", device_id: "dtv", platform: "philips_js" },
    { entity_id: "light.tv_ambilight", device_id: "dtv", platform: "philips_js" },
  ],
  deviceAreas: new Map(),
  areas: new Map(),
};

describe("Ambilight folded into the TV", () => {
  it("no standalone light; TV carries ambilight state, capabilities and its entity", () => {
    const apps = [{ id: "com.netflix.ninja", label: "Netflix" }];
    const { devices, ambilights } = mapHaEntities(tvStates, tvReg, null, apps);
    expect(devices.map((d) => d.id)).toEqual(["ha:media_player.tv"]);
    const tv = devices[0]!;
    expect(tv.state.ambilight).toEqual({ on: true, effect: "FOLLOW_VIDEO: STANDARD" });
    expect(tv.capabilities.ambilight).toEqual({ color: true, brightness: true, effects: ["FOLLOW_AUDIO: ENERGY_ADAPTIVE_BRIGHTNESS", "FOLLOW_AUDIO: VU_METER", "FOLLOW_COLOR: HOT_LAVA", "FOLLOW_VIDEO: STANDARD", "FOLLOW_VIDEO: VIVID"] });
    expect(tv.capabilities.apps).toEqual(apps);
    expect(tv.capabilities.buttons).toEqual(["source:Watch TV", "source:HDMI 1", "app:com.netflix.ninja"]);
    expect(ambilights.get("media_player.tv")).toBe("light.tv_ambilight");
  });

  it("fixed color: color + brightness; unavailable (TV asleep): off", () => {
    const colored = { ...tvStates[1]!, attributes: { ...tvStates[1]!.attributes, effect: "FOLLOW_COLOR: CUSTOM_COLOR", hs_color: [240, 100], brightness: 64 } };
    expect(mapHaEntities([tvStates[0]!, colored], tvReg, null).devices[0]!.state.ambilight).toEqual({ on: true, color: "#0000ff", brightness: 25, effect: "FOLLOW_COLOR: CUSTOM_COLOR" });
    const asleep = { ...tvStates[1]!, state: "unavailable" };
    expect(mapHaEntities([tvStates[0]!, asleep], tvReg, null).devices[0]!.state.ambilight).toEqual({ on: false });
  });

  it("effects filter and the ambilight action → light service", () => {
    expect(ambilightEffects(REAL_EFFECTS)).not.toContain("Mode: lounge");
    expect(ambilightEffects(undefined)).toEqual([]);
    expect(ambilightServiceCall("light.a", { type: "ambilight", on: false, hex: "#ff0000" })).toEqual({ domain: "light", service: "turn_off", data: { entity_id: "light.a" } });
    expect(ambilightServiceCall("light.a", { type: "ambilight", hex: "#ff0000", brightness: 140 })).toEqual({ domain: "light", service: "turn_on", data: { entity_id: "light.a", rgb_color: [255, 0, 0], brightness_pct: 100 } });
    expect(ambilightServiceCall("light.a", { type: "ambilight", on: true, effect: "FOLLOW_VIDEO: VIVID" })).toEqual({ domain: "light", service: "turn_on", data: { entity_id: "light.a", effect: "FOLLOW_VIDEO: VIVID" } });
    expect(() => ambilightServiceCall("light.a", { type: "ambilight", hex: "nope" })).toThrow();
  });
});

describe("TV apps over ADB", () => {
  const listing = "package:com.android.systemui\npackage:com.netflix.ninja\npackage:tv.arte.plus7\npackage:com.google.android.youtube.tv\npackage:org.droidtv.playtv\n";
  it("parses pm list packages and keeps known apps in display order", () => {
    expect(parsePackages(listing)).toHaveLength(5);
    expect(parsePackages("mCurrentFocus=Window{…}")).toEqual([]);
    expect(installedApps(parsePackages(listing))).toEqual([
      { id: "org.droidtv.playtv", label: "TV" },
      { id: "com.google.android.youtube.tv", label: "YouTube" },
      { id: "com.netflix.ninja", label: "Netflix" },
      { id: "tv.arte.plus7", label: "ARTE" },
    ]);
  });
  it("launch commands: leanback then launcher; never a shell injection", () => {
    expect(launchCommands("com.netflix.ninja")).toEqual([
      "monkey -p com.netflix.ninja -c android.intent.category.LEANBACK_LAUNCHER 1",
      "monkey -p com.netflix.ninja -c android.intent.category.LAUNCHER 1",
    ]);
    for (const bad of ["com.x; reboot", "netflix", "com.x && rm", "../x"]) {
      expect(isPackageName(bad)).toBe(false);
      expect(() => launchCommands(bad)).toThrow();
    }
    expect(launchFailed("** No activities found to run, monkey aborted.")).toBe(true);
    expect(launchFailed("Events injected: 1")).toBe(false);
    expect(launchFailed(undefined)).toBe(false);
  });
});

describe("scenes with the Ambilight in the TV", () => {
  const strip: Device = { id: "hue:light:12", name: "lightstrip", kind: "light", source: "hue", room: "Salon", state: { on: true, reachable: true }, capabilities: { brightness: true, color: true, kelvin: true } };
  const tv = (ambilightOn: boolean, on = true): Device => ({
    id: "ha:media_player.tv",
    name: "TV",
    kind: "tv",
    source: "homeassistant",
    room: "Salon",
    state: { on, reachable: true, ambilight: { on: ambilightOn } },
    capabilities: { volume: true, ambilight: { color: true, brightness: true } },
  });
  const byId = (p: ReturnType<typeof planScene>) => Object.fromEntries((p ?? []).map((x) => [x.deviceId, x.actions]));
  const opts = { ambientStrip: "hue:light:12" };

  it("Film: TV on + Ambilight low violet; the strip goes off", () => {
    const p = byId(planScene("movie", [strip, tv(false, false)], opts));
    expect(p["ha:media_player.tv"]).toEqual([{ type: "power", on: true }, { type: "ambilight", on: true, hex: SCENE_COLORS.movie, brightness: 25 }]);
    expect(p["hue:light:12"]).toEqual([{ type: "power", on: false }]);
  });
  it("Absent: Ambilight off before the TV; Cosy / Lumineux / Nuit leave the Ambilight alone", () => {
    expect(byId(planScene("away", [tv(true)], opts))["ha:media_player.tv"]).toEqual([{ type: "ambilight", on: false }, { type: "power", on: false }]);
    expect(byId(planScene("away", [tv(true, false)], opts))["ha:media_player.tv"]).toEqual([{ type: "ambilight", on: false }]);
    for (const sc of ["cozy", "bright"]) expect(byId(planScene(sc, [strip, tv(true)], opts))["ha:media_player.tv"]).toBeUndefined();
    expect(byId(planScene("night", [tv(true)], opts))["ha:media_player.tv"]).toEqual([{ type: "power", on: false }]);
    expect(byId(planScene("cozy", [strip, tv(true)], opts))["hue:light:12"]?.[2]).toEqual({ type: "kelvin", value: 2700 });
  });
});

/** Fake Home Assistant adapter: a TV that turns on a little after being asked. */
class FakeHa implements Adapter {
  readonly name = "homeassistant";
  enabled = true;
  calls: string[] = [];
  on: boolean;
  onChange: () => void = () => {};
  onSunChange = () => {};
  constructor(on: boolean) {
    this.on = on;
  }
  async start(onChange: () => void) {
    this.onChange = onChange;
  }
  stop() {}
  warnings() {
    return [];
  }
  sun() {
    return null;
  }
  devices(): Device[] {
    return [
      {
        id: "ha:media_player.tv",
        name: "TV",
        kind: "tv",
        source: "homeassistant",
        room: "",
        state: { on: this.on, reachable: true, ambilight: { on: false } },
        capabilities: { volume: true, ambilight: { color: true, brightness: true }, apps: [{ id: "com.netflix.ninja", label: "Netflix" }], buttons: ["app:com.netflix.ninja"] },
      },
    ];
  }
  async act(_id: string, _a: DeviceAction[]) {}
  entityOf(id: string) {
    return id.replace(/^ha:/, "");
  }
  ambilightEntityOf() {
    return "light.tv_ambilight";
  }
  tvApps() {
    return [{ id: "com.netflix.ninja", label: "Netflix" }];
  }
  async callService(domain: string, service: string, data: Record<string, unknown>) {
    this.calls.push(`${domain}.${service} ${JSON.stringify(data)}`);
    if (domain === "media_player" && service === "turn_on")
      setTimeout(() => {
        this.on = true;
        this.onChange();
      }, 300);
    return [];
  }
  async launchApp(pkg: string) {
    if (!this.on) throw new Error("TV éteinte");
    this.calls.push(`launch ${pkg}`);
  }
}

function hubWith(ha: FakeHa) {
  const cfg = defaultConfig();
  cfg.defaultScene = null;
  cfg.links = { ...DEMO_LINKS };
  return new Hub(cfg, { adapters: [ha], ha: ha as unknown as HaAdapter, sunElevation: 10, sunIntervalMs: 3_600_000 });
}

describe("hub: TV apps and Ambilight", () => {
  it("launching an app on a TV that is off: power on, wait for « on », then launch", async () => {
    const ha = new FakeHa(false);
    const hub = hubWith(ha);
    await hub.start();
    await hub.act("ha:media_player.tv", { type: "button", name: "app:com.netflix.ninja" });
    expect(ha.calls).toEqual(['media_player.turn_on {"entity_id":"media_player.tv"}', "launch com.netflix.ninja"]);
    hub.stop();
  });

  it("TV on: launches directly; unknown apps refused; ambilight action → light service on its entity", async () => {
    const ha = new FakeHa(true);
    const hub = hubWith(ha);
    await hub.start();
    await hub.act("ha:media_player.tv", { type: "button", name: "app:com.netflix.ninja" });
    await expect(hub.act("ha:media_player.tv", { type: "button", name: "app:com.evil" })).rejects.toThrow(/inconnue/);
    await hub.act("ha:media_player.tv", { type: "ambilight", hex: "#4b1fd1", brightness: 25 });
    expect(ha.calls).toEqual(["launch com.netflix.ninja", 'light.turn_on {"entity_id":"light.tv_ambilight","rgb_color":[75,31,209],"brightness_pct":25}']);
    hub.stop();
  });

  it("the TV device keeps item_2 (kind:tv link)", async () => {
    const hub = hubWith(new FakeHa(true));
    await hub.start();
    expect(hub.device("ha:media_player.tv").itemId).toBe("item_2");
    hub.stop();
  });
});
