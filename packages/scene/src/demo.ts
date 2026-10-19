import { SCENE_VERSION, type Item, type Scene } from "./types";

const PI = Math.PI;
const H = 2.6; // ceiling height
const T = 0.12; // wall thickness

let n = 0;
const item = (i: Omit<Item, "id" | "source">): Item => ({ id: `item_demo_${++n}`, source: "demo", ...i });

/**
 * Hand-made demo apartment (~57 m²): open living/kitchen, bedroom, bathroom.
 * Footprint x ∈ [0, 9.5], z ∈ [0, 6]. Used by the web app before any scan exists.
 */
export const demoScene: Scene = {
  version: SCENE_VERSION,
  id: "scene_demo",
  name: "Appartement démo",
  units: "m",
  rooms: [
    { id: "room_living", name: "Séjour & cuisine", kind: "living", floor: [[0, 0], [6, 0], [6, 6], [0, 6]], floorMaterial: "wood", floorColor: "#d9b48a" },
    { id: "room_bedroom", name: "Chambre", kind: "bedroom", floor: [[6, 0], [9.5, 0], [9.5, 3.8], [6, 3.8]], floorMaterial: "wood", floorColor: "#c99f74" },
    { id: "room_bath", name: "Salle de bain", kind: "bathroom", floor: [[6, 3.8], [9.5, 3.8], [9.5, 6], [6, 6]], floorMaterial: "tile", floorColor: "#e6e9ec" },
  ],
  walls: [
    { id: "wall_s", start: [0, 0], end: [9.5, 0], height: H, thickness: T },
    { id: "wall_e", start: [9.5, 0], end: [9.5, 6], height: H, thickness: T },
    { id: "wall_n", start: [9.5, 6], end: [0, 6], height: H, thickness: T },
    { id: "wall_w", start: [0, 6], end: [0, 0], height: H, thickness: T },
    { id: "wall_mid", start: [6, 0], end: [6, 6], height: H, thickness: 0.1 },
    { id: "wall_bed_bath", start: [6, 3.8], end: [9.5, 3.8], height: H, thickness: 0.1 },
  ],
  openings: [
    { id: "op_entry", wallId: "wall_w", kind: "door", offset: 4.6, width: 0.9, height: 2.05, sill: 0 },
    { id: "op_win_living", wallId: "wall_s", kind: "window", offset: 1.6, width: 1.6, height: 1.4, sill: 0.9 },
    { id: "op_win_bed", wallId: "wall_s", kind: "window", offset: 7.9, width: 1.4, height: 1.4, sill: 0.9 },
    { id: "op_win_bath", wallId: "wall_e", kind: "window", offset: 5.0, width: 0.6, height: 0.6, sill: 1.5 },
    { id: "op_door_bed", wallId: "wall_mid", kind: "door", offset: 3.2, width: 0.85, height: 2.05, sill: 0 },
    { id: "op_door_bath", wallId: "wall_mid", kind: "door", offset: 4.9, width: 0.8, height: 2.05, sill: 0 },
  ],
  items: [
    // Living
    item({ category: "sofa", position: [2.2, 0, 5.4], rotationY: PI, dimensions: [2.2, 0.85, 0.95], color: "#5b7fa6", roomId: "room_living", label: "Canapé" }),
    item({ category: "rug", position: [2.2, 0, 3.9], rotationY: 0, dimensions: [2.4, 0.01, 1.7], color: "#e8d5b5", roomId: "room_living" }),
    item({ category: "coffeeTable", position: [2.2, 0, 4.1], rotationY: 0, dimensions: [1.1, 0.4, 0.6], color: "#a77b52", roomId: "room_living" }),
    item({ category: "armchair", position: [0.75, 0, 3.6], rotationY: PI / 2, dimensions: [0.85, 0.8, 0.85], color: "#d9824b", roomId: "room_living" }),
    item({ category: "tvStand", position: [2.2, 0, 2.6], rotationY: 0, dimensions: [1.6, 0.5, 0.4], color: "#f0ebe3", roomId: "room_living" }),
    item({ category: "television", position: [2.2, 0.5, 2.6], rotationY: 0, dimensions: [1.2, 0.7, 0.08], roomId: "room_living" }),
    item({ category: "plant", position: [0.4, 0, 5.6], rotationY: 0, dimensions: [0.5, 1.2, 0.5], roomId: "room_living" }),
    item({ category: "floorLamp", position: [3.6, 0, 5.6], rotationY: 0, dimensions: [0.4, 1.6, 0.4], roomId: "room_living" }),
    item({ category: "shelf", position: [0.2, 0, 1.0], rotationY: PI / 2, dimensions: [1.2, 1.8, 0.35], color: "#f0ebe3", roomId: "room_living" }),
    // Kitchen (south-east corner of the open space)
    item({ category: "storage", variant: "storage/kitchen-counter", position: [4.4, 0, 0.3], rotationY: 0, dimensions: [1.2, 0.9, 0.6], color: "#f4f1ea", roomId: "room_living", label: "Plan de travail" }),
    item({ category: "sink", position: [3.5, 0, 0.3], rotationY: 0, dimensions: [0.6, 0.9, 0.6], color: "#f4f1ea", roomId: "room_living" }),
    item({ category: "stove", position: [5.0, 0, 0.3], rotationY: 0, dimensions: [0.6, 0.9, 0.6], roomId: "room_living" }),
    item({ category: "refrigerator", position: [5.6, 0, 0.35], rotationY: 0, dimensions: [0.7, 1.8, 0.7], roomId: "room_living" }),
    item({ category: "table", position: [4.6, 0, 1.9], rotationY: 0, dimensions: [1.4, 0.75, 0.8], color: "#b98a5e", roomId: "room_living" }),
    item({ category: "chair", position: [4.2, 0, 1.35], rotationY: 0, dimensions: [0.45, 0.85, 0.45], color: "#2f3a4a", roomId: "room_living" }),
    item({ category: "chair", position: [5.0, 0, 1.35], rotationY: 0, dimensions: [0.45, 0.85, 0.45], color: "#2f3a4a", roomId: "room_living" }),
    item({ category: "chair", position: [4.2, 0, 2.45], rotationY: PI, dimensions: [0.45, 0.85, 0.45], color: "#2f3a4a", roomId: "room_living" }),
    item({ category: "chair", position: [5.0, 0, 2.45], rotationY: PI, dimensions: [0.45, 0.85, 0.45], color: "#2f3a4a", roomId: "room_living" }),
    // Bedroom
    item({ category: "bed", position: [8.2, 0, 2.75], rotationY: PI, dimensions: [1.6, 0.95, 2.05], color: "#eae4f2", roomId: "room_bedroom" }),
    item({ category: "nightstand", position: [7.1, 0, 3.5], rotationY: PI, dimensions: [0.45, 0.5, 0.4], color: "#a77b52", roomId: "room_bedroom" }),
    item({ category: "nightstand", position: [9.25, 0, 3.5], rotationY: PI, dimensions: [0.45, 0.5, 0.4], color: "#a77b52", roomId: "room_bedroom" }),
    item({ category: "lamp", position: [7.1, 0.5, 3.5], rotationY: 0, dimensions: [0.25, 0.4, 0.25], roomId: "room_bedroom" }),
    item({ category: "wardrobe", position: [6.35, 0, 0.95], rotationY: PI / 2, dimensions: [1.6, 2.1, 0.6], color: "#f0ebe3", roomId: "room_bedroom" }),
    item({ category: "desk", position: [8.6, 0, 0.35], rotationY: 0, dimensions: [1.1, 0.75, 0.55], color: "#b98a5e", roomId: "room_bedroom" }),
    item({ category: "chair", position: [8.6, 0, 0.85], rotationY: PI, dimensions: [0.45, 0.85, 0.45], color: "#d9824b", roomId: "room_bedroom" }),
    // Bathroom
    item({ category: "bathtub", position: [7.0, 0, 5.6], rotationY: PI, dimensions: [1.7, 0.55, 0.75], roomId: "room_bath" }),
    item({ category: "toilet", position: [9.15, 0, 5.55], rotationY: -PI / 2, dimensions: [0.4, 0.8, 0.65], roomId: "room_bath" }),
    item({ category: "sink", position: [9.2, 0, 4.3], rotationY: -PI / 2, dimensions: [0.6, 0.85, 0.45], color: "#ffffff", roomId: "room_bath" }),
    item({ category: "mirror", position: [9.42, 1.2, 4.3], rotationY: -PI / 2, dimensions: [0.6, 0.8, 0.03], roomId: "room_bath" }),
  ],
  meta: { createdAt: "2026-10-09T00:00:00.000Z", updatedAt: "2026-10-09T00:00:00.000Z", source: "demo" },
};
