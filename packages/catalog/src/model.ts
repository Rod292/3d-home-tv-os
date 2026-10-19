/**
 * Pure model assembly: Item-like input → Part[] (+ a tiny fit correction).
 * No React, no WebGL: used by FurnitureModel, the demo and the tests.
 */
import type { Item, ItemCategory, Vec3 } from "@appart3d/scene";
import { MODELS, resolveVariant } from "./builders";
import { getCatalogEntry } from "./catalog";
import { normalizeHex } from "./color";
import { partsBounds } from "./geometry";
import type { Part, V3 } from "./parts";

export interface ModelInput {
  category: ItemCategory;
  dimensions: Vec3;
  variant?: string;
  color?: string;
  /** Used to seed procedural details (books, art) — usually the item id. */
  id?: string;
  /** Free-form `Item.attributes` (appearance hints, e.g. a person's clothes). Part of the cache key. */
  attributes?: Record<string, string>;
}

export interface BuiltModel {
  parts: Part[];
  /** Resolved variant key. */
  variant: string;
  color: string;
  /** Group transform that snaps the parts' bounds onto the exact dimensions (≈ identity). */
  fit: { position: V3; scale: V3 };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable serialization of attributes (sorted keys); "" when absent / empty. */
export function attributesKey(attributes?: Readonly<Record<string, string>>): string {
  if (!attributes) return "";
  const keys = Object.keys(attributes).sort();
  return keys.length ? JSON.stringify(keys.map((k) => [k, String(attributes[k])])) : "";
}

const NO_ATTRS: Readonly<Record<string, string>> = Object.freeze({});

const MIN = 0.01;
function sanitize(dims: Vec3, fallback: Vec3): Vec3 {
  return dims.map((v, i) => (Number.isFinite(v) && v > 0 ? Math.max(v, MIN) : (fallback[i] ?? 0.5))) as Vec3;
}

export function resolveColor(input: Pick<ModelInput, "category" | "variant" | "color">): string {
  const v = resolveVariant(input.category, input.variant);
  return normalizeHex(input.color ?? v.defaultColor ?? getCatalogEntry(input.category)?.defaultColor ?? "#cccccc");
}

/** Raw builder output for an input (no fit correction). Pure. */
export function buildParts(input: ModelInput): Part[] {
  const v = resolveVariant(input.category, input.variant);
  const entry = getCatalogEntry(input.category);
  const [w, h, d] = sanitize(input.dimensions, v.defaultDimensions ?? entry?.defaultDimensions ?? [0.5, 0.5, 0.5]);
  const color = resolveColor(input);
  const attrs = input.attributes ? { ...input.attributes } : NO_ATTRS;
  return v.build({ w, h, d, color, seed: hash(input.id ?? input.category), attrs }).list;
}

const cache = new Map<string, BuiltModel>();
const MAX_CACHE = 600;

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Memoized model (by category / variant / mm-rounded dimensions / color / seed / attributes). */
export function buildModel(input: ModelInput): BuiltModel {
  const v = resolveVariant(input.category, input.variant);
  const color = resolveColor(input);
  const dims = input.dimensions.map(r3) as Vec3;
  const key = `${v.key}|${dims.join(",")}|${color}|${input.id ?? ""}|${attributesKey(input.attributes)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parts = buildParts({ ...input, dimensions: dims });
  const target = sanitize(dims, v.defaultDimensions ?? [0.5, 0.5, 0.5]);
  const b = partsBounds(parts);
  const fit: BuiltModel["fit"] = { position: [0, 0, 0], scale: [1, 1, 1] };
  if (!b.isEmpty()) {
    const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
    const min = [b.min.x, b.min.y, b.min.z];
    const tmin = [-target[0] / 2, 0, -target[2] / 2];
    const s = size.map((sz, i) => (sz > 1e-4 ? (target[i] as number) / sz : 1));
    // only nudge small errors; a large mismatch means the shape intentionally doesn't fill an axis
    if (s.every((k) => k > 0.85 && k < 1.18)) {
      fit.scale = s as V3;
      fit.position = [0, 1, 2].map((i) => (tmin[i] as number) - (min[i] as number) * (s[i] as number)) as V3;
    }
  }
  const model: BuiltModel = { parts, variant: v.key, color, fit };
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(key, model);
  return model;
}

export function modelFor(item: Pick<Item, "category" | "dimensions" | "variant" | "color" | "id" | "attributes">): BuiltModel {
  const input: ModelInput = { category: item.category, dimensions: item.dimensions, id: item.id };
  if (item.variant !== undefined) input.variant = item.variant;
  if (item.color !== undefined) input.color = item.color;
  if (item.attributes !== undefined) input.attributes = item.attributes;
  return buildModel(input);
}

export const ALL_VARIANTS = Object.values(MODELS).flat();
