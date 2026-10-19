import { describe, expect, it } from "vitest";
import type { Device } from "@appart3d/home";
import {
  ALL_ROOMS,
  applyServerDevice,
  applySnapshot,
  devicesByItem,
  devicesForItem,
  failAction,
  fanStep,
  hasStripGlow,
  homeTitle,
  moveInOrder,
  sortByOrder,
  isOn,
  kelvinToHex,
  lightsSummary,
  lookForItem,
  screenOnTop,
  predict,
  resolveAction,
  roomCounts,
  startAction,
  tileLabel,
  type DevicesState,
} from "../src/lib/home";
import { homeLightMap, sourceFactor, STRIP_SUFFIX, type LampSource } from "../src/lib/nightLights";
import { mockDevices, normalizeBase, resolveBridgeBase } from "../src/lib/homeClient";

const byId = (id: string, list = mockDevices()) => list.find((d) => d.id.includes(id))!;

describe("tile labels", () => {
  it("formats states with the room", () => {
    expect(tileLabel(byId("ikea-lampe"))).toBe("70 % · Salon");
    expect(tileLabel(byId("lustre-cuisine"))).toBe("Éteint · Cuisine");
    expect(tileLabel(byId("hue:light:lustre"))).toBe("Injoignable · Salon");
    expect(tileLabel(byId("donut"))).toBe("Éteint · Chambre");
    expect(tileLabel(byId("robot:tv"))).toBe("Éteinte · Salon");
  });
  it("describes fans by speed step", () => {
    const fan = byId("ventilateur");
    expect(tileLabel(predict(fan, { type: "speed", value: 50 }))).toBe("Vitesse 3 · Salon");
    expect(tileLabel(predict(fan, { type: "fanLight", on: true }))).toBe("Lumière allumée · Salon");
  });
  it("summarizes lights in French", () => {
    const list = mockDevices();
    // The Ambilight lives in the TV: not counted as a light.
    expect(lightsSummary(list)).toBe("2 lumières sur 5 allumées");
    const one = list.map((d) => (d.id.includes("lightstrip") ? predict(d, { type: "power", on: false }) : d));
    expect(lightsSummary(one)).toBe("1 lumière sur 5 allumée");
    const none = one.map((d) => (d.kind === "light" ? predict(d, { type: "power", on: false }) : d));
    expect(lightsSummary(none)).toBe("Toutes les lumières sont éteintes");
    expect(homeTitle("Alex")).toBe("Chez Alex");
    expect(homeTitle("Chez Alex")).toBe("Chez Alex");
  });
  it("converts kelvin to a warm/cool hex", () => {
    expect(kelvinToHex(6500)).toMatch(/^#ff[f-f][0-9a-f]{3}$/);
    expect(kelvinToHex(2200).slice(0, 3)).toBe("#ff");
  });
});

describe("room counts", () => {
  it("counts devices on per room, Tous first", () => {
    const counts = roomCounts(mockDevices());
    // the mock HomePod is playing: it counts as on
    expect(counts[0]).toEqual({ room: ALL_ROOMS, total: 8, on: 3 });
    expect(counts.map((c) => c.room)).toEqual([ALL_ROOMS, "Salon", "Cuisine", "Chambre"]);
    expect(counts.find((c) => c.room === "Salon")).toEqual({ room: "Salon", total: 6, on: 3 });
    expect(counts.find((c) => c.room === "Chambre")?.on).toBe(0);
  });
});

describe("optimistic updates", () => {
  const initial = (): DevicesState => ({ devices: mockDevices(), pending: {} });
  const id = "hue:light:lustre-cuisine";
  const dev = (st: DevicesState) => st.devices.find((d) => d.id === id)!;

  it("applies the prediction at once and the server answer after", () => {
    let st = startAction(initial(), id, { type: "toggle" }, 1);
    expect(dev(st).state.on).toBe(true);
    expect(st.pending[id]?.seq).toBe(1);
    const server: Device = { ...dev(st), state: { ...dev(st).state, brightness: 90 } };
    st = resolveAction(st, id, 1, server);
    expect(dev(st).state.brightness).toBe(90);
    expect(st.pending[id]).toBeUndefined();
  });

  it("rolls back to the last confirmed state on error", () => {
    let st = startAction(initial(), id, { type: "brightness", value: 30 }, 1);
    st = startAction(st, id, { type: "brightness", value: 60 }, 2);
    expect(dev(st).state.brightness).toBe(60);
    // The first one fails while the second is in flight: nothing changes yet.
    expect(failAction(st, id, 1)).toBe(st);
    st = failAction(st, id, 2);
    expect(dev(st).state.on).toBe(false);
    expect(dev(st).state.brightness).toBe(100);
    expect(st.pending).toEqual({});
  });

  it("an old answer only moves the rollback point", () => {
    let st = startAction(initial(), id, { type: "brightness", value: 30 }, 1);
    st = startAction(st, id, { type: "brightness", value: 60 }, 2);
    st = resolveAction(st, id, 1, predict(mockDevices().find((d) => d.id === id)!, { type: "brightness", value: 30 }));
    expect(dev(st).state.brightness).toBe(60);
    st = failAction(st, id, 2);
    expect(dev(st).state.brightness).toBe(30);
  });

  it("server pushes don't override a pending prediction", () => {
    let st = startAction(initial(), id, { type: "power", on: true }, 1);
    const pushed = mockDevices().find((d) => d.id === id)!;
    st = applyServerDevice(st, pushed);
    expect(dev(st).state.on).toBe(true);
    st = applySnapshot(st, { devices: mockDevices() });
    expect(dev(st).state.on).toBe(true);
    st = failAction(st, id, 1);
    expect(dev(st).state.on).toBe(false);
    // Without pending actions, pushes are shown.
    st = applyServerDevice(st, predict(pushed, { type: "power", on: true }));
    expect(isOn(dev(st))).toBe(true);
  });
});

describe("device ↔ item lookup", () => {
  it("groups devices by linked 3D item (the TV item carries the TV, its Ambilight inside)", () => {
    const map = devicesByItem(mockDevices());
    expect(map.get("item_30")?.map((d) => d.kind)).toEqual(["tv"]);
    expect(hasStripGlow(map.get("item_30")!)).toBe(true);
    expect(map.get("item_floorlamp")?.[0]?.name).toBe("IKEA lampe");
    expect(devicesForItem(mockDevices(), "item_fan")[0]?.kind).toBe("fan");
    expect([...map.keys()]).not.toContain(undefined);
  });

  it("derives the 3D look", () => {
    const map = devicesByItem(mockDevices());
    const tv = lookForItem("television", map.get("item_30"));
    // The TV carries its Ambilight (behind it); the Hue strip is stuck behind the desk top, behind the monitor.
    expect(tv?.strip?.on).toBe(false);
    expect(tv?.strip?.color).toBe("#4d7cff");
    expect(tv?.stripPlacement).toBe("behind");
    const desk = lookForItem("desk", map.get("item_10"));
    expect(desk).toMatchObject({ strip: { on: true, color: "#a66bff" }, stripPlacement: "behindTop" });
    // Other furniture: under it (floor glow), unless a screen stands on it.
    expect(lookForItem("storage", map.get("item_10"))?.stripPlacement).toBe("under");
    expect(lookForItem("storage", map.get("item_10"), { screenOnTop: true })?.stripPlacement).toBe("behindTop");
    expect(tv?.screen?.on).toBe(false);
    const lamp = lookForItem("floorLamp", map.get("item_floorlamp"));
    expect(lamp?.glow?.on).toBe(true);
    expect(lamp?.glow?.level).toBeCloseTo(0.7);
    // Unlinked lamps are dark in Maison mode; other unlinked items keep their usual look.
    expect(lookForItem("pendantLamp", undefined)?.glow?.on).toBe(false);
    expect(lookForItem("sofa", undefined)).toBeUndefined();
    const fan = lookForItem("ceilingFan", [predict(byId("ventilateur"), { type: "speed", value: 100 })]);
    expect(fan?.fan?.speed).toBe(1);
    expect(fan?.glow?.on).toBe(false);
  });

  it("drives light pools by device state", () => {
    const src = (itemId: string, category: LampSource["category"]): LampSource => ({
      itemId,
      category,
      position: [0, 1, 0],
      bottomY: 0,
      color: "#fff",
      intensity: 1,
      distance: 3,
      decay: 1.5,
      weight: 1,
      overhead: false,
    });
    const map = homeLightMap(
      [src("item_floorlamp", "floorLamp"), src("item_pendant_globe", "pendantLamp"), src("item_30" + STRIP_SUFFIX, "television"), src("fire", "fireplace")],
      devicesByItem(mockDevices()),
    );
    expect(map.get("item_floorlamp")?.on).toBe(true);
    expect(map.get("item_pendant_globe")?.on).toBe(false);
    expect(map.get("item_30" + STRIP_SUFFIX)?.color).toBe("#4d7cff");
    expect(map.get("fire")).toBeNull();
    expect(sourceFactor(map.get("fire"), 0.3)).toBe(0.3);
    expect(sourceFactor(map.get("item_pendant_globe"), 1)).toBe(0);
    expect(sourceFactor(map.get("item_floorlamp"), 0)).toBeGreaterThan(0);
  });
});

describe("bridge URL", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it("defaults to same origin, remembers ?bridge= and resets", () => {
    const st = memory();
    expect(resolveBridgeBase(new URLSearchParams(""), st)).toBe("");
    expect(resolveBridgeBase(new URLSearchParams("bridge=192.168.1.20:8787/"), st)).toBe("http://192.168.1.20:8787");
    expect(resolveBridgeBase(new URLSearchParams(""), st)).toBe("http://192.168.1.20:8787");
    expect(resolveBridgeBase(new URLSearchParams("bridge="), st)).toBe("");
    expect(resolveBridgeBase(new URLSearchParams(""), st)).toBe("");
    expect(normalizeBase("https://maison.local:8787")).toBe("https://maison.local:8787");
  });
});

