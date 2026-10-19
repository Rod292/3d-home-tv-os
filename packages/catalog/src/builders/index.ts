import type { ItemCategory, Vec3 } from "@appart3d/scene";
import type { Build } from "./common";
import * as seat from "./seating";
import * as tab from "./tables";
import * as sto from "./storage";
import * as bedM from "./bed";
import * as kit from "./kitchen";
import * as bath from "./bathroom";
import * as deco from "./decor";
import * as coffee from "./coffee";
import * as disp from "./display";
import * as ex from "./extras";
import * as person from "./person";

export interface VariantDef {
  /** Full key, e.g. "sofa/modern". */
  key: string;
  /** French label. */
  label: string;
  build: Build;
  /** Placement note for callers (e.g. how to seat a person on a sofa). */
  placement?: string;
  defaultColor?: string;
  defaultDimensions?: Vec3;
}

const SITTING_NOTE =
  "Pieds au sol (y = 0), assise à ≈ 0,34·h (0,44 m pour h = 1,30). Poser sur un canapé / fauteuil : même rotationY, position.y = 0, " +
  "arrière de l'emprise (z = -d/2) contre l'avant du coussin de dossier (genoux ≈ d/2 − 0,18 m devant le centre).";

/** Every category's model variants. The first variant is the default. */
export const MODELS: Record<ItemCategory, VariantDef[]> = {
  storage: [
    { key: "storage/cabinet", label: "Meuble bas", build: sto.storageCabinet },
    { key: "storage/kitchen-counter", label: "Plan de travail", build: sto.storageKitchen, defaultColor: "#9db59a", defaultDimensions: [2.4, 0.9, 0.62] },
    { key: "storage/dresser", label: "Commode", build: sto.storageDresser, defaultColor: "#c4935f", defaultDimensions: [1.0, 0.85, 0.5] },
    { key: "storage/sideboard", label: "Buffet", build: sto.storageSideboard, defaultColor: "#5b7fa6", defaultDimensions: [1.6, 0.8, 0.45] },
  ],
  refrigerator: [{ key: "refrigerator/default", label: "Réfrigérateur", build: kit.refrigerator }],
  stove: [{ key: "stove/default", label: "Cuisinière", build: kit.stove }],
  bed: [
    { key: "bed/classic", label: "Lit bois", build: bedM.bedClassic },
    { key: "bed/upholstered", label: "Lit tapissé", build: bedM.bedUpholstered, defaultColor: "#efe4d2" },
    { key: "bed/platform", label: "Lit plateforme", build: bedM.bedPlatform, defaultColor: "#d99c82", defaultDimensions: [1.6, 0.7, 2.1] },
  ],
  sink: [
    { key: "sink/vanity", label: "Meuble vasque", build: kit.sinkVanity },
    { key: "sink/pedestal", label: "Lavabo sur colonne", build: kit.sinkPedestal, defaultColor: "#f4f6f5", defaultDimensions: [0.55, 0.85, 0.45] },
    { key: "sink/kitchen", label: "Évier de cuisine", build: kit.sinkKitchen, defaultColor: "#9db59a", defaultDimensions: [1.2, 0.9, 0.62] },
  ],
  washerDryer: [{ key: "washerDryer/default", label: "Lave-linge", build: kit.washerDryer }],
  toilet: [{ key: "toilet/default", label: "WC", build: bath.toilet }],
  bathtub: [
    { key: "bathtub/built-in", label: "Baignoire encastrée", build: bath.bathtubBuiltIn },
    { key: "bathtub/freestanding", label: "Baignoire îlot", build: bath.bathtubFreestanding, defaultDimensions: [1.6, 0.6, 0.8] },
  ],
  oven: [{ key: "oven/default", label: "Four", build: kit.oven }],
  dishwasher: [{ key: "dishwasher/default", label: "Lave-vaisselle", build: kit.dishwasher }],
  table: [
    { key: "table/classic", label: "Table rectangulaire", build: tab.tableClassic },
    { key: "table/round", label: "Table ronde", build: tab.tableRound, defaultDimensions: [1.1, 0.75, 1.1] },
    { key: "table/trestle", label: "Table à tréteaux", build: tab.tableTrestle, defaultColor: "#e6d3b3", defaultDimensions: [1.8, 0.75, 0.9] },
  ],
  sofa: [
    { key: "sofa/modern", label: "Canapé droit", build: seat.sofaModern },
    { key: "sofa/rounded", label: "Canapé arrondi", build: seat.sofaRounded, defaultColor: "#d38a66" },
    { key: "sofa/corner", label: "Canapé d'angle", build: seat.sofaCorner, defaultColor: "#8fae8b", defaultDimensions: [2.7, 0.85, 1.65] },
  ],
  chair: [
    { key: "chair/wood", label: "Chaise bois", build: seat.chairWood },
    { key: "chair/upholstered", label: "Chaise rembourrée", build: seat.chairUpholstered, defaultColor: "#e3b55b" },
    { key: "chair/stool", label: "Tabouret", build: seat.chairStool, defaultColor: "#d9774f", defaultDimensions: [0.38, 0.65, 0.38] },
    { key: "chair/office", label: "Chaise de bureau", build: seat.chairOffice, defaultColor: "#5b7fa6", defaultDimensions: [0.62, 1.05, 0.62] },
    { key: "chair/office-light", label: "Chaise de bureau (cadre clair)", build: seat.chairOfficeLight, defaultColor: "#6b7350", defaultDimensions: [0.66, 1.08, 0.62] },
  ],
  fireplace: [{ key: "fireplace/default", label: "Cheminée", build: deco.fireplace }],
  television: [{ key: "television/default", label: "Télévision", build: deco.television }],
  stairs: [{ key: "stairs/straight", label: "Escalier droit", build: deco.stairs }],
  desk: [
    { key: "desk/simple", label: "Bureau simple", build: tab.deskSimple },
    { key: "desk/drawers", label: "Bureau à caisson", build: tab.deskDrawers, defaultColor: "#c4935f" },
  ],
  wardrobe: [
    { key: "wardrobe/hinged", label: "Armoire à portes", build: sto.wardrobeHinged },
    { key: "wardrobe/sliding", label: "Armoire coulissante", build: sto.wardrobeSliding, defaultDimensions: [2.0, 2.2, 0.65] },
  ],
  shelf: [
    { key: "shelf/bookcase", label: "Bibliothèque", build: sto.shelfBookcase },
    { key: "shelf/cube", label: "Étagère à cases", build: sto.shelfCube, defaultColor: "#f4efe6", defaultDimensions: [1.5, 1.5, 0.39] },
    { key: "shelf/hifi", label: "Étagère hi-fi (livres, ampli, platine, horloge)", build: disp.shelfHifi, defaultColor: "#1f2023", defaultDimensions: [0.62, 1.5, 0.36] },
  ],
  nightstand: [{ key: "nightstand/default", label: "Table de chevet", build: sto.nightstand }],
  tvStand: [{ key: "tvStand/default", label: "Meuble TV", build: sto.tvStand }],
  lamp: [
    { key: "lamp/classic", label: "Lampe abat-jour", build: deco.lampClassic },
    { key: "lamp/globe", label: "Lampe globe", build: deco.lampGlobe, defaultColor: "#8fae8b", defaultDimensions: [0.3, 0.4, 0.3] },
    { key: "lamp/mushroom", label: "Lampe champignon", build: deco.lampMushroom, defaultColor: "#e3b55b", defaultDimensions: [0.32, 0.38, 0.32] },
    { key: "lamp/donut", label: "Lampe donut (verre)", build: deco.lampDonut, defaultColor: "#f6e7d2", defaultDimensions: [0.3, 0.32, 0.12] },
    { key: "lamp/donut-wall", label: "Lampe donut murale", build: deco.lampDonutWall, defaultColor: "#f6e7d2", defaultDimensions: [0.3, 0.3, 0.12] },
  ],
  floorLamp: [
    { key: "floorLamp/drum", label: "Lampadaire", build: deco.floorLampDrum },
    { key: "floorLamp/evedal", label: "Lampadaire EVEDAL (verre fumé)", build: deco.floorLampEvedal, defaultDimensions: [0.32, 1.5, 0.32] },
    { key: "floorLamp/arc", label: "Lampadaire arc", build: deco.floorLampArc, defaultDimensions: [1.3, 1.9, 0.4] },
  ],
  plant: [
    { key: "plant/bush", label: "Plante touffue", build: deco.plantBush },
    { key: "plant/leafy", label: "Plante à grandes feuilles", build: deco.plantLeafy, defaultColor: "#4f8f5f", defaultDimensions: [0.8, 0.9, 0.8] },
    { key: "plant/cactus", label: "Cactus", build: deco.plantCactus, defaultColor: "#79a86f", defaultDimensions: [0.3, 0.6, 0.3] },
    { key: "plant/tree", label: "Petit arbre", build: deco.plantTree, defaultColor: "#6aa36f", defaultDimensions: [0.7, 1.8, 0.7] },
  ],
  rug: [
    { key: "rug/rect", label: "Tapis rectangulaire", build: deco.rugRect },
    { key: "rug/round", label: "Tapis rond", build: deco.rugRound, defaultColor: "#8fae8b", defaultDimensions: [1.6, 0.015, 1.6] },
    { key: "rug/striped", label: "Tapis rayé", build: deco.rugStriped, defaultColor: "#5b7fa6" },
  ],
  artwork: [
    { key: "artwork/abstract", label: "Tableau abstrait", build: deco.artworkAbstract },
    { key: "artwork/landscape", label: "Paysage", build: deco.artworkLandscape, defaultColor: "#3a3a40" },
    { key: "artwork/photo", label: "Photo encadrée (image réelle)", build: deco.artworkPhoto, defaultColor: "#f4f2ee" },
  ],
  mirror: [
    { key: "mirror/rect", label: "Miroir rectangulaire", build: deco.mirrorRect },
    { key: "mirror/round", label: "Miroir rond", build: deco.mirrorRound, defaultDimensions: [0.6, 0.6, 0.03] },
  ],
  armchair: [
    { key: "armchair/club", label: "Fauteuil club", build: seat.armchairClub },
    { key: "armchair/lounge", label: "Fauteuil scandinave", build: seat.armchairLounge, defaultColor: "#8fae8b", defaultDimensions: [0.75, 0.8, 0.8] },
    { key: "armchair/swivel", label: "Fauteuil pivotant", build: seat.armchairSwivel, defaultColor: "#2f7d4f", defaultDimensions: [0.8, 0.74, 0.78] },
  ],
  coffeeTable: [
    { key: "coffeeTable/rect", label: "Table basse", build: tab.coffeeRect },
    { key: "coffeeTable/round", label: "Table basse ronde", build: tab.coffeeRound, defaultDimensions: [0.8, 0.4, 0.8] },
  ],
  shower: [{ key: "shower/default", label: "Douche", build: bath.shower }],
  espressoMachine: [{ key: "espressoMachine/e61", label: "Machine à espresso", build: coffee.espressoMachine }],
  coffeeGrinder: [{ key: "coffeeGrinder/single-dose", label: "Moulin à café", build: coffee.coffeeGrinder }],
  wallShelf: [
    { key: "wallShelf/collection", label: "Étagère avec collection", build: disp.wallShelfCollection },
    { key: "wallShelf/plain", label: "Étagère vide", build: disp.wallShelfPlain },
  ],
  speaker: [
    { key: "speaker/bookshelf", label: "Enceinte", build: disp.speakerBookshelf },
    { key: "speaker/accent", label: "Enceinte (membrane orange)", build: disp.speakerAccent },
    { key: "speaker/homepod-mini", label: "HomePod mini", build: disp.speakerHomePodMini, defaultColor: "#4a4d52", defaultDimensions: [0.098, 0.084, 0.098] },
  ],
  monitor: [{ key: "monitor/arm", label: "Écran sur bras", build: disp.monitorArm }],
  laptop: [{ key: "laptop/open", label: "Ordinateur portable", build: disp.laptop }],
  bicycle: [{ key: "bicycle/road", label: "Vélo de route", build: ex.bicycle }],
  coatRack: [
    { key: "coatRack/pole", label: "Portemanteau sur pied", build: ex.coatRackPole },
    { key: "coatRack/hanging", label: "Portemanteau garni", build: ex.coatRackHanging, defaultDimensions: [0.6, 1.8, 0.6] },
  ],
  pendantLamp: [
    { key: "pendantLamp/cage", label: "Suspension rotin", build: ex.pendantCage },
    { key: "pendantLamp/globe", label: "Suspension boule papier", build: ex.pendantGlobe, defaultColor: "#fbeed6", defaultDimensions: [0.4, 0.9, 0.4] },
    { key: "pendantLamp/dome", label: "Suspension dôme", build: ex.pendantDome, defaultColor: "#5f8a68", defaultDimensions: [0.38, 0.8, 0.38] },
    { key: "pendantLamp/bulb", label: "Ampoule nue", build: ex.pendantBulb, defaultColor: "#c9a25e", defaultDimensions: [0.1, 0.8, 0.1] },
  ],
  ceilingFan: [{ key: "ceilingFan/default", label: "Ventilateur de plafond", build: ex.ceilingFan }],
  radiator: [{ key: "radiator/panel", label: "Radiateur à colonnes", build: ex.radiator }],
  curtain: [
    { key: "curtain/pair", label: "Paire de rideaux", build: ex.curtainPair },
    { key: "curtain/single", label: "Rideau simple", build: ex.curtainSingle, defaultDimensions: [1.2, 2.4, 0.14] },
  ],
  person: [
    {
      key: "person/sitting",
      label: "Personne assise",
      build: person.personSitting,
      defaultDimensions: [0.5, 1.3, 0.75],
      placement: SITTING_NOTE,
    },
    { key: "person/standing", label: "Personne debout", build: person.personStanding, defaultDimensions: [0.5, 1.75, 0.3] },
    {
      key: "person/sitting-relaxed",
      label: "Personne assise détendue",
      build: person.personSittingRelaxed,
      defaultDimensions: [0.8, 1.3, 0.8],
      placement: `${SITTING_NOTE} Le bras droit (+X) repose sur le dossier : le corps est décalé vers -X dans l'emprise.`,
    },
  ],
};

/** Resolve a variant key ("sofa/modern" or just "modern"); falls back to the default variant. */
export function resolveVariant(category: ItemCategory, variant?: string): VariantDef {
  const list = MODELS[category];
  const fallback = list[0] as VariantDef;
  if (!variant) return fallback;
  const v = variant.includes("/") ? variant : `${category}/${variant}`;
  return list.find((x) => x.key === v) ?? fallback;
}
