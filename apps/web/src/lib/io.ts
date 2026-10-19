import { validateScene, type Scene } from "@appart3d/scene";
import { importRoomPlan, isRoomPlanData, isRoomPlanEnvelope } from "@appart3d/roomplan-import";

export interface LoadResult {
  scene: Scene;
  warnings: string[];
  fromScan: boolean;
}

/** Parses a user-provided JSON: either an iOS RoomPlan envelope or an Appart3D scene. Throws French messages. */
export function parseSceneJson(text: string, fileName = "scan"): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON lisible.");
  }
  const scanName = fileName.replace(/\.appart3d\.json$|\.json$/i, "") || "Scan";
  if (isRoomPlanEnvelope(data)) return importScan(data, scanName);
  const errors = validateScene(data);
  if (errors.length) {
    // Not an Appart3D scene: maybe a bare CapturedRoom / CapturedStructure.
    // (Checked after validateScene because isRoomPlanData also matches Appart3D scenes.)
    if (isRoomPlanData(data) && !(typeof data === "object" && data !== null && "version" in data && "items" in data)) return importScan(data, scanName);
    const more = errors.length > 3 ? ` (+${errors.length - 3})` : "";
    throw new Error(`Scène invalide : ${errors.slice(0, 3).join(" ; ")}${more}`);
  }
  return { scene: data as Scene, warnings: [], fromScan: false };
}

/**
 * Runs the RoomPlan importer. `importRoomPlan` may throw a `RoomPlanImportError` whose message is
 * already in French — it propagates as-is so the caller can show it in a toast.
 */
export function importScan(data: unknown, name: string): LoadResult {
  const { scene, warnings } = importRoomPlan(data, { name });
  const errors = validateScene(scene);
  if (errors.length) throw new Error(`Le scan importé est incohérent : ${errors.slice(0, 3).join(" ; ")}`);
  const withMeta: Scene = warnings.length ? { ...scene, meta: { ...scene.meta, importWarnings: warnings } } : scene;
  return { scene: withMeta, warnings, fromScan: true };
}

/** Loads the example scan shipped with the importer (lazy chunk, ~90 kB). */
export async function loadExampleScan(): Promise<LoadResult> {
  const mod = (await import("@appart3d/roomplan-import/demo-scan.appart3d.json")) as { default: unknown };
  return importScan(mod.default, "Scan exemple");
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "appartement"
  );
}

export function sceneToJson(scene: Scene): string {
  const out: Scene = { ...scene, meta: { ...scene.meta, updatedAt: new Date().toISOString() } };
  return JSON.stringify(out, null, 2);
}

export function downloadText(text: string, fileName: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
