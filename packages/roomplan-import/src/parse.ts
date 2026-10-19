/**
 * Tolerant parser for the Appart3D envelope and Apple RoomPlan Codable JSON
 * (CapturedRoom / CapturedStructure). See ../FORMAT.md for the researched format.
 *
 * Tolerances:
 * - simd_float4x4: flat 16 numbers column-major (what JSONEncoder produces), flat row-major
 *   (auto-detected), nested [[col0],[col1],[col2],[col3]], or { columns: [...] }.
 * - simd_float3: [x, y, z] (extra components ignored) or { x, y, z }.
 * - Enums: { "door": { "isOpen": false } } (Swift synthesized Codable) or plain "door".
 * - Unknown fields are ignored; missing optional fields get defaults.
 */
import { transpose, type Mat4, type V3 } from "./math";

export class RoomPlanImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoomPlanImportError";
  }
}

export type Confidence = "high" | "medium" | "low";

export interface ParsedSurface {
  id: string;
  parentId: string | null;
  /** Surface category key: wall | door | window | opening | floor (or whatever the file says). */
  category: string;
  isOpen?: boolean;
  transform: Mat4;
  dimensions: V3;
  confidence: Confidence | null;
  story: number;
  /** Local-space corners (iOS 17). Empty for plain rectangles. */
  polygonCorners: V3[];
  curved: boolean;
}

export interface ParsedObject {
  id: string;
  parentId: string | null;
  category: string;
  transform: Mat4;
  dimensions: V3;
  confidence: Confidence | null;
  story: number;
  /** iOS 17 attributes, e.g. { TableType: "coffee" }. Keys/values are strings. */
  attributes: Record<string, string>;
}

export interface ParsedSection {
  label: string;
  center: V3;
  story: number;
}

/** Common shape of a CapturedRoom and a CapturedStructure. */
export interface ParsedCapture {
  id: string | null;
  walls: ParsedSurface[];
  doors: ParsedSurface[];
  windows: ParsedSurface[];
  openings: ParsedSurface[];
  floors: ParsedSurface[];
  objects: ParsedObject[];
  sections: ParsedSection[];
  version: number | null;
}

export interface ParsedStructure extends ParsedCapture {
  rooms: ParsedCapture[];
}

export interface ParsedEnvelope {
  format: string | null;
  version: number | null;
  capturedAt?: string;
  device?: string;
  appVersion?: string;
  structure: ParsedStructure | null;
  rooms: ParsedCapture[];
  roomNames: (string | null)[];
  /** Non-fatal parse problems (French). */
  issues: string[];
}

// ---------------------------------------------------------------------------
// primitives

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum);

export function parseVec3(v: unknown): V3 | null {
  if (Array.isArray(v) && v.length >= 3 && isNum(v[0]) && isNum(v[1]) && isNum(v[2])) return [v[0], v[1], v[2]];
  if (isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.z)) return [v.x, v.y, v.z];
  return null;
}

/** Parses a simd_float4x4 in any supported encoding, returning column-major flat 16. */
export function parseMatrix(v: unknown): Mat4 | null {
  let flat: number[] | null = null;
  let explicitColumns = false;
  if (numArray(v) && v.length === 16) flat = [...v];
  else {
    const cols = isObj(v) && Array.isArray(v.columns) ? v.columns : v;
    if (Array.isArray(cols) && cols.length === 4 && cols.every((c) => numArray(c) && c.length === 4)) {
      flat = (cols as number[][]).flat();
      explicitColumns = isObj(v); // `{ columns }` is unambiguous; a bare nested array is treated as columns too
    }
  }
  if (!flat) return null;
  // Row-major auto-detection: in column-major form the bottom row (m[3], m[7], m[11]) is 0 and the
  // translation lives in m[12..14]. If instead m[12..14] are ~0 and m[3]/m[7]/m[11] are not, transpose.
  if (!explicitColumns) {
    const bottom = Math.abs(flat[3]!) + Math.abs(flat[7]!) + Math.abs(flat[11]!);
    const trans = Math.abs(flat[12]!) + Math.abs(flat[13]!) + Math.abs(flat[14]!);
    if (bottom > 1e-6 && trans < 1e-9) flat = transpose(flat);
  }
  return flat;
}

