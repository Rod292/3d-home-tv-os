import type { ItemMount, ItemCategory, Vec3 } from "@appart3d/scene";
import { MODELS } from "./builders";

export interface CatalogVariant {
  /** Full variant key, e.g. "sofa/modern" (store this in `Item.variant`). */
  key: string;
  /** French UI label. */
  label: string;
  /** Overrides the entry's default color when this variant is picked. */
  defaultColor?: string;
  /** Overrides the entry's default dimensions when this variant is picked. */
  defaultDimensions?: Vec3;
  /** Placement note (e.g. how to seat a person on a sofa). */
  placement?: string;
}

export interface CatalogEntry {
  category: ItemCategory;
  /** French UI label. */
  label: string;
  group: "Salon" | "Chambre" | "Cuisine" | "Salle de bain" | "Bureau" | "Déco" | "Divers";
  /** How the item is held by default (see Item.mount). Absent = "floor". */
  mount?: ItemMount;
  defaultDimensions: Vec3;
  defaultColor: string;
  /** Default elevation of the base (e.g. artwork on a wall); usually 0. */
  defaultElevation?: number;
  /** Model variants; the first one is the default. */
  variants?: CatalogVariant[];
  /** Default variant key (same as variants[0].key). */
  defaultVariant?: string;
  /**
   * Placement / usage note for callers. "person": see `PERSON_PRESETS` and the variant notes —
   * sitting variants have their feet on the floor (y = 0) and the seat at ≈ 0.34·h.
   */
  placement?: string;
  /** Free-form `Item.attributes` understood by the builders (name → accepted values). */
  attributes?: Record<string, string>;
}

type BaseEntry = Omit<CatalogEntry, "variants" | "defaultVariant">;

