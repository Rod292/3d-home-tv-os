/** RoomPlan objects → scene items (category heuristics, yaw, room assignment). */
import { ROOMPLAN_CATEGORIES, pointInPolygon, type Item, type ItemCategory, type RoomPlanCategory, type Room, type Vec2 } from "@appart3d/scene";
import { column, pointRectDistance, round, toPlan, translation, wrapAngle, yawOfDirection, type PlanFrame } from "./math";
import type { Confidence, ParsedObject } from "./parse";
import { ITEM_LABEL } from "./labels";

/**
 * Which LOCAL axis of a RoomPlan object box is its front (seat side of a sofa, screen of a TV,
 * doors of a cabinet). Our scene contract wants the front to face +Z at rotationY = 0.
 *
 * Evidence (see FORMAT.md): in real exports, televisions, cabinets, sofas and fireplaces standing
 * against a wall have their local +Z pointing towards the room center, and RoomPlan walls' local +Z
 * also points into the room. So RoomPlan's front is local +Z. Flip to "-z" if a real scan shows
 * furniture facing walls.
 */
export const ROOMPLAN_FRONT_AXIS: "+z" | "-z" = "+z";

export const CONFIDENCE_VALUE: Record<Confidence, number> = { high: 0.9, medium: 0.6, low: 0.3 };

/** Yaw (scene rotationY) of a RoomPlan object transform, in world space (before plan rotation). */
export function objectYaw(transform: readonly number[], front: "+z" | "-z" = ROOMPLAN_FRONT_AXIS): number {
  const [zx, , zz] = column(transform, 2);
  let yaw = yawOfDirection(zx, zz);
  if (front === "-z") yaw += Math.PI;
  return wrapAngle(yaw);
}

const isRoomPlanCategory = (c: string): c is RoomPlanCategory => (ROOMPLAN_CATEGORIES as readonly string[]).includes(c);

interface Draft {
  src: ParsedObject;
  category: ItemCategory;
  position: Vec2;
  y: number;
  yaw: number;
  dims: [number, number, number];
}

/**
 * Category refinement:
 * - table → coffeeTable when height < 0.55 m or attribute TableType = coffee
 * - storage → shelf when StorageType = shelf; wardrobe when height > 1.6 m;
 *   nightstand when small (w ≤ 0.7, d ≤ 0.6, h ≤ 0.8) and within 0.5 m of a bed; else storage
 * - chair → armchair when width > 0.7 m
 * - sofa with SofaType = singleSeat → armchair
 */
export function refineCategory(base: RoomPlanCategory, d: Draft, beds: Draft[]): ItemCategory {
  const [w, h, depth] = d.dims;
  const attr = d.src.attributes;
  switch (base) {
    case "table":
      return h < 0.55 || attr.TableType === "coffee" ? "coffeeTable" : "table";
    case "storage": {
      if (attr.StorageType === "shelf") return "shelf";
      if (h > 1.6) return "wardrobe";
      const small = w <= 0.7 && depth <= 0.6 && h <= 0.8;
      if (small && beds.some((b) => pointRectDistance(d.position, b.position, b.dims[0] / 2, b.dims[2] / 2, b.yaw) <= 0.5 + Math.max(w, depth) / 2))
        return "nightstand";
      return "storage";
    }
    case "chair":
      return w > 0.7 ? "armchair" : "chair";
    case "sofa":
      return attr.SofaType === "singleSeat" ? "armchair" : "sofa";
    default:
      return base;
  }
}

export interface ItemsResult {
  items: Item[];
  unknown: number;
  lowConfidence: number;
}

export function buildItems(objects: ParsedObject[], rooms: Room[], frame: PlanFrame, nextId: () => string): ItemsResult {
  let unknown = 0;
  const drafts: (Draft & { base: RoomPlanCategory })[] = [];
  for (const o of objects) {
    if (!isRoomPlanCategory(o.category)) {
      unknown++;
      continue;
    }
    const [cx, cy, cz] = translation(o.transform);
    const dims = o.dimensions.map((v) => Math.max(0.02, Math.abs(v))) as [number, number, number];
    let y = cy - dims[1] / 2 - frame.floorY;
    // Floors of different rooms differ by a few cm (tile vs parquet, scan noise): anything this low stands on the floor.
    if (y < 0.08) y = 0;
    drafts.push({
      src: o,
      base: o.category,
      category: o.category,
      position: toPlan(frame, [cx, cz]),
      y,
      yaw: wrapAngle(objectYaw(o.transform) + frame.phi),
      dims,
    });
  }
  const beds = drafts.filter((d) => d.base === "bed");
  let lowConfidence = 0;
  const items: Item[] = drafts.map((d) => {
    const category = refineCategory(d.base, d, beds);
    const room = rooms.find((r) => pointInPolygon(d.position, r.floor));
    if (d.src.confidence === "low") lowConfidence++;
    let label = ITEM_LABEL[category];
    if (category === "sink" && room && (room.kind === "bathroom" || room.kind === "toilet")) label = "Lavabo";
    const item: Item = {
      id: nextId(),
      category,
      position: [round(d.position[0]), round(d.y), round(d.position[1])],
      rotationY: round(d.yaw, 5),
      dimensions: [round(d.dims[0]), round(d.dims[1]), round(d.dims[2])],
      source: "scan",
      confidence: d.src.confidence ? CONFIDENCE_VALUE[d.src.confidence] : CONFIDENCE_VALUE.medium,
    };
    if (room) item.roomId = room.id;
    if (label) item.label = label;
    return item;
  });
  return { items, unknown, lowConfidence };
}
