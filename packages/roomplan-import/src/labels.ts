/** French labels and name ↔ kind mappings. */
import type { FloorMaterial, ItemCategory, RoomKind } from "@appart3d/scene";

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  living: "Séjour",
  bedroom: "Chambre",
  kitchen: "Cuisine",
  bathroom: "Salle de bain",
  toilet: "WC",
  hallway: "Entrée",
  office: "Bureau",
  dining: "Salle à manger",
  storage: "Rangement",
  other: "Pièce",
};

/** RoomPlan `CapturedRoom.Section.Label` (iOS 17) → RoomKind. `unidentified` → null. */
export function kindFromSectionLabel(label: string): RoomKind | null {
  switch (label) {
    case "livingRoom":
      return "living";
    case "bedroom":
      return "bedroom";
    case "kitchen":
      return "kitchen";
    case "bathroom":
      return "bathroom";
    case "diningRoom":
      return "dining";
    // Not emitted by RoomPlan today, accepted for forward compatibility.
    case "office":
      return "office";
    case "hallway":
    case "entrance":
      return "hallway";
    case "toilet":
    case "restroom":
      return "toilet";
    default:
      return null;
  }
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .trim();

const NAME_RULES: [RegExp, RoomKind][] = [
  [/salle a manger|dining/, "dining"],
  [/salle de bains?|salle d eau|\bsdb\b|douche|bath/, "bathroom"],
  [/\bwc\b|toilette|toilet/, "toilet"],
  [/sejour|salon|living|piece de vie|\bpiece a vivre/, "living"],
  [/chambre|bedroom|\bch\.? ?\d/, "bedroom"],
  [/cuisine|kitchen|kitchenette/, "kitchen"],
  [/entree|couloir|hall|degagement|corridor|palier/, "hallway"],
  [/bureau|office/, "office"],
  [/cellier|rangement|dressing|placard|buanderie|storage/, "storage"],
];

/** User-provided room name (French or English) → RoomKind, or null when unknown. */
export function kindFromName(name: string): RoomKind | null {
  const n = strip(name);
  for (const [re, kind] of NAME_RULES) if (re.test(n)) return kind;
  return null;
}

export function defaultFloorMaterial(kind: RoomKind): FloorMaterial {
  return kind === "bathroom" || kind === "toilet" || kind === "kitchen" ? "tile" : "wood";
}

export const FLOOR_COLOR: Record<FloorMaterial, string> = {
  wood: "#d9b48a",
  tile: "#e6e9ec",
  carpet: "#cdbfae",
  concrete: "#bdbab4",
};

export const ITEM_LABEL: Partial<Record<ItemCategory, string>> = {
  storage: "Rangement",
  refrigerator: "Réfrigérateur",
  stove: "Plaque de cuisson",
  bed: "Lit",
  sink: "Évier",
  washerDryer: "Lave-linge",
  toilet: "WC",
  bathtub: "Baignoire",
  oven: "Four",
  dishwasher: "Lave-vaisselle",
  table: "Table",
  sofa: "Canapé",
  chair: "Chaise",
  fireplace: "Cheminée",
  television: "Télévision",
  stairs: "Escalier",
  wardrobe: "Armoire",
  nightstand: "Table de chevet",
  coffeeTable: "Table basse",
  armchair: "Fauteuil",
  shelf: "Étagère",
  desk: "Bureau",
};

/** "3 objets", "1 objet" — French pluralization of a simple noun phrase. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}
