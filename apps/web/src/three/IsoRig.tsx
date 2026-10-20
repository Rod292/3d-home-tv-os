import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useStore } from "../state/store";
import { useHome } from "../state/home";
import { useEmbed } from "../state/embed";
import { CUT_HEIGHT, computeWallFacings, isWallCut } from "../lib/cutaway";
import { AUTO_ROTATE_SPEED, clearAzimuth, embedFitZoom, FLIGHT_HOLD_S, FLIGHT_IN_S, FLIGHT_OUT_S, FLIGHT_POLAR, livingFraming, shouldAutoRotate, swayOffset } from "../lib/embed";
import { cameraBus, heldKeys, viewState } from "../state/view";
import { normalizeAngle } from "../lib/geom2d";
import { boundsCenter, boundsDiag, boundsOf, clampToBounds, easeInOutCubic, groundAxes, heldPan, type ControlsLike } from "./rigCommon";

interface View {
  target: THREE.Vector3;
  az: number;
  polar: number;
  zoom: number;
}

interface Anim {
  from: View;
  to: View;
  t: number;
  dur: number;
}

/** Embedded view: flight toward a device that switched (or pull-back to the whole apartment). */
interface Flight {
  stage: "in" | "hold" | "out";
  hold: number;
  all: boolean;
}

export const DEFAULT_AZ = Math.PI / 4;
export const DEFAULT_POLAR = 0.96; // ≈ 55° from vertical: classic isometric feel
const RADIUS = 60;
const PAN_MARGIN = 1.5;

/** Survives photo-mode round trips so the user finds their view again. */
let savedView: View | null = null;

/** Next time the iso camera mounts, start from this view (e.g. where the slideshow was looking). */
export function handOffView(target: [number, number, number], az: number, polar: number, zoom: number): void {
  savedView = { target: new THREE.Vector3(...target), az, polar, zoom };
}

const sph = new THREE.Spherical();
const tmp = new THREE.Vector3();

