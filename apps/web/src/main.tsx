import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { parseSceneJson } from "./lib/io";
import { useStore } from "./state/store";
import { shouldShowWelcome } from "./ui/Overlays";
import { slideshowFx } from "./state/slideshow";
import { startHome, useHome } from "./state/home";
import { postToNative, startEmbed, useEmbed } from "./state/embed";
import { parseDaylight } from "./state/night";
import "./styles.css";

const params = new URLSearchParams(location.search);

// `?view=3d`: embedded 3D view for the native apps (canvas only, transparent; see state/embed.ts).
const embed = startEmbed(params);

// `?scene=<url>` loads a scene or an iOS scan envelope at startup (e.g. a local file via Vite's /@fs/ in dev).
const sceneUrl = params.get("scene");
const sceneLoaded: Promise<void> = sceneUrl
  ? fetch(sceneUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Chargement impossible (${r.status}).`))))
      .then((text) => {
        const { scene, warnings } = parseSceneJson(text, sceneUrl.split("/").pop());
        const s = useStore.getState();
        s.loadScene(scene);
        for (const w of warnings.slice(0, 4)) s.toast(w, "warn");
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Import impossible.";
        useStore.getState().toast(message, "error");
        if (embed) postToNative({ type: "error", message });
      })
  : Promise.resolve();

// Public URL options (used by the deployed site, e.g. as a landing loop):
//   ?night=1 / ?night=0 — start in the night (or day) version, without changing the saved preference
//   ?demo=1             — start the slideshow ("Mode diaporama") once the scene is ready
//   ?daylight=auto|day|night — follow the sun reported by the home bridge (default) or force day / night
const nightParam = params.get("night");
const daylightParam = parseDaylight(params.get("daylight"));
if (nightParam === "1" || nightParam === "0") {
  useStore.getState().setNight(nightParam === "1", false);
  useStore.getState().setDaylight(nightParam === "1" ? "night" : "day", false);
} else if (daylightParam) useStore.getState().setDaylight(daylightParam, false);
else if (embed) useStore.getState().setDaylight("auto", false);

// The sun from the home bridge drives the day / night blend (dev: &sunElevation=<deg> forces it for screenshots).
const forcedSun = import.meta.env.DEV && params.has("sunElevation") ? Number(params.get("sunElevation")) : NaN;
if (Number.isFinite(forcedSun)) useStore.getState().setSunElevation(forcedSun);
else
  useHome.subscribe((s, prev) => {
    if (s.sun?.elevation !== prev.sun?.elevation) useStore.getState().setSunElevation(s.sun?.elevation ?? null);
  });
const demo = !embed && params.get("demo") === "1";

// Maison mode: home bridge (same origin / ?bridge=…) or the mock (?home=mock); ?widget=1 popover layout.
startHome({ params, embed });
if (embed) void sceneLoaded.then(() => useEmbed.setState({ sceneLoaded: true }));
const homeLaunch = embed || params.has("home") || params.get("widget") === "1";

// First visit: short welcome sheet (not when a scene is given in the URL, nor for the demo loop / Maison).
if (!sceneUrl && !demo && !homeLaunch && shouldShowWelcome() && !(import.meta.env.DEV && params.get("welcome") === "0")) useStore.getState().setOverlay("welcome");

if (demo) {
  void sceneLoaded.then(() => {
    if (import.meta.env.DEV) {
      // Dev hooks for screenshots: &demoShot=<index>&demoT=<seconds into the shot>
      slideshowFx.startShot = Number(params.get("demoShot") ?? 0) || 0;
      slideshowFx.startTime = Number(params.get("demoT") ?? 0) || 0;
      // Clean captures (Open Graph image): &demoZoom=1.5&demoChrome=0
      slideshowFx.zoomMul = Number(params.get("demoZoom") ?? 1) || 1;
      slideshowFx.hideChrome = params.get("demoChrome") === "0";
    }
    useStore.getState().startSlideshow();
  });
}

const PUBLIC_PARAMS = new Set(["scene", "night", "demo", "demoShot", "demoT", "home", "widget", "bridge", "homeFail", "view", "autoRotate", "daylight", "frame", "flyToChanges", "sunElevation"]);
if (import.meta.env.DEV && [...params.keys()].some((k) => !PUBLIC_PARAMS.has(k))) {
  void sceneLoaded.then(async () => {
    const { applyDevHooks } = await import("./ui/devHooks");
    setTimeout(() => applyDevHooks(params), 300);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
