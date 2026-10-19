import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../state/store";
import { prefersReducedMotion, slideshowBus, slideshowFx, useSlides } from "../state/slideshow";
import { buildShots, captionReveal, FADE_IN, FADE_OUT, isoAzimuth, samplePathCam, shotVeil, type Shot } from "../lib/slideshow";
import { boundsDiag, boundsOf } from "./rigCommon";

const RADIUS = 60;
const sphTmp = new THREE.Vector3();

/**
 * Cinematic auto-play camera ("Mode diaporama"): orthographic dollhouse orbits and perspective
 * eye-level / fly-over paths, each shot faded in and out through a veil. Reads the scene, never
 * writes it. The iso view of the editor is restored by IsoRig when this unmounts.
 */
export function SlideshowRig() {
  const name = useStore((s) => s.scene.name);
  const items = useStore((s) => s.scene.items);
  const rooms = useStore((s) => s.scene.rooms);
  const walls = useStore((s) => s.scene.walls);
  const size = useThree((s) => s.size);
  const set = useThree((s) => s.set);
  const get = useThree((s) => s.get);

  const reduced = useMemo(prefersReducedMotion, []);
  const shots = useMemo(() => buildShots({ name, items, rooms, walls }, { reducedMotion: reduced }), [name, items, rooms, walls, reduced]);
  const bounds = useMemo(() => boundsOf(walls, rooms), [walls, rooms]);

  const ortho = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, RADIUS * 4), []);
  const persp = useMemo(() => new THREE.PerspectiveCamera(55, 1, 0.05, 300), []);

  useLayoutEffect(() => {
    ortho.left = -size.width / 2;
    ortho.right = size.width / 2;
    ortho.top = size.height / 2;
    ortho.bottom = -size.height / 2;
    ortho.updateProjectionMatrix();
    persp.aspect = size.width / Math.max(1, size.height);
    persp.updateProjectionMatrix();
  }, [ortho, persp, size.width, size.height]);

  /** Zoom (px per meter) that fits the whole apartment for a given polar angle. */
  const fitZoom = (polar: number) => {
    const diag = boundsDiag(bounds) + 1.2;
    const zw = size.width / diag;
    const zh = (size.height - 40) / (diag * Math.cos(polar) + 2.6 * Math.sin(polar));
    return Math.max(4, Math.min(zw, zh) * 0.8);
  };

  const clock = useRef({ index: Math.min(slideshowFx.startShot, shots.length - 1), t: slideshowFx.startTime, toggled: false, restoreNight: null as boolean | null, selfToggle: false });
  const published = useRef(-1);

  // Own the default camera while playing.
  useLayoutEffect(() => {
    const prev = get().camera;
    slideshowFx.startShot = 0;
    slideshowFx.startTime = 0;
    return () => set({ camera: prev });
  }, [get, set]);

  // The user flipped day/night by hand: keep their choice when the loop restarts.
  useEffect(
    () =>
      useStore.subscribe((s, p) => {
        if (s.night !== p.night && !clock.current.selfToggle) clock.current.restoreNight = null;
      }),
    [],
  );

  useEffect(
    () =>
      slideshowBus.on((cmd) => {
        const c = clock.current;
        const shot = shots[c.index];
        if (!shot) return;
        if (cmd === "next") {
          if (useStore.getState().slidePaused) advance(FADE_IN * 0.6);
          else if (c.t < shot.duration - FADE_OUT) c.t = shot.duration - FADE_OUT * 0.7;
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shots],
  );

  const setNight = (night: boolean) => {
    const c = clock.current;
    c.selfToggle = true;
    useStore.getState().setNight(night, false);
    c.selfToggle = false;
  };

  const advance = (t0 = 0) => {
    const c = clock.current;
    c.index = (c.index + 1) % shots.length;
    c.t = t0;
    c.toggled = false;
    if (c.index === 0 && c.restoreNight !== null) {
      setNight(c.restoreNight);
      c.restoreNight = null;
    }
  };

  const publish = (shot: Shot, index: number) => {
    published.current = index;
    const night = useStore.getState().night;
    const caption = shot.kind === "dusk" ? { ...shot.caption, title: night ? "Au petit matin" : "À la nuit tombée" } : shot.caption;
    useSlides.getState().setShot(index, shots.length, shot.duration, caption);
    useStore.getState().setSlideCam(shot.camera.cam);
  };

  useFrame((state, dtRaw) => {
    const c = clock.current;
    if (c.index >= shots.length) c.index = 0;
    const dt = Math.min(dtRaw, 0.1);
    if (!useStore.getState().slidePaused) c.t += dt;
    let shot = shots[c.index]!;
    if (c.t >= shot.duration) {
      advance();
      shot = shots[c.index]!;
    }
    if (published.current !== c.index || useSlides.getState().count !== shots.length) publish(shot, c.index);

    // Dusk / dawn: flip day ↔ night once, early in the shot (restored when the loop restarts).
    if (shot.toggleNightAt !== undefined && !c.toggled && c.t >= shot.toggleNightAt) {
      c.toggled = true;
      const night = useStore.getState().night;
      c.restoreNight = night;
      setNight(!night);
    }

    const cam = shot.camera;
    if (cam.cam === "iso") {
      if (state.camera !== ortho) set({ camera: ortho });
      const az = isoAzimuth(cam, c.t, shot.duration);
      ortho.position.set(cam.center[0], cam.center[1], cam.center[2]).add(sphTmp.setFromSphericalCoords(RADIUS, cam.polar, az));
      ortho.zoom = fitZoom(cam.polar) * cam.zoomScale * slideshowFx.zoomMul;
      ortho.updateProjectionMatrix();
      ortho.lookAt(cam.center[0], cam.center[1], cam.center[2]);
      const h = slideshowFx.handoff;
      h.target = [cam.center[0], 0, cam.center[2]];
      h.az = az;
      h.polar = cam.polar;
      h.zoom = ortho.zoom;
      h.valid = true;
    } else {
      if (state.camera !== persp) set({ camera: persp });
      if (persp.fov !== cam.fov) {
        persp.fov = cam.fov;
        persp.updateProjectionMatrix();
      }
      const { position, target } = samplePathCam(cam, c.t, shot.duration);
      persp.position.set(...position);
      persp.lookAt(target[0], target[1], target[2]);
      // Interior shot: hand over a close dollhouse view of what the camera looks at, seen from its side.
      const h = slideshowFx.handoff;
      h.target = [target[0], 0, target[2]];
      h.az = Math.atan2(position[0] - target[0], position[2] - target[2]);
      h.polar = 0.96;
      h.zoom = fitZoom(0.96) * 1.8;
      h.valid = true;
    }

    if (slideshowFx.veil) slideshowFx.veil.style.opacity = String(shotVeil(c.t, shot.duration));
    if (slideshowFx.caption) {
      const k = captionReveal(c.t, shot.duration);
      slideshowFx.caption.style.opacity = String(k);
      slideshowFx.caption.style.transform = reduced ? "" : `translateY(${((1 - k) * 12).toFixed(2)}px)`;
    }
    if (slideshowFx.progress) slideshowFx.progress.style.transform = `scaleX(${Math.min(1, c.t / shot.duration)})`;
    state.invalidate();
  });

  return null;
}
