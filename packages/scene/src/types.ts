/**
 * Appart3D scene contract — the single source of truth shared by the web editor,
 * the furniture catalog, the RoomPlan importer and (later) the iOS app.
 *
 * Conventions:
 * - Units are meters, angles are radians.
 * - Y is up (three.js convention). The floor is the XZ plane at y = 0.
 * - 2D points (`Vec2`) are floor-plan coordinates: `[x, z]`.
 * - An item's `position` is the center of its footprint ON THE FLOOR (y = elevation of its base),
 *   `dimensions` are its axis-aligned size before rotation: `[width (x), height (y), depth (z)]`.
 *   The item "faces" +Z when `rotationY` is 0 (front of a sofa, screen of a TV, door of a fridge).
 */

export type Vec2 = [x: number, z: number];
export type Vec3 = [x: number, y: number, z: number];

export const SCENE_VERSION = 1 as const;

export interface Scene {
  version: typeof SCENE_VERSION;
  id: string;
  name: string;
  units: "m";
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  items: Item[];
  meta: SceneMeta;
}

export interface SceneMeta {
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  source: "demo" | "roomplan" | "manual";
  /** Free-form notes, e.g. device model or RoomPlan version for scans. */
  notes?: string;
  /** Non-fatal importer warnings kept with the scene. */
  importWarnings?: string[];
}

export type RoomKind =
  | "living"
  | "bedroom"
  | "kitchen"
  | "bathroom"
  | "toilet"
  | "hallway"
  | "office"
  | "dining"
  | "storage"
  | "other";

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  /** Floor polygon, not closed (last != first), counter-clockwise i.e. `polygonArea(floor) > 0`. */
  floor: Vec2[];
  floorMaterial: FloorMaterial;
  /** Hex color like "#f2e8dc". */
  floorColor?: string;
}

export type FloorMaterial = "wood" | "tile" | "carpet" | "concrete";

export interface Wall {
  id: string;
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
  /** Hex color for both faces; renderer picks a default when absent. */
  color?: string;
  /**
   * Per-face colors, overriding `color`. "left" is the face on your left when walking from
   * `start` to `end` seen from above (see `wallSideOf` / `wallNormal` in geometry.ts).
   */
  faceColors?: { left?: string; right?: string };
}

export type OpeningKind = "door" | "window" | "opening";

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance along the wall from `wall.start` to the CENTER of the opening. */
  offset: number;
  width: number;
  height: number;
  /** Elevation of the bottom edge (0 for doors, ~0.9 for windows). */
  sill: number;
  /** Doors only: whether the leaf was open at scan time (RoomPlan `isOpen`). */
  isOpen?: boolean;
}

/**
 * Item categories. The first block mirrors Apple RoomPlan's
 * `CapturedRoom.Object.Category`; the second block is what RoomPlan cannot
 * detect but the AI pass or the user can add.
 */
export const ROOMPLAN_CATEGORIES = [
  "storage",
  "refrigerator",
  "stove",
  "bed",
  "sink",
  "washerDryer",
  "toilet",
  "bathtub",
  "oven",
  "dishwasher",
  "table",
  "sofa",
  "chair",
  "fireplace",
  "television",
  "stairs",
] as const;

export const EXTRA_CATEGORIES = [
  "desk",
  "wardrobe",
  "shelf",
  "nightstand",
  "tvStand",
  "lamp",
  "floorLamp",
  "plant",
  "rug",
  "artwork",
  "mirror",
  "armchair",
  "coffeeTable",
  "shower",
  "bicycle",
  "coatRack",
  "pendantLamp",
  "ceilingFan",
  "radiator",
  "curtain",
  "espressoMachine",
  "coffeeGrinder",
  "wallShelf",
  "speaker",
  "monitor",
  "laptop",
  "person",
] as const;

export type RoomPlanCategory = (typeof ROOMPLAN_CATEGORIES)[number];
export type ItemCategory = RoomPlanCategory | (typeof EXTRA_CATEGORIES)[number];
export const ITEM_CATEGORIES: readonly ItemCategory[] = [...ROOMPLAN_CATEGORIES, ...EXTRA_CATEGORIES];

export type ItemMount = "floor" | "wall" | "ceiling";

export interface Item {
  id: string;
  category: ItemCategory;
  /** Catalog variant key, e.g. "sofa/modern" — catalog falls back to its default when unknown. */
  variant?: string;
  position: Vec3;
  rotationY: number;
  dimensions: Vec3;
  /** Main hex color; catalog picks a palette default when absent. */
  color?: string;
  roomId?: string;
  source: "scan" | "user" | "ai" | "demo";
  /** 0..1 detection confidence for scanned / AI items. */
  confidence?: number;
  label?: string;
  /**
   * How the item is held: on the floor (default), against a wall (artwork, mirror, radiator, curtain —
   * `position.y` is its bottom edge) or hanging from the ceiling (pendant lamp, fan — `position.y` is its
   * bottom, the top touches the ceiling). Absent = catalog default for the category.
   */
  mount?: ItemMount;
  /**
   * Raw detector attributes, e.g. RoomPlan `{ SofaType: "lShaped" }`; catalog may map them to variants.
   * Also free-form appearance hints for the catalog (e.g. a person's `skin`, `hair`, `top`, `bottom`).
   */
  attributes?: Record<string, string>;
}