describe("fan steps", () => {
  it("a running fan reporting a tiny percentage is on step 1", () => {
    const fan = mockDevices().find((d) => d.kind === "fan")!;
    const on = { ...fan, state: { ...fan.state, on: true, speed: 1 } };
    expect(fanStep(on)).toBe(1);
    expect(fanStep({ ...on, state: { ...on.state, on: false } })).toBe(0);
    expect(lookForItem("ceilingFan", [on])?.fan?.speed).toBeCloseTo(1 / 6);
  });
});

describe("screen standing on furniture", () => {
  // The reference desk (turned 90°, back against the wall) and the monitor on its arm.
  const desk = { id: "item_10", category: "desk" as const, position: [6.28, 0, 1.32] as const, rotationY: Math.PI / 2, dimensions: [1.37, 0.79, 0.77] as const };
  const monitor = { id: "item_photo_8", category: "monitor" as const, position: [6.1, 0.79, 1.32] as const, rotationY: Math.PI / 2, dimensions: [0.62, 0.55, 0.35] as const };
  it("finds the monitor in the desk's local frame (toward the back)", () => {
    const on = screenOnTop(desk, [desk, monitor]);
    expect(on).not.toBeNull();
    expect(on!.x).toBeCloseTo(0, 5);
    expect(on!.z).toBeCloseTo(-0.18, 5);
    expect(on!.width).toBeCloseTo(0.62);
  });
  it("ignores screens elsewhere or on the floor", () => {
    expect(screenOnTop(desk, [desk, { ...monitor, position: [8, 0.79, 3] }])).toBeNull();
    expect(screenOnTop(desk, [desk, { ...monitor, position: [6.1, 0, 1.32] }])).toBeNull();
    expect(screenOnTop(desk, [desk, { ...monitor, category: "lamp" as never }])).toBeNull();
  });
});

