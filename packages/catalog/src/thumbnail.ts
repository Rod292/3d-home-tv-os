/**
 * Catalog thumbnails (STABLE CONTRACT, used by apps/web): small PNG data-URLs of a catalog model,
 * rendered with the same toon materials by ONE shared, lazily created offscreen WebGLRenderer.
 *
 * - `useCatalogThumbnail(category, variant?, color?)` → string | undefined (undefined until ready,
 *   or forever when WebGL is unavailable / during SSR — callers show a fallback). Never throws.
 * - `renderCatalogThumbnail(...)` → Promise<string | undefined> for non-React callers.
 * - Optional `attributes` (e.g. a person's look) are forwarded to the builder and appended to the key.
 * - Results are cached by `thumbnailKey` (resolved variant + color); generation is queued and
 *   processed on animation frames within a ~6 ms budget (at least one per frame), so a panel of
 *   30+ cards doesn't jank.
 * - Geometries / materials come from the shared caches and are never disposed here.
 */
import { useEffect, useSyncExternalStore } from "react";
import * as THREE from "three";
import type { ItemCategory, Vec3 } from "@appart3d/scene";
import { resolveVariant } from "./builders";
import { getCatalogEntry } from "./catalog";
import { getGeometry, partsBounds } from "./geometry";
import { attributesKey, buildModel, resolveColor } from "./model";
import { getMaterial } from "./theme";

/** Default thumbnail size in CSS px (square). */
export const THUMBNAIL_SIZE = 192;

/* ------------------------------------------------------------ pure helpers */

type Attrs = Record<string, string>;

/**
 * Cache key: resolved variant key + normalized color, e.g. "sofa/modern|#5b7fa6"
 * (+ "|<stable attributes serialization>" when non-empty attributes are given).
 */
export function thumbnailKey(category: ItemCategory, variant?: string, color?: string, attributes?: Attrs): string {
  const v = resolveVariant(category, variant);
  const input: { category: ItemCategory; variant: string; color?: string } = { category, variant: v.key };
  if (color !== undefined) input.color = color;
  const a = attributesKey(attributes);
  return `${v.key}|${resolveColor(input)}${a ? `|${a}` : ""}`;
}

/**
 * Dimensions used for a thumbnail: the variant's default, else the entry's default.
 * Pendant lamps get a shorter cord so the shade isn't lost in a tall, thin frame.
 */
export function thumbnailDimensions(category: ItemCategory, variant?: string): Vec3 {
  const v = resolveVariant(category, variant);
  const [w, h, d] = v.defaultDimensions ?? getCatalogEntry(category)?.defaultDimensions ?? [0.6, 0.6, 0.6];
  if (category === "pendantLamp") return [w, Math.min(h, Math.max(w, d) * 1.5 + 0.12), d];
  return [w, h, d];
}

