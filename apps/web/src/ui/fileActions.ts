import { useStore } from "../state/store";
import { downloadText, loadExampleScan, parseSceneJson, sceneToJson, slugify, type LoadResult } from "../lib/io";

/** File-level actions shared by the "Fichier" menu, the welcome sheet and window drag & drop. */

const s = () => useStore.getState();

export function applyLoad({ scene, warnings, fromScan }: LoadResult) {
  s().loadScene(scene);
  const lowConfidence = scene.items.filter((i) => i.source === "scan" && i.confidence !== undefined && i.confidence < 0.5).length;
  s().toast(fromScan ? `Scan importé : ${scene.rooms.length} pièce(s), ${scene.items.length} objet(s).` : `« ${scene.name} » chargé.`);
  for (const w of warnings.slice(0, 4)) s().toast(w, "warn");
  if (lowConfidence > 0) {
    // Point the user at the objects to check right away.
    s().openLeft("objects", "review");
  }
}

function fail(err: unknown) {
  s().toast(err instanceof Error ? err.message : "Import impossible.", "error");
}

export async function importFile(file: File) {
  if (!/\.json$/i.test(file.name) && file.type !== "application/json") {
    s().toast("Choisissez un fichier .json (scan iPhone .appart3d.json ou scène exportée).", "error");
    return;
  }
  try {
    applyLoad(parseSceneJson(await file.text(), file.name));
  } catch (err) {
    fail(err);
  }
}

/** Opens the system file picker (no permanent <input> needed). */
export function pickFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void importFile(f);
  };
  input.click();
}

export async function loadExample() {
  try {
    applyLoad(await loadExampleScan());
  } catch (err) {
    fail(err);
  }
}

export function exportScene() {
  const scene = s().scene;
  downloadText(sceneToJson(scene), `${slugify(scene.name)}.appart3d-scene.json`);
  s().toast("Scène exportée.");
}

export function resetToDemo(ask = true) {
  if (ask && !window.confirm("Réinitialiser ? L'aménagement actuel sera remplacé par l'appartement démo (annulable avec Ctrl+Z).")) return;
  s().resetToDemo();
  s().toast("Appartement démo restauré.");
}
