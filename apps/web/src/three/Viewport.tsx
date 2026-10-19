import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../state/store";
import { useHome } from "../state/home";
import { registerPickSource } from "../state/pick";
import { Floors } from "./Floors";
import { Walls } from "./Walls";
import { Items } from "./Items";
import { Ceilings } from "./Ceilings";
import { Lights } from "./Lights";
import { IsoRig } from "./IsoRig";
import { PhotoCapture, PhotoRig } from "./PhotoRig";
import { SlideshowRig } from "./SlideshowRig";
import { embedRendered, useEmbed } from "../state/embed";
import { LauncherMirror } from "./LauncherMirror";
import { FpsProbe } from "./FpsProbe";

const URL_PARAMS = new URLSearchParams(location.search);
const STATS = URL_PARAMS.get("stats") === "1";
/** Tuning knobs for weak GPUs (TV): `?maxDpr=1.5` caps the pixel ratio, `?aa=0` drops antialiasing. */
const MAX_DPR = Math.min(2, Math.max(0.75, Number(URL_PARAMS.get("maxDpr")) || 2));
const AA = URL_PARAMS.get("aa") !== "0";
import { isLauncherApp } from "../lib/launcherLook";

export function Viewport() {
  const photo = useStore((s) => s.mode === "photo");
  const slideshow = useStore((s) => s.slideshow);
  const embed = useEmbed((s) => s.active);
  const lite = useEmbed((s) => s.lite);
  // The real TV shows the Maison home screen: its 3D twin mirrors it.
  const mirror = useHome((s) => s.devices.some((d) => d.kind === "tv" && d.state.on === true && isLauncherApp(d.state.media?.app)));
  return (
    <Canvas
      className="viewport"
      shadows={!lite}
      flat
      frameloop="demand"
      dpr={[Math.min(1, MAX_DPR), MAX_DPR]}
      gl={{ antialias: AA, alpha: true }}
      onCreated={({ gl, get }) => {
        if (import.meta.env.DEV) (window as unknown as { __appart3d: unknown }).__appart3d = { get, store: useStore, home: useHome };
        // Lets DOM interactions (catalog drag & drop) project the pointer onto the floor.
        registerPickSource(() => {
          const st = get();
          return { camera: st.camera, domElement: st.gl.domElement };
        });
        gl.localClippingEnabled = true;
        gl.setClearColor(0x000000, 0);
      }}
      onPointerMissed={(e) => {
        if (e.type !== "click") return;
        const s = useStore.getState();
        if (s.mode === "arrange" && !s.dragging) s.selectItem(null);
        if (s.mode === "rooms") s.selectRoom(null);
      }}
    >
      {slideshow ? <SlideshowRig /> : photo ? <PhotoRig /> : <IsoRig />}
      <PhotoCapture />
      <Lights />
      <Floors />
      <Walls />
      <Items />
      <Ceilings />
      {embed && <EmbedReady />}
      {mirror && <LauncherMirror />}
      {STATS && <FpsProbe />}
    </Canvas>
  );
}

/**
 * Embedded view: tells the native app once the scene has been drawn for a few frames (models load
 * asynchronously; waiting a little avoids showing an empty box when the app fades the web view in).
 */
function EmbedReady() {
  const sceneId = useStore((s) => s.scene.id);
  const loaded = useEmbed((s) => s.sceneLoaded);
  const invalidate = useThree((s) => s.invalidate);
  const frames = useRef(0);
  const since = useRef(performance.now());
  useEffect(() => {
    frames.current = 0;
    since.current = performance.now();
    // frameloop="demand": keep frames coming until "ready" is sent.
    const t = setInterval(invalidate, 100);
    const stop = setTimeout(() => clearInterval(t), 5000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [sceneId, loaded, invalidate]);
  useFrame(() => {
    if (!loaded) return;
    frames.current++;
    if (frames.current >= 3 && performance.now() - since.current > 400) embedRendered();
  });
  return null;
}
