import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { theme } from "@appart3d/catalog";
import { pointInPolygon, polygonArea, type Room, type Vec2 } from "@appart3d/scene";
import { useStore } from "../state/store";
import { cameraBus, heldKeys, viewState } from "../state/view";
import { NIGHT_SKY } from "../state/night";
import { centroid, pointSegment } from "../lib/geom2d";
import { boundsCenter, boundsDiag, boundsOf, clampToBounds, groundAxes, heldPan, type ControlsLike } from "./rigCommon";

export const EYE_HEIGHT = 1.6;

/** Perspective camera for photo mode: free orbit around the apartment, or standing at eye height. */
export function PhotoRig() {
  const view = useStore((s) => s.photoView);
  return view === "eye" ? <EyeRig key="eye" /> : <OrbitPhotoRig key="orbit" />;
}

function usePerspective(fov: number) {
  const size = useThree((s) => s.size);
  const set = useThree((s) => s.set);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useMemo(() => new THREE.PerspectiveCamera(fov, 1, 0.05, 300), []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, fov, invalidate]);
  useLayoutEffect(() => {
    const prev = get().camera;
    set({ camera });
    return () => set({ camera: prev });
  }, [camera, get, set]);
  return camera;
}

function OrbitPhotoRig() {
  const fov = useStore((s) => s.photoFov);
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  const bounds = useMemo(() => boundsOf(walls, rooms), [walls, rooms]);
  const camera = usePerspective(fov);
  const controlsRef = useRef<ControlsLike | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const diag = boundsDiag(bounds);

  useLayoutEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const target = new THREE.Vector3(viewState.target[0], 0.6, viewState.target[1]);
    const dist = Math.max(4, diag * 1.25);
    camera.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(dist, 1.0, viewState.azimuth));
    c.target.copy(target);
    camera.lookAt(target);
    c.update();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    const fix = clampToBounds(c.target, bounds, 1);
    if (fix.lengthSq() > 0) {
      c.target.add(fix);
      camera.position.add(fix);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef as never}
      camera={camera}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      screenSpacePanning={false}
      minDistance={1.5}
      maxDistance={Math.max(8, diag * 2.2)}
      minPolarAngle={0.1}
      maxPolarAngle={1.48}
    />
  );
}

function pickRoom(rooms: Room[], selectedId: string | null): Room | undefined {
  return (
    rooms.find((r) => r.id === selectedId) ??
    rooms.find((r) => pointInPolygon(viewState.target, r.floor)) ??
    [...rooms].sort((a, b) => Math.abs(polygonArea(b.floor)) - Math.abs(polygonArea(a.floor)))[0]
  );
}

/** Distance from a point to the room outline. */
function edgeDistance(pt: Vec2, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, pointSegment(pt, poly[i]!, poly[(i + 1) % poly.length]!).dist);
  return d;
}

/**
 * Where to stand: start inside the room (centroid, or the vertex average / a sample point for odd
 * shapes) and step back against the view direction as long as we stay inside, ≥ 45 cm from any wall.
 */
function eyeStart(room: Room, fx: number, fz: number): THREE.Vector3 {
  const MARGIN = 0.45;
  const ok = (p: Vec2) => pointInPolygon(p, room.floor) && edgeDistance(p, room.floor) >= MARGIN;
  let start: Vec2 = centroid(room.floor);
  if (!ok(start)) {
    // Concave room whose centroid falls outside / too close to a wall: best sampled interior point.
    const xs = room.floor.map((p) => p[0]);
    const zs = room.floor.map((p) => p[1]);
    let best = -1;
    for (let i = 1; i < 12; i++)
      for (let j = 1; j < 12; j++) {
        const p: Vec2 = [Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 12, Math.min(...zs) + ((Math.max(...zs) - Math.min(...zs)) * j) / 12];
        if (!pointInPolygon(p, room.floor)) continue;
        const d = edgeDistance(p, room.floor);
        if (d > best) [best, start] = [d, p];
      }
  }
  let pos = start;
  for (let k = 0.1; k < 20; k += 0.1) {
    const p: Vec2 = [start[0] - fx * k, start[1] - fz * k];
    if (!ok(p)) break;
    pos = p;
  }
  return new THREE.Vector3(pos[0], EYE_HEIGHT, pos[1]);
}

