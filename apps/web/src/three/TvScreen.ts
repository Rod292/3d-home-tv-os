import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { resolveAsset, type TvContent } from "../lib/home";
import { tvCardKey, tvCardModel, type TvBrand, type TvCardModel } from "../lib/tvCard";
import { useHome } from "../state/home";
import { isLauncherApp } from "../lib/launcherLook";
import { useLauncherMirror } from "./LauncherMirror";

/**
 * Maison mode: the 3D TV shows what the real TV shows — the artwork / logo from the bridge, large,
 * over a blurred tinted copy of itself, with the app / channel and the title; otherwise a branded card
 * (colors + a wordmark drawn here, no logo files). Drawn in a canvas texture, redrawn only when the
 * content changes.
 */

const W = 1024;
const H = 576;
const FONT = `-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif`;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Text shrunk to fit `maxW`, with an ellipsis as a last resort. */
function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: number, minSize = size * 0.6): string {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > minSize) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function background(g: CanvasRenderingContext2D, b: TvBrand) {
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, b.bg[0]);
  grad.addColorStop(1, b.bg[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // soft accent glow, like a TV app's hero light
  const glow = g.createRadialGradient(W * 0.78, H * 0.12, 0, W * 0.78, H * 0.12, W * 0.7);
  glow.addColorStop(0, withAlpha(b.accent, 0.28));
  glow.addColorStop(1, withAlpha(b.accent, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
}

/** Color with alpha (hex or hsl()). */
function withAlpha(color: string, a: number): string {
  const c = new THREE.Color(color);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
}

/** Brand wordmark centered at (cx, cy). Simple typographic marks, no logo artwork. */
function wordmark(g: CanvasRenderingContext2D, b: TvBrand, cx: number, cy: number, scale = 1) {
  g.save();
  g.translate(cx, cy);
  g.scale(scale, scale);
  g.textAlign = "center";
  g.textBaseline = "middle";
  switch (b.style) {
    case "netflix": {
      g.save();
      g.scale(0.82, 1.18);
      g.font = `900 132px Impact, "Arial Narrow Bold", "Helvetica Neue", sans-serif`;
      g.shadowColor = "rgba(0,0,0,0.6)";
      g.shadowBlur = 18;
      g.fillStyle = b.fg;
      g.fillText("NETFLIX", 0, 0);
      g.restore();
      break;
    }
    case "youtube": {
      g.font = `700 104px ${FONT}`;
      const tw = g.measureText("YouTube").width;
      const bw = 150;
      const total = bw + 22 + tw;
      const x0 = -total / 2;
      g.fillStyle = b.accent;
      roundRect(g, x0, -52, bw, 104, 30);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(x0 + bw / 2 - 20, -26);
      g.lineTo(x0 + bw / 2 + 30, 0);
      g.lineTo(x0 + bw / 2 - 20, 26);
      g.closePath();
      g.fill();
      g.textAlign = "left";
      g.fillStyle = b.fg;
      g.fillText("YouTube", x0 + bw + 22, 4);
      break;
    }
    case "prime": {
      g.font = `800 112px ${FONT}`;
      g.fillStyle = b.fg;
      g.fillText("prime video", 0, -10);
      g.strokeStyle = b.accent;
      g.lineWidth = 12;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-250, 52);
      g.quadraticCurveTo(-110, 100, 20, 52);
      g.stroke();
      g.beginPath();
      g.moveTo(0, 40);
      g.lineTo(26, 52);
      g.lineTo(6, 72);
      g.stroke();
      break;
    }
    case "disney": {
      const arc = g.createLinearGradient(-260, 0, 260, 0);
      arc.addColorStop(0, withAlpha(b.accent, 0));
      arc.addColorStop(0.5, "#ffffff");
      arc.addColorStop(1, withAlpha(b.accent, 0.2));
      g.strokeStyle = arc;
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(10, 40, 280, 120, 0, Math.PI * 1.08, Math.PI * 1.95);
      g.stroke();
      g.font = `italic 600 136px "Snell Roundhand", "Apple Chancery", Georgia, serif`;
      g.fillStyle = b.fg;
      g.shadowColor = withAlpha(b.accent, 0.9);
      g.shadowBlur = 30;
      g.fillText("Disney", -40, 18);
      g.font = `300 128px ${FONT}`;
      g.fillText("+", 190, 10);
      break;
    }
    case "canal": {
      g.font = `900 130px ${FONT}`;
      g.fillStyle = b.fg;
      g.fillText("CANAL+", 0, 6);
      break;
    }
    case "appletv": {
      g.font = `600 118px ${FONT}`;
      g.fillStyle = b.fg;
      g.fillText("Apple TV", 0, 6);
      break;
    }
    case "spotify": {
      g.font = `800 108px ${FONT}`;
      const tw = g.measureText("Spotify").width;
      const r = 62;
      const total = 2 * r + 24 + tw;
      const x0 = -total / 2;
      g.fillStyle = b.accent;
      g.beginPath();
      g.arc(x0 + r, 0, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#121212";
      g.lineCap = "round";
      for (const [dy, w, lw] of [[-18, 0.72, 12], [8, 0.6, 10], [30, 0.48, 8]] as const) {
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x0 + r - r * w, dy);
        g.quadraticCurveTo(x0 + r, dy - 16, x0 + r + r * w, dy + 6);
        g.stroke();
      }
      g.textAlign = "left";
      g.fillStyle = b.fg;
      g.fillText("Spotify", x0 + 2 * r + 24, 4);
      break;
    }
    case "hdmi": {
      g.strokeStyle = b.accent;
      g.lineWidth = 9;
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(-90, -110);
      g.lineTo(90, -110);
      g.lineTo(90, -80);
      g.lineTo(60, -50);
      g.lineTo(-60, -50);
      g.lineTo(-90, -80);
      g.closePath();
      g.stroke();
      g.font = `700 112px ${FONT}`;
      g.fillStyle = b.fg;
      g.fillText(b.name, 0, 40);
      break;
    }
    case "channel":
    case "generic": {
      const label = fitText(g, b.name, 760, 120, 800);
      g.fillStyle = b.fg;
      g.fillText(label, 0, 6);
      break;
    }
  }
  g.restore();
}

/** Title band at the bottom of a branded card. */
function titleBand(g: CanvasRenderingContext2D, m: TvCardModel) {
  if (!m.title && !m.subtitle) return;
  const grad = g.createLinearGradient(0, H * 0.62, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.78)");
  g.fillStyle = grad;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  let y = H - 46;
  if (m.subtitle) {
    g.fillStyle = "rgba(255,255,255,0.72)";
    g.fillText(fitText(g, m.subtitle, W - 120, 30, 600), 60, y);
    y -= 44;
  }
  if (m.title) {
    g.fillStyle = "#ffffff";
    g.fillText(fitText(g, m.title, W - 120, 50, 750), 60, y);
  }
}

function drawCard(g: CanvasRenderingContext2D, m: TvCardModel) {
  background(g, m.brand);
  const shift = m.title || m.subtitle ? -46 : 0;
  wordmark(g, m.brand, W / 2, H / 2 + shift, 1);
  titleBand(g, m);
}

/** Artwork large on the left over a blurred, darkened copy of itself; app / channel + title on the right. */
function drawArtwork(g: CanvasRenderingContext2D, m: TvCardModel, img: HTMLImageElement) {
  // Blur by down- then up-scaling (works everywhere, unlike ctx.filter).
  const small = document.createElement("canvas");
  small.width = 24;
  small.height = 14;
  const sg = small.getContext("2d")!;
  const ar = img.naturalWidth / Math.max(1, img.naturalHeight);
  const cw = ar > 24 / 14 ? 14 * ar : 24;
  const ch = ar > 24 / 14 ? 14 : 24 / ar;
  sg.drawImage(img, (24 - cw) / 2, (14 - ch) / 2, cw, ch);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(small, -40, -40, W + 80, H + 80);
  g.fillStyle = "rgba(0,0,0,0.42)";
  g.fillRect(0, 0, W, H);
  const tint = g.createLinearGradient(0, 0, W, 0);
  tint.addColorStop(0, withAlpha(m.brand.bg[1], 0.1));
  tint.addColorStop(1, withAlpha(m.brand.bg[1], 0.55));
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);

  // Square-ish cover, or a wide still for 16:9 pictures.
  const wide = ar > 1.3;
  const boxH = wide ? 300 : 400;
  const boxW = wide ? Math.min(560, boxH * ar) : Math.min(400, boxH * ar);
  const x = 64;
  const y = (H - boxH) / 2;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 40;
  g.shadowOffsetY = 14;
  roundRect(g, x, y, boxW, boxH, 18);
  g.fillStyle = "#000";
  g.fill();
  g.restore();
  g.save();
  roundRect(g, x, y, boxW, boxH, 18);
  g.clip();
  const s = Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  g.drawImage(img, x + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh);
  g.restore();

  const tx = x + boxW + 44;
  const maxW = W - tx - 48;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = withAlpha(m.brand.accent, 1);
  g.fillText(fitText(g, m.brand.name.toUpperCase(), maxW, 30, 800), tx, H / 2 - 54);
  if (m.title) {
    g.fillStyle = "#ffffff";
    g.fillText(fitText(g, m.title, maxW, 52, 780, 30), tx, H / 2 + 6);
  }
  if (m.subtitle) {
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillText(fitText(g, m.subtitle, maxW, 32, 600), tx, H / 2 + 54);
  }
}

/** Draws the model (with its loaded artwork, if any) on a canvas. Exported for the dev hooks / tests. */
export function drawTvScreen(canvas: HTMLCanvasElement, m: TvCardModel, img: HTMLImageElement | null) {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, W, H);
  if (img && img.naturalWidth > 0) drawArtwork(g, m, img);
  else drawCard(g, m);
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string, credentials: boolean): Promise<HTMLImageElement | null> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      if (credentials) img.crossOrigin = "use-credentials";
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        images.delete(url);
        resolve(null);
      };
      img.src = url;
    });
    images.set(url, p);
    if (images.size > 12) images.delete(images.keys().next().value!);
  }
  return p;
}

