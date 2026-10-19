import { useEffect } from "react";
import { useStore } from "./state/store";
import { Viewport } from "./three/Viewport";
import { TopBar } from "./ui/TopBar";
import { LeftPanel } from "./ui/LeftPanel";
import { ItemInspector } from "./ui/Inspector";
import { RoomInspector, RoomList } from "./ui/RoomPanel";
import { HintBar, PhotoBar, Toasts, ViewControls } from "./ui/Chrome";
import { Overlays } from "./ui/Overlays";
import { useShortcuts } from "./ui/useShortcuts";
import { SlideshowUI } from "./ui/Slideshow";
import { HomePanel } from "./ui/HomePanel";
import { useHome } from "./state/home";
import { useMediaQuery } from "./ui/useMediaQuery";
import { useEmbed } from "./state/embed";
import { daylightTarget } from "./state/night";
import { smoothstep } from "./lib/slideshow";

export function App() {
  return useEmbed.getState().active ? <EmbedApp /> : <EditorApp />;
}

/** `?view=3d` (native apps): only the 3D canvas, transparent — no bars, panels, toasts or shortcuts. */
function EmbedApp() {
  const night = useStore((s) => s.night);
  return (
    <div className={`app app-embed mode-home${night ? " is-night" : ""}`}>
      <Viewport />
    </div>
  );
}

function EditorApp() {
  useShortcuts();
  const mode = useStore((s) => s.mode);
  const night = useStore((s) => s.night);
  const slideshow = useStore((s) => s.slideshow);
  const photo = mode === "photo";
  const widget = useHome((s) => s.widget);
  const narrow = useMediaQuery("(max-width: 720px)");
  // Widget (menu bar popover) and phones in Maison mode: 3D on top, control panel below.
  const compact = !slideshow && (widget || (mode === "home" && narrow));
  useEffect(() => useHome.getState().setCompact(compact), [compact]);
  return (
    <div className={`app mode-${mode}${night ? " is-night" : ""}${slideshow ? " is-slideshow" : ""}${compact ? " is-compact" : ""}${widget ? " is-widget" : ""}`}>
      <Sky />
      <Viewport />
      {compact ? (
        <HomePanel />
      ) : slideshow ? (
        <SlideshowUI />
      ) : photo ? (
        <PhotoBar />
      ) : (
        <>
          <TopBar />
          {mode === "arrange" && (
            <>
              <LeftPanel />
              <ItemInspector />
            </>
          )}
          {mode === "rooms" && (
            <>
              <RoomList />
              <RoomInspector />
            </>
          )}
          {mode === "home" && <HomePanel />}
          <ViewControls />
          <HintBar />
        </>
      )}
      <Toasts />
      <Overlays />
    </div>
  );
}

/** Night sky behind the canvas; following the sun it blends continuously, with a golden glow at dusk. */
function Sky() {
  const daylight = useStore((s) => s.daylight);
  const sun = useStore((s) => (s.slideshow ? null : s.sunElevation));
  const night = useStore((s) => s.night);
  if (daylight !== "auto" || sun === null) return <div className="night-sky" aria-hidden />;
  const t = daylightTarget(daylight, sun, night);
  return (
    <>
      <div className="dusk-sky" aria-hidden style={{ opacity: t.dusk * (1 - smoothstep(t.progress) * 0.6) }} />
      <div className="night-sky" aria-hidden style={{ opacity: smoothstep(t.progress) }} />
    </>
  );
}