const BASE: BaseEntry[] = [
  // Salon
  { category: "sofa", label: "Canapé", group: "Salon", defaultDimensions: [2.2, 0.85, 0.95], defaultColor: "#5b7fa6" },
  { category: "armchair", label: "Fauteuil", group: "Salon", defaultDimensions: [0.85, 0.8, 0.85], defaultColor: "#d9824b" },
  { category: "coffeeTable", label: "Table basse", group: "Salon", defaultDimensions: [1.1, 0.4, 0.6], defaultColor: "#a77b52" },
  { category: "tvStand", label: "Meuble TV", group: "Salon", defaultDimensions: [1.6, 0.5, 0.42], defaultColor: "#efe7da" },
  { category: "television", label: "Télévision", group: "Salon", defaultDimensions: [1.25, 0.78, 0.22], defaultColor: "#2f3136", defaultElevation: 0 },
  { category: "fireplace", label: "Cheminée", group: "Salon", defaultDimensions: [1.3, 1.1, 0.4], defaultColor: "#efe6d8" },
  { category: "storage", label: "Rangement", group: "Salon", defaultDimensions: [1.2, 0.85, 0.45], defaultColor: "#e8dcc6" },
  { category: "shelf", label: "Bibliothèque", group: "Salon", defaultDimensions: [0.9, 1.9, 0.32], defaultColor: "#e9dfcf" },
  { category: "stairs", label: "Escalier", group: "Salon", defaultDimensions: [1.0, 2.6, 3.4], defaultColor: "#c99a68" },
  // Chambre
  { category: "bed", label: "Lit", group: "Chambre", defaultDimensions: [1.6, 0.95, 2.1], defaultColor: "#9cb89a" },
  { category: "nightstand", label: "Table de chevet", group: "Chambre", defaultDimensions: [0.45, 0.5, 0.4], defaultColor: "#c4935f" },
  { category: "wardrobe", label: "Armoire", group: "Chambre", defaultDimensions: [1.5, 2.1, 0.6], defaultColor: "#efe7da" },
  // Cuisine
  { category: "table", label: "Table", group: "Cuisine", defaultDimensions: [1.6, 0.75, 0.9], defaultColor: "#c4935f" },
  { category: "chair", label: "Chaise", group: "Cuisine", defaultDimensions: [0.46, 0.86, 0.5], defaultColor: "#c4935f" },
  { category: "refrigerator", label: "Réfrigérateur", group: "Cuisine", defaultDimensions: [0.7, 1.85, 0.68], defaultColor: "#eef1f2" },
  { category: "stove", label: "Cuisinière", group: "Cuisine", defaultDimensions: [0.6, 0.9, 0.6], defaultColor: "#e9ecee" },
  { category: "oven", label: "Four", group: "Cuisine", defaultDimensions: [0.6, 0.6, 0.58], defaultColor: "#3c3f46" },
  { category: "dishwasher", label: "Lave-vaisselle", group: "Cuisine", defaultDimensions: [0.6, 0.85, 0.6], defaultColor: "#dfe3e6" },
  // Salle de bain
  { category: "sink", label: "Lavabo / évier", group: "Salle de bain", defaultDimensions: [0.8, 0.9, 0.5], defaultColor: "#b98a5e" },
  { category: "toilet", label: "WC", group: "Salle de bain", defaultDimensions: [0.4, 0.8, 0.68], defaultColor: "#f7f8f7" },
  { category: "bathtub", label: "Baignoire", group: "Salle de bain", defaultDimensions: [1.7, 0.58, 0.75], defaultColor: "#f7f8f7" },
  { category: "shower", label: "Douche", group: "Salle de bain", defaultDimensions: [0.9, 2.0, 0.9], defaultColor: "#f4f6f5" },
  { category: "washerDryer", label: "Lave-linge", group: "Salle de bain", defaultDimensions: [0.6, 0.85, 0.6], defaultColor: "#f4f5f4" },
  { category: "mirror", label: "Miroir", group: "Salle de bain", mount: "wall", defaultDimensions: [0.6, 0.8, 0.03], defaultColor: "#c4935f", defaultElevation: 1.1 },
  // Bureau
  { category: "desk", label: "Bureau", group: "Bureau", defaultDimensions: [1.3, 0.75, 0.65], defaultColor: "#e9d9bd" },
  // Déco
  { category: "lamp", label: "Lampe", group: "Déco", defaultDimensions: [0.32, 0.5, 0.32], defaultColor: "#d9774f" },
  { category: "floorLamp", label: "Lampadaire", group: "Déco", defaultDimensions: [0.45, 1.6, 0.45], defaultColor: "#3a3a40" },
  { category: "plant", label: "Plante", group: "Déco", defaultDimensions: [0.55, 1.1, 0.55], defaultColor: "#5f9e6e" },
  { category: "rug", label: "Tapis", group: "Déco", defaultDimensions: [2.0, 0.015, 1.4], defaultColor: "#d9774f" },
  { category: "artwork", label: "Tableau", group: "Déco", mount: "wall", defaultDimensions: [0.7, 0.5, 0.035], defaultColor: "#b98a5e", defaultElevation: 1.2 },
  // Ceiling pieces: defaultElevation assumes a 2.5 m ceiling (2.5 − height); the web app
  // re-computes it from the actual wall height so the top touches the ceiling.
  { category: "pendantLamp", label: "Suspension", group: "Déco", mount: "ceiling", defaultDimensions: [0.35, 0.9, 0.35], defaultColor: "#c99a5b", defaultElevation: 1.6 },
  { category: "ceilingFan", label: "Ventilateur de plafond", group: "Déco", mount: "ceiling", defaultDimensions: [1.2, 0.4, 1.2], defaultColor: "#b98a5e", defaultElevation: 2.1 },
  { category: "curtain", label: "Rideaux", group: "Déco", mount: "wall", defaultDimensions: [1.8, 2.4, 0.14], defaultColor: "#d9a07e", defaultElevation: 0.05 },
  // Divers
  { category: "bicycle", label: "Vélo", group: "Divers", defaultDimensions: [1.72, 1.0, 0.44], defaultColor: "#d9774f" },
  { category: "coatRack", label: "Portemanteau", group: "Divers", defaultDimensions: [0.5, 1.8, 0.5], defaultColor: "#b98a5e" },
  { category: "espressoMachine", label: "Machine à espresso", group: "Cuisine", defaultDimensions: [0.25, 0.36, 0.42], defaultColor: "#c9cdd1", defaultElevation: 0.9 },
  { category: "coffeeGrinder", label: "Moulin à café", group: "Cuisine", defaultDimensions: [0.13, 0.38, 0.24], defaultColor: "#2b2b2e", defaultElevation: 0.9 },
  { category: "wallShelf", label: "Étagère murale", group: "Déco", mount: "wall", defaultDimensions: [1.6, 0.45, 0.25], defaultColor: "#dcb88a", defaultElevation: 1.7 },
  { category: "speaker", label: "Enceinte", group: "Salon", defaultDimensions: [0.17, 0.28, 0.22], defaultColor: "#232327" },
  { category: "monitor", label: "Écran", group: "Bureau", defaultDimensions: [0.62, 0.55, 0.35], defaultColor: "#d9d9dc", defaultElevation: 0.75 },
  { category: "laptop", label: "Ordinateur portable", group: "Bureau", defaultDimensions: [0.31, 0.21, 0.22], defaultColor: "#bfc2c6", defaultElevation: 0.75 },
  {
    category: "person",
    label: "Personne",
    group: "Divers",
    defaultDimensions: [0.5, 1.3, 0.75],
    defaultColor: "#d9774f",
    placement:
      "Assise : pieds au sol (y = 0), assise à ≈ 0,34·h ; placer avec la rotationY du siège, position.y = 0, l'arrière de l'emprise contre le coussin de dossier. Debout : posée au sol.",
    attributes: {
      skin: "hex (#f1c7a5)",
      hair: "hex (#4a3428)",
      hairStyle: "short | long | bun",
      top: "hex (t-shirt ; défaut = item.color)",
      bottom: "hex (#3f4a5c)",
      bottomStyle: "pants | shorts | skirt",
      headwear: "none | cap | bandana",
      headwearColor: "hex (#8e8a86)",
      glasses: "none | on-cap | on-shirt",
      glassesColor: "hex (#2b2b2e ; couleur claire = verres miroir)",
      shoes: "hex (#f4f2ee)",
    },
  },
  { category: "radiator", label: "Radiateur", group: "Divers", mount: "wall", defaultDimensions: [0.8, 0.6, 0.1], defaultColor: "#f4f5f4", defaultElevation: 0.1 },
];

export const CATALOG: CatalogEntry[] = BASE.map((e) => {
  const variants: CatalogVariant[] = MODELS[e.category].map((v) => {
    const out: CatalogVariant = { key: v.key, label: v.label };
    if (v.defaultColor) out.defaultColor = v.defaultColor;
    if (v.defaultDimensions) out.defaultDimensions = v.defaultDimensions;
    if (v.placement) out.placement = v.placement;
    return out;
  });
  return { ...e, variants, defaultVariant: variants[0]?.key };
});

const byCategory = new Map(CATALOG.map((e) => [e.category, e] as const));

export function getCatalogEntry(category: ItemCategory): CatalogEntry | undefined {
  return byCategory.get(category);
}
