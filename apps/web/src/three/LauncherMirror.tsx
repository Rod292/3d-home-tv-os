import { useEffect, useRef } from "react";
import { create } from "zustand";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Device } from "@appart3d/home";
import { launcherPalette, type LauncherPalette } from "../lib/launcherLook";
import { appBrand } from "../lib/tvCard";
import { useHome } from "../state/home";

/**
 * Mise en abyme: while the real TV shows the Maison home screen, the 3D TV shows that screen too —
 * background, lights panel, dock — with the live 3D view itself in the apartment area, so the TV
 * inside contains the TV inside… Drawn in a canvas from the WebGL canvas right after each render
 * (the drawing buffer is only readable then), a few times per second. The feedback is free: each
 * copy shows the previous one.
 */

const W = 768;
const H = 432;
/** Launcher layout in dp (apps/tv-launcher, 960 × 540 dp screen). */
const DP = W / 960;
const SIDE = 48;
const PANEL_W = 290;
const DOCK_AREA = 146;
const TILE_W = 140;
const GAP = 24;
const DOCK_APPS = ["YouTube", "Canal+", "Netflix", "Prime Video", "Twitch", "Deezer", "Disney+"];
/** Compose every Nth frame (~10 per second at 60 fps). */
const EVERY = 6;

/** The mirrored home screen while the mirror runs (null otherwise); the TV screen picks it up. */
export const useLauncherMirror = create<{ texture: THREE.CanvasTexture | null }>()(() => ({ texture: null }));

function createTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function paintBackground(g: CanvasRenderingContext2D, p: LauncherPalette, w: number, h: number) {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, p.base[0]);
  base.addColorStop(1, p.base[1]);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (const b of p.blobs) {
    const c = new THREE.Color(b.color);
    const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
    const grad = g.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * w);
    grad.addColorStop(0, `rgba(${rgb}, ${b.alpha})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}

interface Row {
  name: string;
  on: boolean;
  color: string;
}

function lampRows(devices: readonly Device[]): Row[] {
  return devices.flatMap((d): Row[] => {
    if (d.kind === "light" || d.kind === "plug") return [{ name: d.name, on: d.state.on === true, color: d.state.color ?? "#ffd27a" }];
    if (d.kind === "fan" && d.capabilities.fanLight) return [{ name: "Ventilateur", on: d.state.lightOn === true, color: "#ffe2b0" }];
    return [];
  });
}

function paint(g: CanvasRenderingContext2D, scene: HTMLCanvasElement) {
  const { devices, sun } = useHome.getState();
  paintBackground(g, launcherPalette(sun?.elevation), W, H);
  const heroH = (540 - DOCK_AREA) * DP;

  // 3D: the launcher's web view fills the hero right of the panel (cover-fit of this view).
  const hx = (SIDE + PANEL_W) * DP;
  const hw = W - hx;
  if (scene.width > 0 && scene.height > 0) {
    const s = Math.max(hw / scene.width, heroH / scene.height);
    const sw = hw / s;
    const sh = heroH / s;
    g.drawImage(scene, (scene.width - sw) / 2, (scene.height - sh) / 2, sw, sh, hx, 0, hw, heroH);
  }

  // Lights panel (glass).
  const px = SIDE * DP;
  const py = 28 * DP;
  const pw = PANEL_W * DP;
  const ph = heroH - 56 * DP;
  rr(g, px, py, pw, ph, 28 * DP);
  const glass = g.createLinearGradient(0, py, 0, py + ph);
  glass.addColorStop(0, "rgba(255,255,255,0.22)");
  glass.addColorStop(1, "rgba(255,255,255,0.07)");
  g.fillStyle = glass;
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.3)";
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = "#fff";
  g.font = `600 ${20 * DP}px -apple-system, "Helvetica Neue", sans-serif`;
  g.fillText("Lumières", px + 22 * DP, py + 40 * DP);
  const rows = lampRows(devices);
  let y = py + 72 * DP;
  for (const r of rows) {
    if (y + 40 * DP > py + ph) break;
    g.beginPath();
    g.arc(px + 34 * DP, y + 16 * DP, 12 * DP, 0, Math.PI * 2);
    g.fillStyle = r.on ? r.color : "rgba(255,255,255,0.2)";
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.font = `500 ${14 * DP}px -apple-system, "Helvetica Neue", sans-serif`;
    g.fillText(r.name.length > 20 ? `${r.name.slice(0, 19)}…` : r.name, px + 56 * DP, y + 21 * DP);
    rr(g, px + pw - 60 * DP, y + 5 * DP, 42 * DP, 24 * DP, 12 * DP);
    g.fillStyle = r.on ? "#34c759" : "rgba(255,255,255,0.25)";
    g.fill();
    g.beginPath();
    g.arc(px + pw - (r.on ? 30 : 48) * DP, y + 17 * DP, 9 * DP, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    y += 58 * DP;
  }

  // Dock.
  const ty = heroH + 28 * DP;
  const tw = TILE_W * DP;
  const th = (tw * 9) / 16;
  DOCK_APPS.forEach((name, i) => {
    const x = (SIDE + i * (TILE_W + GAP)) * DP;
    if (x > W) return;
    const b = appBrand(name);
    rr(g, x, ty, tw, th, 14 * DP);
    const bg = g.createLinearGradient(x, ty, x + tw, ty + th);
    bg.addColorStop(0, b.bg[0]);
    bg.addColorStop(1, b.bg[1]);
    g.fillStyle = bg;
    g.fill();
    g.fillStyle = b.style === "generic" ? "#fff" : b.fg;
    g.font = `800 ${13 * DP}px -apple-system, "Helvetica Neue", sans-serif`;
    g.textAlign = "center";
    g.fillText(b.name, x + tw / 2, ty + th / 2 + 5 * DP);
    g.textAlign = "left";
  });

  // Clock.
  const now = new Date();
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.font = `500 ${22 * DP}px -apple-system, "Helvetica Neue", sans-serif`;
  g.textAlign = "right";
  g.fillText(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, W - SIDE * DP, 52 * DP);
  g.textAlign = "left";
}

/**
 * Mounted only while the mirror is needed: takes over the render (priority 1) to copy the frame
 * while it is still in the drawing buffer. Frames stay on demand: no extra invalidation.
 */
export function LauncherMirror() {
  const frame = useRef(0);
  useEffect(() => {
    const t = createTexture();
    useLauncherMirror.setState({ texture: t });
    return () => {
      useLauncherMirror.setState({ texture: null });
      t.dispose();
    };
  }, []);
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    const texture = useLauncherMirror.getState().texture;
    if (frame.current++ % EVERY !== 0 || !texture) return;
    const g = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!g) return;
    paint(g, gl.domElement);
    texture.needsUpdate = true;
  }, 1);
  return null;
}