/** Swift enum: `{ "case": { ...payload } }` or `"case"`. */
export function parseEnum(v: unknown): { key: string; payload: Record<string, unknown> } | null {
  if (typeof v === "string" && v.length > 0) return { key: v, payload: {} };
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1) {
      const key = keys[0]!;
      const payload = v[key];
      return { key, payload: isObj(payload) ? payload : {} };
    }
    // Some hand-written exports use { "rawValue": "sofa" } or { "type": "sofa" }.
    for (const k of ["rawValue", "type", "name"]) if (typeof v[k] === "string") return { key: v[k] as string, payload: v };
  }
  return null;
}

function parseConfidence(v: unknown): Confidence | null {
  const e = parseEnum(v);
  if (!e) return null;
  const k = e.key.toLowerCase();
  return k === "high" || k === "medium" || k === "low" ? k : null;
}

const idOf = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const storyOf = (v: unknown): number => (isNum(v) ? v : 0);

// ---------------------------------------------------------------------------
// RoomPlan elements

function parseSurface(v: unknown, fallbackCategory: string, idx: number): ParsedSurface | null {
  if (!isObj(v)) return null;
  const transform = parseMatrix(v.transform);
  const dimensions = parseVec3(v.dimensions);
  if (!transform || !dimensions) return null;
  const cat = parseEnum(v.category);
  const corners = Array.isArray(v.polygonCorners) ? v.polygonCorners.map(parseVec3).filter((p): p is V3 => p !== null) : [];
  return {
    id: idOf(v.identifier) ?? `${fallbackCategory}-${idx}`,
    parentId: idOf(v.parentIdentifier),
    category: cat?.key ?? fallbackCategory,
    isOpen: typeof cat?.payload.isOpen === "boolean" ? cat.payload.isOpen : undefined,
    transform,
    dimensions,
    confidence: parseConfidence(v.confidence),
    story: storyOf(v.story),
    polygonCorners: corners,
    curved: v.curve !== undefined && v.curve !== null,
  };
}

function parseAttributes(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObj(v)) {
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "string") out[k] = val;
      else {
        const e = parseEnum(val);
        if (e) out[k] = e.key;
      }
    }
  }
  return out;
}

function parseObject(v: unknown, idx: number): ParsedObject | null {
  if (!isObj(v)) return null;
  const transform = parseMatrix(v.transform);
  const dimensions = parseVec3(v.dimensions);
  const cat = parseEnum(v.category);
  if (!transform || !dimensions || !cat) return null;
  return {
    id: idOf(v.identifier) ?? `object-${idx}`,
    parentId: idOf(v.parentIdentifier),
    category: cat.key,
    transform,
    dimensions,
    confidence: parseConfidence(v.confidence),
    story: storyOf(v.story),
    attributes: parseAttributes(v.attributes),
  };
}

function parseSection(v: unknown): ParsedSection | null {
  if (!isObj(v)) return null;
  const label = parseEnum(v.label);
  const center = parseVec3(v.center);
  if (!center) return null;
  return { label: label?.key ?? "unidentified", center, story: storyOf(v.story) };
}

function list<T>(v: unknown, fn: (x: unknown, i: number) => T | null, counter: { bad: number }): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  v.forEach((x, i) => {
    const r = fn(x, i);
    if (r) out.push(r);
    else counter.bad++;
  });
  return out;
}

/** True when the value looks like a CapturedRoom or CapturedStructure. */
export function looksLikeCapture(v: unknown): boolean {
  return isObj(v) && (Array.isArray(v.walls) || Array.isArray(v.floors) || Array.isArray(v.objects) || Array.isArray(v.rooms));
}