export interface ThumbnailCamera {
  position: Vec3;
  target: Vec3;
  /** Orthographic frustum (camera space). */
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/** 3/4 iso view direction (from the target towards the camera): front-right, from above. */
export const THUMBNAIL_VIEW_DIR: Vec3 = [0.62, 0.62, 1];

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Fixed 3/4 orthographic camera framing an axis-aligned box: projects the 8 corners on the
 * camera plane, centers them and fits the larger extent (square frame) with a margin.
 * Pure (no WebGL) — unit tested.
 */
export function frameBounds(min: Vec3, max: Vec3, opts: { dir?: Vec3; margin?: number; aspect?: number } = {}): ThumbnailCamera {
  const dir = norm((opts.dir ?? THUMBNAIL_VIEW_DIR) as V);
  const margin = opts.margin ?? 0.08;
  const aspect = opts.aspect ?? 1;
  const c: V = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const right = norm(cross([0, 1, 0], dir));
  const up = cross(dir, right);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, r = 0;
  for (let i = 0; i < 8; i++) {
    const p: V = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    const q = sub(p, c);
    const px = dot(q, right);
    const py = dot(q, up);
    x0 = Math.min(x0, px);
    x1 = Math.max(x1, px);
    y0 = Math.min(y0, py);
    y1 = Math.max(y1, py);
    r = Math.max(r, Math.hypot(q[0], q[1], q[2]));
  }
  // recenter the target on the projected box center
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const target: V = [c[0] + right[0] * mx + up[0] * my, c[1] + right[1] * mx + up[1] * my, c[2] + right[2] * mx + up[2] * my];
  let hw = (x1 - x0) / 2;
  let hh = (y1 - y0) / 2;
  if (hw / hh > aspect) hh = hw / aspect;
  else hw = hh * aspect;
  hw *= 1 + margin * 2;
  hh *= 1 + margin * 2;
  const dist = Math.max(r * 2, 1);
  return {
    position: [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist],
    target,
    left: -hw,
    right: hw,
    top: hh,
    bottom: -hh,
    near: Math.max(0.01, dist - r * 1.5),
    far: dist + r * 1.5,
  };
}

/* --------------------------------------------------------- shared renderer */

interface Ctx3 {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  holder: THREE.Group;
  camera: THREE.OrthographicCamera;
}

let ctx: Ctx3 | null = null;
let disabled = false;

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined" && typeof requestAnimationFrame === "function";
}

function getCtx(): Ctx3 | null {
  if (ctx) return ctx;
  if (disabled || !canUseDom()) return null;
  try {
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
    renderer.setClearColor(0x000000, 0);
    // match react-three-fiber's defaults so thumbnails look like the 3D view
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      ctx = null;
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#fff6ea", "#cdb294", 1.1));
    const key = new THREE.DirectionalLight("#fff1dc", 2.6);
    key.position.set(4, 8, 6);
    const fill = new THREE.DirectionalLight("#dfe8ff", 0.7);
    fill.position.set(-6, 3, 2);
    scene.add(key, fill);
    const holder = new THREE.Group();
    scene.add(holder);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    ctx = { renderer, scene, holder, camera };
    return ctx;
  } catch {
    disabled = true;
    return null;
  }
}

function renderNow(category: ItemCategory, variant: string | undefined, color: string | undefined, attributes: Attrs | undefined): string | undefined {
  const c = getCtx();
  if (!c) return undefined;
  const input: Parameters<typeof buildModel>[0] = { category, dimensions: thumbnailDimensions(category, variant), id: `thumb:${category}` };
  if (variant !== undefined) input.variant = variant;
  if (color !== undefined) input.color = color;
  if (attributes !== undefined) input.attributes = attributes;
  const model = buildModel(input);
  const group = new THREE.Group();
  group.position.set(...model.fit.position);
  group.scale.set(...model.fit.scale);
  for (const p of model.parts) {
    const mesh = new THREE.Mesh(getGeometry(p.geo), getMaterial(p.color, p.role ?? "toon", 0));
    mesh.position.set(...p.pos);
    if (p.rot) mesh.rotation.set(...p.rot);
    if (p.scale) mesh.scale.set(...p.scale);
    group.add(mesh);
  }
  const b = partsBounds(model.parts);
  const f = model.fit;
  const min: Vec3 = [b.min.x * f.scale[0] + f.position[0], b.min.y * f.scale[1] + f.position[1], b.min.z * f.scale[2] + f.position[2]];
  const max: Vec3 = [b.max.x * f.scale[0] + f.position[0], b.max.y * f.scale[1] + f.position[1], b.max.z * f.scale[2] + f.position[2]];
  const cam = frameBounds(min, max);
  c.camera.left = cam.left;
  c.camera.right = cam.right;
  c.camera.top = cam.top;
  c.camera.bottom = cam.bottom;
  c.camera.near = cam.near;
  c.camera.far = cam.far;
  c.camera.position.set(...cam.position);
  c.camera.lookAt(...cam.target);
  c.camera.updateProjectionMatrix();
  c.holder.add(group);
  try {
    c.renderer.render(c.scene, c.camera);
    return c.renderer.domElement.toDataURL("image/png");
  } finally {
    // meshes only reference shared geometry / materials: just detach
    c.holder.remove(group);
  }
}

