import { create } from "zustand";
import type { EmbedCommand, EmbedEvent, FrameTarget } from "@appart3d/home";
import { deviceIdsForItem, FLIGHT_BURST_MS, flightTarget, isEmbedView, itemFocusSize, itemForDevice, parseEmbedCommand, parseFrame, parseOrbit, parseTilt, switchedItems, type Orbit } from "../lib/embed";
import { isOn } from "../lib/home";
import { useStore } from "./store";
import { useHome } from "./home";
import { cameraBus } from "./view";

/**
 * Embedded 3D view (`?view=3d`): only the 3D canvas, transparent, for the native apps' web views.
 *   Native → web: window.appart3dEmbed.post(EmbedCommand)
 *   Web → native: window.webkit.messageHandlers.appart3d.postMessage(EmbedEvent)
 *                 (Android: window.appart3dAndroid.postMessage(JSON string))
 * Taps on items are reported to the native app instead of toggling devices.
 */
export interface EmbedState {
  active: boolean;
  autoRotate: boolean;
  /** focusItem in effect (camera holds still until overview). */
  focused: boolean;
  /** highlightDevice: halo on the item linked to this device. */
  highlightDeviceId: string | null;
  /** Item briefly highlighted after a tap. */
  flashItemId: string | null;
  /** The `?scene=` file is loaded (or failed): "ready" may be sent once it is drawn. */
  sceneLoaded: boolean;
  /** Default framing (start, idle sway, after a focus or a flight): living room or whole apartment. */
  frame: FrameTarget;
  /** Fly toward devices that switch on / off (`?flyToChanges=0` disables). */
  flyToChanges: boolean;
  /** `?orbit=full`: continuous 360° turn instead of the idle sway. */
  orbit: Orbit;
  /** `?tilt=<deg>`: polar angle of the default framing (radians), null = default. */
  tilt: number | null;
  /** `?lite=1`: cheaper rendering for weak GPUs (TV launcher): no shadows (full resolution kept, 1x looks pixelated on a TV). */
  lite: boolean;
}

export const useEmbed = create<EmbedState>()(() => ({
  active: false,
  autoRotate: true,
  focused: false,
  highlightDeviceId: null,
  flashItemId: null,
  sceneLoaded: false,
  frame: "living",
  flyToChanges: true,
  lite: false,
  orbit: "sway",
  tilt: null,
}));

interface WebkitWindow {
  webkit?: { messageHandlers?: { appart3d?: { postMessage(msg: unknown): void } } };
  appart3dEmbed?: { post(cmd: unknown): boolean };
  appart3dAndroid?: { postMessage(json: string): void };
}

/** Sends an event to the native app (no-op outside a WKWebView / Android WebView with the `appart3d` bridge). */
export function postToNative(ev: EmbedEvent): void {
  try {
    const w = window as unknown as WebkitWindow;
    w.webkit?.messageHandlers?.appart3d?.postMessage(ev);
    w.appart3dAndroid?.postMessage(JSON.stringify(ev));
  } catch {
    /* native side gone */
  }
}

let ready = false;
let queue: EmbedCommand[] = [];
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function run(cmd: EmbedCommand): void {
  switch (cmd.type) {
    case "focusItem": {
      const item = cmd.itemId ? useStore.getState().scene.items.find((i) => i.id === cmd.itemId) : undefined;
      if (!item) {
        useEmbed.setState({ focused: false });
        cameraBus.emit({ type: "home" });
        return;
      }
      useEmbed.setState({ focused: true });
      cameraBus.emit({ type: "focus", center: [item.position[0], item.position[2]], size: itemFocusSize(item.dimensions) });
      return;
    }
    case "overview":
      // The whole apartment, and the idle sway goes on around it (until a `frame` command).
      useEmbed.setState({ focused: false, frame: "all" });
      cameraBus.emit({ type: "home" });
      return;
    case "frame":
      useEmbed.setState({ focused: false, frame: cmd.target });
      cameraBus.emit({ type: "home" });
      return;
    case "highlightDevice":
      useEmbed.setState({ highlightDeviceId: cmd.deviceId });
      break;
    case "spotlightDevice": {
      const itemId = itemForDevice(useHome.getState().devices, cmd.deviceId);
      const item = itemId ? useStore.getState().scene.items.find((i) => i.id === itemId) : undefined;
      useEmbed.setState({ highlightDeviceId: item ? cmd.deviceId : null });
      if (item) {
        // Held until cleared; `focused` stops the orbit and the flights of watchSwitches meanwhile.
        useEmbed.setState({ focused: true });
        cameraBus.emit({ type: "fly", ...flightTarget(item), hold: Infinity });
      } else if (useEmbed.getState().focused) {
        useEmbed.setState({ focused: false });
        cameraBus.emit({ type: "home" });
      }
      return;
    }
    case "setNight":
      useStore.getState().setDaylight(cmd.night ? "night" : "day", false);
      break;
    case "setDaylight":
      useStore.getState().setDaylight(cmd.mode, false);
      break;
    case "autoRotate":
      useEmbed.setState({ autoRotate: cmd.enabled });
      break;
  }
  cameraBus.emit({ type: "wake" });
}

