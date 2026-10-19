/**
 * @appart3d/catalog — public API (STABLE CONTRACT, used by apps/web).
 *
 * - <FurnitureModel item={...} /> renders one item in LOCAL space:
 *   origin = center of the footprint on the floor, facing +Z, scaled to item.dimensions.
 *   The caller applies item.position / item.rotationY on a parent <group>.
 * - CATALOG lists what the user can add from the "Ajouter un meuble" panel.
 * - theme exposes the shared palette + material factory so walls/floors match the furniture.
 */
export { FurnitureModel, type FurnitureModelProps } from "./FurnitureModel";
export { CATALOG, getCatalogEntry, type CatalogEntry, type CatalogVariant } from "./catalog";
export { theme, toonMaterial, type Theme, palette, getMaterial, toonGradientMap, type MaterialRole, type Highlight } from "./theme";

// Additional (pure) helpers — handy for previews, thumbnails and tests.
export { buildModel, buildParts, modelFor, resolveColor, attributesKey, type ModelInput, type BuiltModel } from "./model";
export { PERSON_PRESETS, personLook, type PersonLook } from "./builders/person";
export { MODELS, resolveVariant, type VariantDef } from "./builders";
export { getGeometry, partsBounds, partsTriangles } from "./geometry";
export type { Part, GeomSpec } from "./parts";
export { mix, darken, lighten, contrast } from "./color";
export {
  useCatalogThumbnail,
  renderCatalogThumbnail,
  getCachedThumbnail,
  thumbnailKey,
  thumbnailDimensions,
  frameBounds,
  THUMBNAIL_SIZE,
  THUMBNAIL_VIEW_DIR,
  type ThumbnailCamera,
} from "./thumbnail";