export function parseCapture(v: unknown, counter = { bad: 0 }): ParsedCapture {
  const o = isObj(v) ? v : {};
  return {
    id: idOf(o.identifier),
    walls: list(o.walls, (x, i) => parseSurface(x, "wall", i), counter),
    doors: list(o.doors, (x, i) => parseSurface(x, "door", i), counter),
    windows: list(o.windows, (x, i) => parseSurface(x, "window", i), counter),
    openings: list(o.openings, (x, i) => parseSurface(x, "opening", i), counter),
    floors: list(o.floors, (x, i) => parseSurface(x, "floor", i), counter),
    objects: list(o.objects, parseObject, counter),
    sections: list(o.sections, parseSection, counter),
    version: isNum(o.version) ? o.version : null,
  };
}

export function parseStructure(v: unknown, counter = { bad: 0 }): ParsedStructure {
  const base = parseCapture(v, counter);
  const rooms = isObj(v) && Array.isArray(v.rooms) ? v.rooms.filter(isObj).map((r) => parseCapture(r, counter)) : [];
  return { ...base, rooms };
}

/**
 * Parses an envelope (or, leniently, a bare CapturedRoom / CapturedStructure / array of rooms).
 * Throws RoomPlanImportError with a French message when nothing usable is found.
 */
export function parseEnvelope(input: unknown): ParsedEnvelope {
  let data = input;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      throw new RoomPlanImportError("Fichier illisible : le contenu n'est pas du JSON valide.");
    }
  }
  if (Array.isArray(data) && data.some(looksLikeCapture)) data = { rooms: data };
  if (!isObj(data)) throw new RoomPlanImportError("Fichier invalide : un objet JSON de scan RoomPlan était attendu.");

  const counter = { bad: 0 };
  const issues: string[] = [];
  let env: Record<string, unknown> = data;
  // Bare CapturedStructure / CapturedRoom (no envelope).
  if (env.format === undefined && looksLikeCapture(env)) {
    env = Array.isArray(env.rooms) && (Array.isArray(env.walls) || Array.isArray(env.sections))
      ? { structure: env, rooms: env.rooms }
      : { rooms: [env] };
  } else if (typeof env.format === "string" && env.format !== "appart3d.roomplan") {
    throw new RoomPlanImportError(`Format de fichier non reconnu (« ${env.format} »). Exportez le scan depuis l'app Appart3D.`);
  } else if (env.format === undefined && !("structure" in env) && !("rooms" in env)) {
    throw new RoomPlanImportError("Fichier invalide : ce n'est pas un export de scan Appart3D (champ « format » absent).");
  }

  const version = isNum(env.version) ? env.version : null;
  if (version !== null && version > 1) issues.push(`Version d'export ${version} plus récente que l'importeur : certains éléments peuvent manquer.`);

  const structure = looksLikeCapture(env.structure) ? parseStructure(env.structure, counter) : null;
  if (env.structure !== undefined && env.structure !== null && !structure) issues.push("Structure fusionnée illisible, utilisation des pièces individuelles.");
  const rawRooms = Array.isArray(env.rooms) ? env.rooms : [];
  const rooms = rawRooms.filter(looksLikeCapture).map((r) => parseCapture(r, counter));
  const roomNames = Array.isArray(env.roomNames) ? env.roomNames.map((n) => (typeof n === "string" && n.trim() ? n.trim() : null)) : [];

  if (!structure && rooms.length === 0) {
    throw new RoomPlanImportError("Le fichier ne contient aucune pièce scannée exploitable (ni « structure » ni « rooms »).");
  }
  if (counter.bad > 0) issues.push(`${counter.bad} élément${counter.bad > 1 ? "s" : ""} du scan illisible${counter.bad > 1 ? "s" : ""} ignoré${counter.bad > 1 ? "s" : ""}.`);

  return {
    format: typeof env.format === "string" ? env.format : null,
    version,
    capturedAt: typeof env.capturedAt === "string" ? env.capturedAt : undefined,
    device: typeof env.device === "string" ? env.device : undefined,
    appVersion: typeof env.appVersion === "string" ? env.appVersion : undefined,
    structure,
    rooms,
    roomNames,
    issues,
  };
}