/** Tap on a 3D item in the embedded view: tell the native app, flash the item. */
export function embedItemTapped(itemId: string): void {
  postToNative({ type: "itemTapped", itemId, deviceIds: deviceIdsForItem(useHome.getState().devices, itemId) });
  clearTimeout(flashTimer);
  useEmbed.setState({ flashItemId: itemId });
  flashTimer = setTimeout(() => {
    if (useEmbed.getState().flashItemId === itemId) useEmbed.setState({ flashItemId: null });
  }, 900);
}

/** First frames of the scene are on screen: replay early commands, tell the native app. */
export function embedRendered(): void {
  if (ready) return;
  ready = true;
  const early = queue;
  queue = [];
  for (const c of early) run(c);
  postToNative({ type: "ready" });
}

/** Called once at startup (main.tsx). Returns true when the page is the embedded view. */
export function startEmbed(params: URLSearchParams): boolean {
  if (!isEmbedView(params)) return false;
  useEmbed.setState({
    active: true,
    autoRotate: params.get("autoRotate") !== "0",
    frame: parseFrame(params.get("frame")) ?? "living",
    flyToChanges: params.get("flyToChanges") !== "0",
    lite: params.get("lite") === "1",
    orbit: parseOrbit(params.get("orbit")),
    tilt: parseTilt(params.get("tilt")),
  });
  document.documentElement.classList.add("is-embed");
  (window as unknown as WebkitWindow).appart3dEmbed = {
    post(raw: unknown): boolean {
      const cmd = parseEmbedCommand(raw);
      if (!cmd) return false;
      if (ready) run(cmd);
      else queue.push(cmd);
      return true;
    },
  };
  watchSwitches();
  // Bridge problems are surfaced natively (the embedded view shows no UI of its own).
  useHome.subscribe((s, prev) => {
    if (s.status === prev.status) return;
    if (s.status === "unauthorized") postToNative({ type: "error", message: "Accès refusé : appareil non appairé." });
    else if (s.status === "offline") postToNative({ type: "error", message: "Pont maison injoignable." });
  });
  return true;
}

/**
 * Devices switching on / off (from any source: the app, the Action button, widgets, the Hue app, a
 * scene…) make the camera fly to their 3D item, hold while the light fades, and glide back. Several
 * switches within FLIGHT_BURST_MS: one pull-back to the whole apartment instead. Not while a focus
 * (open device sheet) holds the camera, nor with Reduce Motion.
 */
function watchSwitches(): void {
  let known = new Map<string, boolean>();
  let burst: { at: number; items: Set<string> } | null = null;
  const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  useHome.subscribe((s, prev) => {
    if (s.devices === prev.devices) return;
    const { next, changed } = switchedItems(known, s.devices, isOn);
    known = next;
    const e = useEmbed.getState();
    if (!changed.length || !e.flyToChanges || e.focused || reduced?.matches || !ready) return;
    const now = performance.now();
    if (burst && now - burst.at <= FLIGHT_BURST_MS) {
      for (const id of changed) burst.items.add(id);
    } else burst = { at: now, items: new Set(changed) };
    if (burst.items.size > 1) {
      cameraBus.emit({ type: "flyAll" });
      return;
    }
    const item = useStore.getState().scene.items.find((i) => i.id === changed[0]);
    if (!item) return;
    cameraBus.emit({ type: "fly", ...flightTarget(item) });
  });
}