/**
 * Canvas texture showing `content` on the TV screen (null when there is nothing to show: the item keeps
 * its usual `screenImage`). One canvas per TV item, redrawn when the content changes.
 */
export function useTvScreenTexture(content: TvContent | undefined): THREE.CanvasTexture | null {
  const invalidate = useThree((s) => s.invalidate);
  const base = useHome((s) => s.client?.base ?? "");
  const model = useMemo(() => tvCardModel(content), [content]);
  const key = tvCardKey(model);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const [drawn, setDrawn] = useState("");

  useEffect(() => {
    if (!model) return;
    let alive = true;
    const canvas = texture.image as HTMLCanvasElement;
    const paint = (img: HTMLImageElement | null) => {
      if (!alive) return;
      drawTvScreen(canvas, model, img);
      texture.needsUpdate = true;
      setDrawn(key);
      invalidate();
    };
    const url = resolveAsset(model.artworkUrl, base);
    if (!url) paint(null);
    else {
      // Branded card right away, the artwork as soon as it is there.
      paint(null);
      void loadImage(url, !!base && !url.startsWith("data:")).then((img) => img && paint(img));
    }
    return () => {
      alive = false;
    };
  }, [key, model, base, texture, invalidate]);

  // The TV shows the Maison home screen: mise en abyme (see LauncherMirror).
  const mirror = useLauncherMirror((s) => s.texture);
  if (mirror && isLauncherApp(content?.app)) return mirror;
  return model && drawn ? texture : null;
}