describe("TV Ambilight and apps", () => {
  const tv = () => byId("robot:tv");
  it("predicts the ambilight action and app launches", () => {
    let d = predict(tv(), { type: "ambilight", hex: "#ff5fa2" });
    expect(d.state.ambilight).toMatchObject({ on: true, color: "#ff5fa2" });
    d = predict(d, { type: "ambilight", effect: "FOLLOW_VIDEO: VIVID" });
    expect(d.state.ambilight).toEqual({ on: true, brightness: 70, effect: "FOLLOW_VIDEO: VIVID" });
    expect(predict(d, { type: "ambilight", on: false }).state.ambilight).toEqual({ on: false });
    const opened = predict(tv(), { type: "button", name: "app:com.netflix.ninja" });
    expect(opened.state).toMatchObject({ on: true, media: { app: "Netflix" } });
  });
  it("the halo behind the TV follows the Ambilight; following the picture it takes the app's color", () => {
    const on = { ...tv(), state: { ...tv().state, on: true, media: { state: "playing" as const, app: "Netflix" }, ambilight: { on: true, effect: "FOLLOW_VIDEO: STANDARD" } } };
    expect(lookForItem("television", [on])?.strip).toEqual({ on: true, color: "#e50914", level: 1 });
    const fixed = predict(on, { type: "ambilight", hex: "#4fd38a", brightness: 50 });
    expect(lookForItem("television", [fixed])?.strip).toEqual({ on: true, color: "#4fd38a", level: 0.5 });
    expect(lookForItem("television", [predict(on, { type: "ambilight", on: false })])?.strip?.on).toBe(false);
  });
});

describe("shared tile order", () => {
  it("moves a device before / after its target, keeping the others' order", () => {
    const o = ["a", "b", "c", "d", "e"];
    expect(moveInOrder(o, "a", "c")).toEqual(["b", "c", "a", "d", "e"]);
    expect(moveInOrder(o, "e", "b")).toEqual(["a", "e", "b", "c", "d"]);
    // Room filter showing only b, d: dragging d onto b moves it right before b in the global order.
    expect(moveInOrder(o, "d", "b")).toEqual(["a", "d", "b", "c", "e"]);
    expect(moveInOrder(o, "x", "b")).toEqual(o);
  });
  it("sorts by order, unlisted devices after in their relative order", () => {
    const list = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(sortByOrder(list, ["c", "a"]).map((d) => d.id)).toEqual(["c", "a", "b", "d"]);
  });
});