/* ----------------------------------------------------- cache, queue, store */

const cache = new Map<string, string | null>();
const listeners = new Set<() => void>();
interface Job {
  key: string;
  category: ItemCategory;
  variant: string | undefined;
  color: string | undefined;
  attributes: Attrs | undefined;
  waiters: ((v: string | undefined) => void)[];
}
const queue: Job[] = [];
const queued = new Map<string, Job>();
let scheduled = false;

function emit(): void {
  for (const l of listeners) l();
}

/** Per-frame time budget: render as many queued thumbnails as fit, at least one. */
const FRAME_BUDGET_MS = 6;

function pump(): void {
  scheduled = false;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const t0 = now();
  let job: Job | undefined;
  let rendered = 0;
  while ((job = queue.shift())) {
    queued.delete(job.key);
    let url: string | undefined;
    try {
      url = renderNow(job.category, job.variant, job.color, job.attributes);
    } catch {
      url = undefined;
    }
    // null = failed / unsupported (don't retry endlessly)
    cache.set(job.key, url ?? null);
    for (const w of job.waiters) w(url);
    rendered++;
    if (now() - t0 > FRAME_BUDGET_MS) break;
  }
  if (rendered) emit();
  if (queue.length) schedule();
}

function schedule(): void {
  if (scheduled || !canUseDom()) return;
  scheduled = true;
  requestAnimationFrame(pump);
}

function request(category: ItemCategory, variant?: string, color?: string, waiter?: (v: string | undefined) => void, attributes?: Attrs): void {
  let key: string;
  try {
    key = thumbnailKey(category, variant, color, attributes);
  } catch {
    waiter?.(undefined);
    return;
  }
  if (cache.has(key)) {
    waiter?.(cache.get(key) ?? undefined);
    return;
  }
  if (disabled || !canUseDom()) {
    waiter?.(undefined);
    return;
  }
  let job = queued.get(key);
  if (!job) {
    job = { key, category, variant, color, attributes: attributes ? { ...attributes } : undefined, waiters: [] };
    queued.set(key, job);
    queue.push(job);
  }
  if (waiter) job.waiters.push(waiter);
  schedule();
}

/** Promise flavor (non-React). Resolves to undefined when WebGL is unavailable. Never rejects. */
export function renderCatalogThumbnail(category: ItemCategory, variant?: string, color?: string, attributes?: Attrs): Promise<string | undefined> {
  return new Promise((resolve) => request(category, variant, color, resolve, attributes));
}

/** Synchronous cache lookup (undefined if not rendered yet). */
export function getCachedThumbnail(category: ItemCategory, variant?: string, color?: string, attributes?: Attrs): string | undefined {
  try {
    return cache.get(thumbnailKey(category, variant, color, attributes)) ?? undefined;
  } catch {
    return undefined;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Small PNG data-URL preview of a catalog model, for UI cards (STABLE CONTRACT, used by apps/web).
 * Returns undefined until the image is ready (or if WebGL is unavailable) — callers show a fallback.
 */
export function useCatalogThumbnail(category: ItemCategory, variant?: string, color?: string, attributes?: Attrs): string | undefined {
  const url = useSyncExternalStore(
    subscribe,
    () => getCachedThumbnail(category, variant, color, attributes),
    () => undefined,
  );
  const attrKey = attributesKey(attributes);
  useEffect(() => {
    request(category, variant, color, undefined, attributes);
    // attributes are compared by content (attrKey), not identity
  }, [category, variant, color, attrKey]);
  return url;
}