/** Orthographic "dollhouse" camera + orbit controls, keyboard panning, animated rotate/focus. */
export function IsoRig() {
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  const sceneId = useStore((s) => s.scene.id);
  const bounds = useMemo(() => boundsOf(walls, rooms), [walls, rooms]);
  const size = useThree((s) => s.size);
  const set = useThree((s) => s.set);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  // Compact layout (widget / phone Maison): no top bar or hint bar over the 3D.
  const compact = useHome((s) => s.compact);
  // Embedded 3D view (native apps): whole canvas, auto-framed, gentle idle rotation.
  const embed = useEmbed((s) => s.active);
  // Desktop Maison mode: the control panel covers the right side; center the apartment in what is left.
  const side = useStore((s) => s.mode === "home") && !compact && !embed && size.width > 900 ? 400 : 0;

  const camera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, RADIUS * 4), []);
  const controlsRef = useRef<ControlsLike | null>(null);
  const anim = useRef<Anim | null>(null);

  const fitZoom = useMemo(() => {
    if (embed) return embedFitZoom(size.width, size.height, boundsDiag(bounds), DEFAULT_POLAR);
    const diag = boundsDiag(bounds) + 1.2;
    // Projected footprint ≈ diag wide, diag·cos(polar) + wall height·sin(polar) tall.
    const zw = (size.width - (compact ? 8 : 0) - side) / diag;
    // Leave room for the top bar and hint bar.
    const zh = (size.height - (compact ? 10 : 130)) / (diag * Math.cos(DEFAULT_POLAR) + 2.6 * Math.sin(DEFAULT_POLAR));
    return Math.max(4, Math.min(zw, zh) * (compact ? 0.9 : 0.78));
  }, [bounds, size.width, size.height, compact, side, embed]);

  // Frustum follows the canvas size (pixels; zoom = pixels per meter).
  useLayoutEffect(() => {
    camera.left = -size.width / 2;
    camera.right = size.width / 2;
    camera.top = size.height / 2;
    camera.bottom = -size.height / 2;
    // Off-center view (pixels): the apartment's center moves left by side / 2.
    if (side) camera.setViewOffset(size.width, size.height, side / 2, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, side, invalidate]);

  const overviewView = (): View => ({ target: boundsCenter(bounds), az: DEFAULT_AZ, polar: DEFAULT_POLAR, zoom: fitZoom });

  // Embedded view: default framing = the living room seen from the sofa side, facing the TV
  // (`frame=all` / `overview`: the whole apartment). Only the device → item links matter here.
  const frame = useEmbed((s) => s.frame);
  const orbit = useEmbed((s) => s.orbit);
  const tilt = useEmbed((s) => s.tilt);
  const items = useStore((s) => s.scene.items);
  const linkedKey = useHome((s) => s.devices.map((d) => d.itemId ?? "").join("|"));
  const living = useMemo(
    () =>
      embed
        ? livingFraming(items, rooms, linkedKey.split("|").map((itemId) => ({ itemId: itemId || undefined })), size.width, size.height, DEFAULT_AZ, {
            orbit,
            ...(tilt != null ? { polar: tilt } : {}),
          })
        : null,
    [embed, items, rooms, linkedKey, size.width, size.height, orbit, tilt],
  );
  const homeView = (): View => {
    if (embed && frame === "living" && living) return { target: new THREE.Vector3(...living.target), az: living.az, polar: living.polar, zoom: living.zoom };
    return overviewView();
  };
  const startView = (): View => (embed ? homeView() : overviewView());
  /** Idle sway clock (s): advances only while swaying, so the sway resumes where it left off. */
  const swayT = useRef(0);
  const flight = useRef<Flight | null>(null);
  /** Default framing at the current sway angle (or along the full turn, `?orbit=full`). */
  const homePose = (): View => {
    const h = homeView();
    return { ...h, az: h.az + (orbit === "full" ? swayT.current * AUTO_ROTATE_SPEED : swayOffset(swayT.current)) };
  };

  const current = (): View | null => {
    const c = controlsRef.current;
    if (!c) return null;
    sph.setFromVector3(tmp.copy(camera.position).sub(c.target));
    return { target: c.target.clone(), az: sph.theta, polar: sph.phi, zoom: camera.zoom };
  };

  const apply = (v: View) => {
    const c = controlsRef.current;
    if (!c) return;
    camera.position.copy(v.target).add(tmp.setFromSphericalCoords(RADIUS, v.polar, v.az));
    camera.zoom = v.zoom;
    camera.updateProjectionMatrix();
    camera.lookAt(v.target);
    c.target.copy(v.target);
    c.update();
    invalidate();
  };

  const animateTo = (to: Partial<View>, dur = 0.75) => {
    const from = current();
    if (!from) return;
    const target: View = { ...from, ...to };
    target.az = from.az + normalizeAngle(target.az - from.az);
    anim.current = { from, to: target, t: 0, dur };
    invalidate();
  };

  // Become the default camera; restore the previous view (or frame the apartment).
  useLayoutEffect(() => {
    const prev = get().camera;
    set({ camera });
    apply(savedView ?? startView());
    return () => {
      savedView = current();
      set({ camera: prev });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // Window resized: keep the same relative framing.
  const prevFit = useRef(fitZoom);
  useEffect(() => {
    const ratio = fitZoom / prevFit.current;
    prevFit.current = fitZoom;
    if (Math.abs(ratio - 1) < 1e-3) return;
    camera.zoom *= ratio;
    camera.updateProjectionMatrix();
    if (anim.current) {
      anim.current.from.zoom *= ratio;
      anim.current.to.zoom *= ratio;
    }
    invalidate();
  }, [fitZoom, camera, invalidate]);

  // New scene loaded (import / reset): frame it.
  const lastSceneId = useRef(sceneId);
  useEffect(() => {
    if (lastSceneId.current === sceneId) return;
    lastSceneId.current = sceneId;
    anim.current = null;
    flight.current = null;
    apply(startView());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);

  // Entering / leaving the compact layout: frame the whole apartment in the new view.
  const lastCompact = useRef(compact);
  useEffect(() => {
    if (lastCompact.current === compact) return;
    lastCompact.current = compact;
    anim.current = null;
    apply(startView());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  // Commands from the UI / keyboard.
  const zoomLimits = { min: fitZoom * 0.5, max: fitZoom * 7 };
  const handlerRef = useRef<(cmd: Parameters<Parameters<typeof cameraBus.on>[0]>[0]) => void>(() => {});
  handlerRef.current = (cmd) => {
    if (cmd.type === "overview") {
      if (cmd.animate === false) apply(overviewView());
      else animateTo(overviewView());
    } else if (cmd.type === "home") {
      flight.current = null;
      animateTo(homePose(), 1.1);
    } else if (cmd.type === "fly") {
      if (!embed) return;
      const zoom = Math.min(zoomLimits.max, Math.max(zoomLimits.min, Math.min(size.width, size.height) / cmd.size, homeView().zoom * 1.5));
      // Fly in, lower, toward the item, seen from the living area (less furniture in front), turning
      // at most 20° from the current angle (the living framing already faces the room).
      const cur = current();
      const home = homeView().target;
      const dx = home.x - cmd.target[0];
      const dz = home.z - cmd.target[2];
      let az = cur?.az ?? DEFAULT_AZ;
      if (cur && Math.hypot(dx, dz) > 0.8) az = cur.az + Math.max(-0.35, Math.min(0.35, normalizeAngle(Math.atan2(dx, dz) - cur.az)));
      // Never through a wall: the nearest angle from which the item is in plain sight.
      const scene = useStore.getState().scene;
      const facings = computeWallFacings(scene);
      az = clearAzimuth(cmd.target, scene.walls, az, FLIGHT_POLAR, (w, a) => {
        const f = w.id ? facings.get(w.id) : undefined;
        // Same rule as Walls.tsx: walls facing the camera drop to CUT_HEIGHT.
        return f && isWallCut(f, [-Math.sin(a), -Math.cos(a)]) ? Math.min(CUT_HEIGHT, w.height) : w.height;
      });
      animateTo({ target: new THREE.Vector3(...cmd.target), polar: FLIGHT_POLAR, zoom, az }, FLIGHT_IN_S);
      flight.current = { stage: "in", hold: cmd.hold ?? FLIGHT_HOLD_S, all: false };
    } else if (cmd.type === "flyAll") {
      if (!embed) return;
      if (flight.current?.all && flight.current.stage !== "out") {
        flight.current.hold = FLIGHT_HOLD_S;
        return;
      }
      const { az: _az, ...all } = overviewView();
      animateTo(all, FLIGHT_IN_S);
      flight.current = { stage: "in", hold: FLIGHT_HOLD_S, all: true };
    } else if (cmd.type === "focus") {
      flight.current = null;
      // Embedded view: a focus always gets closer than the (already tight) default framing.
      const base = Math.min(size.width, size.height) / (cmd.size * 2.1);
      const zoom = Math.min(zoomLimits.max, Math.max(zoomLimits.min, embed ? Math.max(base, homeView().zoom * 1.35) : base));
      animateTo({ target: new THREE.Vector3(cmd.center[0], 0, cmd.center[1]), zoom });
    } else if (cmd.type === "rotate") {
      const from = anim.current?.to ?? current();
      if (!from) return;
      const step = Math.PI / 4;
      const az = Math.round(from.az / step) * step + cmd.dir * step;
      const cur = current()!;
      anim.current = { from: cur, to: { ...from, az: cur.az + normalizeAngle(az - cur.az) }, t: 0, dur: 0.55 };
      invalidate();
    } else if (cmd.type === "wake") invalidate();
  };
  useEffect(() => cameraBus.on((cmd) => handlerRef.current(cmd)), []);

  // Embedded view: a touch pauses the idle rotation (resumes after a while without interaction).
  const gl = useThree((s) => s.gl);
  const touch = useRef({ interacting: false, last: -Infinity });
  useEffect(() => {
    if (!embed) return;
    const c = controlsRef.current as unknown as THREE.EventDispatcher<{ start: object; end: object }> | null;
    const el = gl.domElement;
    const down = () => {
      touch.current = { interacting: true, last: performance.now() };
      // A touch takes over: cancel any flight / glide (the sway resumes after a pause).
      anim.current = null;
      flight.current = null;
    };
    const up = () => {
      touch.current = { interacting: false, last: performance.now() };
      invalidate();
    };
    c?.addEventListener("start", down);
    c?.addEventListener("end", up);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      c?.removeEventListener("start", down);
      c?.removeEventListener("end", up);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [embed, gl, invalidate]);
  // Resume the render loop when the rotation may start again (frameloop="demand").
  const autoRotate = useEmbed((s) => s.autoRotate);
  const focused = useEmbed((s) => s.focused);
  useEffect(() => {
    if (!embed || !autoRotate || focused) return;
    const t = setInterval(invalidate, 1000);
    return () => clearInterval(t);
  }, [embed, autoRotate, focused, invalidate]);

  useFrame((_, dtRaw) => {
    const c = controlsRef.current;
    if (!c) return;
    const dt = Math.min(dtRaw, 0.1);
    const a = anim.current;
    if (a) {
      a.t += dt;
      const k = easeInOutCubic(Math.min(1, a.t / a.dur));
      apply({
        target: a.from.target.clone().lerp(a.to.target, k),
        az: a.from.az + (a.to.az - a.from.az) * k,
        polar: a.from.polar + (a.to.polar - a.from.polar) * k,
        zoom: a.from.zoom + (a.to.zoom - a.from.zoom) * k,
      });
      if (a.t >= a.dur) {
        anim.current = null;
        const f = flight.current;
        if (f?.stage === "in") f.stage = "hold";
        else if (f?.stage === "out") flight.current = null;
      }
    } else if (flight.current?.stage === "hold") {
      // Hold on the device while its light fades, then glide back to the default framing.
      const f = flight.current;
      f.hold -= dt;
      if (f.hold <= 0) {
        f.stage = "out";
        animateTo(homePose(), FLIGHT_OUT_S);
      } else invalidate();
    } else if (
      embed &&
      shouldAutoRotate({ enabled: autoRotate, focused, interacting: touch.current.interacting, lastInteraction: touch.current.last, now: performance.now() })
    ) {
      // Idle: gentle back-and-forth sway around the default framing (living room, facing the TV);
      // after a touch the camera eases back to it. apply() invalidates, so frames keep coming.
      swayT.current += dt;
      const want = homePose();
      const v = current();
      if (v) {
        const k = 1 - Math.exp(-dt / 1.1);
        apply({
          target: v.target.lerp(want.target, k),
          az: v.az + normalizeAngle(want.az - v.az) * k,
          polar: v.polar + (want.polar - v.polar) * k,
          zoom: v.zoom + (want.zoom - v.zoom) * k,
        });
      }
    }

    const [px, py] = heldPan(heldKeys);
    if (px || py) {
      const { forward, right } = groundAxes(camera);
      const visible = Math.min(size.width, size.height) / camera.zoom; // meters on screen
      const delta = right.multiplyScalar(px).add(forward.multiplyScalar(py)).normalize().multiplyScalar(visible * 0.7 * dt);
      camera.position.add(delta);
      c.target.add(delta);
      invalidate();
    }

    const fix = clampToBounds(c.target, bounds, PAN_MARGIN);
    if (fix.lengthSq() > 0) {
      c.target.add(fix);
      camera.position.add(fix);
    }
    viewState.target = [c.target.x, c.target.z];
    sph.setFromVector3(tmp.copy(camera.position).sub(c.target));
    viewState.azimuth = sph.theta;
  });

  return (
    <OrbitControls
      ref={controlsRef as never}
      camera={camera}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minZoom={zoomLimits.min}
      maxZoom={zoomLimits.max}
      minPolarAngle={0.08}
      maxPolarAngle={1.22}
      zoomSpeed={1.1}
      rotateSpeed={0.7}
    />
  );
}