function EyeRig() {
  const fov = useStore((s) => s.photoFov);
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  const bounds = useMemo(() => boundsOf(walls, rooms), [walls, rooms]);
  const camera = usePerspective(fov);
  const controlsRef = useRef<ControlsLike | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const room = pickRoom(rooms, useStore.getState().selectedRoomId);
    // Forward = where the iso camera was looking (horizontally).
    const f = new THREE.Vector3(-Math.sin(viewState.azimuth), 0, -Math.cos(viewState.azimuth));
    let pos: THREE.Vector3;
    if (room) {
      pos = eyeStart(room, f.x, f.z);
    } else {
      pos = boundsCenter(bounds).setY(EYE_HEIGHT);
    }
    camera.position.copy(pos);
    c.target.copy(pos).addScaledVector(f, 0.05).setY(EYE_HEIGHT - 0.008);
    camera.lookAt(c.target);
    c.update();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => cameraBus.on((cmd) => cmd.type === "wake" && invalidate()), [invalidate]);

  useFrame((_, dtRaw) => {
    const c = controlsRef.current;
    if (!c) return;
    const [px, py] = heldPan(heldKeys);
    if (!px && !py) return;
    const dt = Math.min(dtRaw, 0.1);
    const { forward, right } = groundAxes(camera);
    const delta = right.multiplyScalar(px).add(forward.multiplyScalar(py)).normalize().multiplyScalar(1.6 * dt);
    camera.position.add(delta);
    c.target.add(delta);
    const fix = clampToBounds(camera.position, bounds, -0.15);
    camera.position.add(fix);
    c.target.add(fix);
    invalidate();
  });

  return (
    <OrbitControls
      ref={controlsRef as never}
      camera={camera}
      makeDefault
      enableDamping
      dampingFactor={0.15}
      enableZoom={false}
      enablePan={false}
      rotateSpeed={-0.35}
      minPolarAngle={0.5}
      maxPolarAngle={2.5}
    />
  );
}

/** Draws the night sky, then the (transparent) WebGL frame on top. Must run right after gl.render. */
function nightComposite(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (!ctx) return src;
  const { width: w, height: h } = c;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, NIGHT_SKY.top);
  g.addColorStop(0.6, NIGHT_SKY.mid);
  g.addColorStop(1, NIGHT_SKY.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 1.15, 0, w / 2, h * 1.15, Math.max(w, h) * 0.75);
  glow.addColorStop(0, NIGHT_SKY.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // Deterministic sparse stars in the upper part.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const unit = Math.max(1, w / 1440);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * w;
    const y = Math.pow(rnd(), 1.4) * h * 0.85;
    ctx.globalAlpha = 0.25 + rnd() * 0.6;
    ctx.fillStyle = "#fffbe8";
    ctx.beginPath();
    ctx.arc(x, y, (0.5 + rnd() * 0.9) * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Listens for "capture" and downloads a 2× PNG of the current frame. */
export function PhotoCapture() {
  const get = useThree((s) => s.get);
  useEffect(
    () =>
      cameraBus.on((cmd) => {
        if (cmd.type !== "capture") return;
        const { gl, scene, camera, invalidate } = get();
        const prevRatio = gl.getPixelRatio();
        const canvas = gl.domElement;
        const cssW = canvas.clientWidth || 1;
        const cssH = canvas.clientHeight || 1;
        const ratio = Math.min(prevRatio * 2, 4096 / Math.max(cssW, cssH));
        const prevClear = new THREE.Color();
        gl.getClearColor(prevClear);
        const prevAlpha = gl.getClearAlpha();
        try {
          gl.setPixelRatio(ratio);
          const night = useStore.getState().night;
          // Night: transparent render composited over the night sky (gradient + stars).
          if (night) gl.setClearColor(0x000000, 0);
          else gl.setClearColor(theme.background, 1);
          gl.render(scene, camera);
          // Capture synchronously after rendering: no need for preserveDrawingBuffer.
          const out = night ? nightComposite(canvas) : canvas;
          out.toBlob((blob) => {
            if (!blob) {
              useStore.getState().toast("Impossible de générer la photo.", "error");
              return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
            a.href = url;
            a.download = `appart3d-${stamp}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            useStore.getState().toast("Photo enregistrée.");
          }, "image/png");
        } finally {
          gl.setClearColor(prevClear, prevAlpha);
          gl.setPixelRatio(prevRatio);
          invalidate();
        }
      }),
    [get],
  );
  return null;
}
