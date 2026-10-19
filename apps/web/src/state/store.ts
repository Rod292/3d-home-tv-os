import { create } from "zustand";
import { produce, type Draft } from "immer";
import { createId, demoScene, validateScene, type Item, type ItemCategory, type ItemMount, type Scene, type Vec2 } from "@appart3d/scene";
import { getCatalogEntry } from "@appart3d/catalog";
import { emptyHistory, record, redo as historyRedo, undo as historyUndo, type History } from "./history";
import { cameraBus, viewState } from "./view";
import { defaultElevationFor, effectiveMount } from "./mount";
import { placeItem } from "../lib/placement";
import { ceilingHeightAt, ceilingItemY, snapToWall } from "../lib/mount";
import { normalizeAngle, snapToGridAngle } from "./angles";
import { loadDaylightPref, loadNightPref, saveDaylightPref, saveNightPref, type DaylightMode } from "./night";

/** "home": Maison mode (smart-home control, see state/home.ts). */
export type Mode = "navigate" | "arrange" | "rooms" | "photo" | "home";
export type PhotoView = "orbit" | "eye";
export type LeftTab = "catalog" | "objects";
export type ObjectFilter = "all" | "review" | "conflicts";
export type Overlay = "help" | "welcome" | null;
/** Camera kind of the current slideshow shot (drives cutaway walls / ceilings like the photo views). */
export type SlideCam = "iso" | "eye" | "fly";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "warn" | "error";
}

export const STORAGE_KEY = "appart3d:scene:v1";

export interface AppState {
  scene: Scene;
  history: History<Scene>;
  /** Scene at the start of an ongoing gesture (drag); recorded once when the gesture ends. */
  gestureBase: Scene | null;

  mode: Mode;
  /** Mode to come back to when leaving photo mode. */
  lastEditMode: Exclude<Mode, "photo" | "home">;
  selectedItemId: string | null;
  hoveredItemId: string | null;
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  wallsCut: boolean;
  dragging: boolean;
  photoView: PhotoView;
  photoFov: number;
  /** Left panel (catalog / objects list) open in "Aménager" mode. */
  catalogOpen: boolean;
  leftTab: LeftTab;
  objectFilter: ObjectFilter;
  overlay: Overlay;
  toasts: Toast[];
  /** "Version nuit": interior lights on. UI preference (not part of the scene). */
  night: boolean;
  /**
   * Follow the sun (`auto`, when the home bridge reports it) or force day / night. With a known sun,
   * `night` mirrors it (sun below the horizon) and the 3D blends continuously through dusk.
   */
  daylight: DaylightMode;
  /** Solar elevation (degrees) from the home bridge; null = unknown (no bridge). */
  sunElevation: number | null;
  /** "Mode diaporama": cinematic auto-play, all UI hidden. */
  slideshow: boolean;
  slidePaused: boolean;
  slideCam: SlideCam;
  /** What to restore when the slideshow ends. */
  slideRestore: { mode: Mode; night: boolean; selectedItemId: string | null; selectedRoomId: string | null } | null;

  edit: (recipe: (draft: Draft<Scene>) => void, key?: string) => void;
  beginGesture: () => void;
  gestureUpdate: (recipe: (draft: Draft<Scene>) => void) => void;
  endGesture: (key?: string) => void;
  undo: () => void;
  redo: () => void;
  loadScene: (scene: Scene) => void;
  resetToDemo: () => void;

  setMode: (mode: Mode) => void;
  selectItem: (id: string | null) => void;
  hoverItem: (id: string | null) => void;
  selectRoom: (id: string | null) => void;
  hoverRoom: (id: string | null) => void;
  setWallsCut: (cut: boolean) => void;
  setDragging: (dragging: boolean) => void;
  setPhotoView: (view: PhotoView) => void;
  setPhotoFov: (fov: number) => void;
  setCatalogOpen: (open: boolean) => void;
  /** Opens the left panel on a given tab (and optional objects filter). */
  openLeft: (tab: LeftTab, filter?: ObjectFilter) => void;
  setObjectFilter: (filter: ObjectFilter) => void;
  setOverlay: (overlay: Overlay) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  /** `persist: false` for automatic switches (slideshow, URL) that must not change the saved preference. */
  setNight: (night: boolean, persist?: boolean) => void;
  toggleNight: () => void;
  setDaylight: (mode: DaylightMode, persist?: boolean) => void;
  setSunElevation: (elevation: number | null) => void;
  startSlideshow: () => void;
  /** `explore`: the viewer grabbed the 3D view — keep day/night as shown and navigate freely from there. */
  stopSlideshow: (opts?: { explore?: boolean }) => void;
  setSlidePaused: (paused: boolean) => void;
  setSlideCam: (cam: SlideCam) => void;

  /** Adds a catalog item near `at` (floor point) or the screen center, and selects it. */
  addItem: (category: ItemCategory, opts?: { at?: Vec2; variant?: string }) => void;
  updateItem: (id: string, recipe: (item: Draft<Item>) => void, key?: string) => void;
  removeItem: (id: string) => void;
  removeSelected: () => void;
  /** Marks a scanned item as checked by the user (confidence = 1). */
  markVerified: (id: string) => void;
  setItemMount: (id: string, mount: ItemMount) => void;
  /** Selects an item (switching to "Aménager") and frames it with the camera. */
  focusItem: (id: string) => void;
  duplicateSelected: () => void;
  rotateSelected: (deg: number) => void;
}

function loadInitialScene(): Scene {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (validateScene(parsed).length === 0) return parsed as Scene;
    }
  } catch {
    /* storage unavailable or corrupted: fall back to the demo */
  }
  return demoScene;
}

let toastSeq = 0;

export const useStore = create<AppState>()((set, get) => ({
  scene: loadInitialScene(),
  history: emptyHistory<Scene>(),
  gestureBase: null,

  mode: "arrange",
  lastEditMode: "arrange",
  selectedItemId: null,
  hoveredItemId: null,
  selectedRoomId: null,
  hoveredRoomId: null,
  wallsCut: true,
  dragging: false,
  photoView: "orbit",
  photoFov: 50,
  catalogOpen: !(typeof window !== "undefined" && window.matchMedia?.("(max-width: 720px)").matches),
  leftTab: "catalog",
  objectFilter: "all",
  overlay: null,
  toasts: [],
  night: loadNightPref(),
  daylight: loadDaylightPref(),
  sunElevation: null,
  slideshow: false,
  slidePaused: false,
  slideCam: "iso",
  slideRestore: null,

  edit: (recipe, key) => {
    const { scene, history } = get();
    const next = produce(scene, recipe);
    if (next === scene) return;
    set({ scene: next, history: record(history, scene, key) });
  },
  beginGesture: () => set({ gestureBase: get().scene }),
  gestureUpdate: (recipe) => set({ scene: produce(get().scene, recipe) }),
  endGesture: (key) => {
    const { gestureBase, scene, history } = get();
    if (gestureBase && gestureBase !== scene) set({ history: record(history, gestureBase, key), gestureBase: null });
    else set({ gestureBase: null });
  },
  undo: () => {
    const r = historyUndo(get().history, get().scene);
    if (r) set({ scene: r.value, history: r.history, ...pruneSelection(r.value, get()) });
  },
  redo: () => {
    const r = historyRedo(get().history, get().scene);
    if (r) set({ scene: r.value, history: r.history, ...pruneSelection(r.value, get()) });
  },
  loadScene: (scene) => {
    const prev = get().scene;
    set({
      scene,
      history: record(get().history, prev),
      selectedItemId: null,
      hoveredItemId: null,
      selectedRoomId: null,
      hoveredRoomId: null,
    });
  },
  resetToDemo: () => {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    get().loadScene(demoScene);
  },

  setMode: (mode) =>
    set((s) => ({
      mode,
      lastEditMode: mode === "photo" || mode === "home" ? s.lastEditMode : mode,
      selectedItemId: mode === "arrange" ? s.selectedItemId : null,
      selectedRoomId: mode === "rooms" ? s.selectedRoomId : null,
      hoveredItemId: null,
      hoveredRoomId: null,
    })),
  selectItem: (id) => set({ selectedItemId: id }),
  hoverItem: (id) => {
    if (get().hoveredItemId !== id) set({ hoveredItemId: id });
  },
  selectRoom: (id) => set({ selectedRoomId: id }),
  hoverRoom: (id) => {
    if (get().hoveredRoomId !== id) set({ hoveredRoomId: id });
  },
  setWallsCut: (wallsCut) => set({ wallsCut }),
  setDragging: (dragging) => set({ dragging }),
  setPhotoView: (photoView) => set({ photoView }),
  setPhotoFov: (photoFov) => set({ photoFov }),
  setCatalogOpen: (catalogOpen) => set({ catalogOpen }),
  openLeft: (leftTab, filter) =>
    set((s) => ({
      leftTab,
      catalogOpen: true,
      objectFilter: filter ?? s.objectFilter,
      mode: s.mode === "arrange" ? s.mode : "arrange",
      lastEditMode: "arrange",
    })),
  setObjectFilter: (objectFilter) => set({ objectFilter }),
  setOverlay: (overlay) => set({ overlay }),
  toast: (text, kind = "info") => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), kind === "info" ? 3500 : 7000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setNight: (night, persist = true) => {
    if (persist) saveNightPref(night);
    if (get().night !== night) set({ night });
  },
  toggleNight: () => {
    const s = get();
    // With the sun known (Maison mode), the switch cycles Auto (soleil) → Jour → Nuit.
    if (s.sunElevation !== null && !s.slideshow) {
      s.setDaylight(s.daylight === "auto" ? "day" : s.daylight === "day" ? "night" : "auto");
      return;
    }
    s.setNight(!s.night, !s.slideshow);
  },
  setDaylight: (daylight, persist = true) => {
    if (persist) saveDaylightPref(daylight);
    const s = get();
    const night = daylight === "auto" ? (s.sunElevation !== null ? s.sunElevation < 0 : s.night) : daylight === "night";
    if (s.daylight !== daylight || s.night !== night) set({ daylight, night });
  },
  setSunElevation: (sunElevation) => {
    const s = get();
    const night = s.daylight === "auto" && sunElevation !== null && !s.slideshow ? sunElevation < 0 : s.night;
    if (s.sunElevation !== sunElevation || s.night !== night) set({ sunElevation, night });
  },
  startSlideshow: () => {
    const s = get();
    if (s.slideshow) return;
    set({
      slideRestore: { mode: s.mode, night: s.night, selectedItemId: s.selectedItemId, selectedRoomId: s.selectedRoomId },
      slideshow: true,
      slidePaused: false,
      slideCam: "iso",
      // Plain navigation underneath: no editing gestures, halos or room picking while it plays.
      mode: "navigate",
      overlay: null,
      selectedItemId: null,
      selectedRoomId: null,
      hoveredItemId: null,
      hoveredRoomId: null,
      dragging: false,
    });
  },
  stopSlideshow: (opts) => {
    const s = get();
    if (!s.slideshow) return;
    const r = opts?.explore ? null : s.slideRestore;
    set({
      slideshow: false,
      slidePaused: false,
      slideCam: "iso",
      slideRestore: null,
      ...(r
        ? {
            night: r.night,
            mode: r.mode,
            selectedItemId: r.mode === "arrange" ? r.selectedItemId : null,
            selectedRoomId: r.mode === "rooms" ? r.selectedRoomId : null,
          }
        : { mode: "navigate" as const }),
    });
  },
  setSlidePaused: (slidePaused) => set({ slidePaused }),
  setSlideCam: (slideCam) => {
    if (get().slideCam !== slideCam) set({ slideCam });
  },

  addItem: (category, opts) => {
    const entry = getCatalogEntry(category);
    const scene = get().scene;
    const variant = entry?.variants?.find((v) => v.key === opts?.variant) ?? entry?.variants?.[0];
    const dims = variant?.defaultDimensions ?? entry?.defaultDimensions;
    const draft: Item = {
      id: createId("item"),
      category,
      position: [0, 0, 0],
      rotationY: 0,
      dimensions: dims ? [...dims] : [0.6, 0.6, 0.6],
      color: variant?.defaultColor ?? entry?.defaultColor,
      variant: variant?.key,
      source: "user",
      label: entry?.label,
    };
    const base: Item = { ...draft, position: [0, defaultElevationFor(draft, scene), 0] };
    const item: Item = placeItem(base, scene, opts?.at ?? viewState.target);
    if (item.variant === undefined) delete item.variant;
    if (item.color === undefined) delete item.color;
    get().edit((d) => {
      d.items.push(item);
    });
    set({ selectedItemId: item.id, mode: "arrange", lastEditMode: "arrange" });
  },
  updateItem: (id, recipe, key) =>
    get().edit((d) => {
      const it = d.items.find((i) => i.id === id);
      if (it) recipe(it);
    }, key),
  removeItem: (id) => {
    if (!get().scene.items.some((i) => i.id === id)) return;
    get().edit((d) => {
      d.items = d.items.filter((i) => i.id !== id);
    });
    set((s) => ({ selectedItemId: s.selectedItemId === id ? null : s.selectedItemId, hoveredItemId: null }));
  },
  removeSelected: () => {
    const id = get().selectedItemId;
    if (id) get().removeItem(id);
  },
  markVerified: (id) =>
    get().updateItem(id, (it) => {
      it.confidence = 1;
    }),
  setItemMount: (id, mount) => {
    const { scene } = get();
    const item = scene.items.find((i) => i.id === id);
    if (!item || effectiveMount(item) === mount) return;
    const moved: Item = { ...item, mount, position: [item.position[0], defaultElevationFor({ ...item, mount }, scene), item.position[2]] };
    let rotationY = item.rotationY;
    if (mount === "wall") {
      // Flush against the nearest wall face, turned away from it.
      const snap = snapToWall(moved, item.position[0], item.position[2], scene);
      if (snap) {
        moved.position = [snap.position[0], moved.position[1], snap.position[1]];
        rotationY = snap.rotationY;
      }
    } else if (mount === "ceiling") {
      moved.position = [item.position[0], ceilingItemY(item, ceilingHeightAt(scene, [item.position[0], item.position[2]])), item.position[2]];
    }
    get().updateItem(id, (it) => {
      it.mount = mount;
      it.position = moved.position;
      it.rotationY = rotationY;
    });
  },
  focusItem: (id) => {
    const item = get().scene.items.find((i) => i.id === id);
    if (!item) return;
    set((s) => ({ selectedItemId: id, mode: s.mode === "arrange" ? s.mode : "arrange", lastEditMode: "arrange" }));
    const size = Math.max(item.dimensions[0], item.dimensions[2]) + 2.2;
    cameraBus.emit({ type: "focus", center: [item.position[0], item.position[2]], size });
  },
  duplicateSelected: () => {
    const { selectedItemId, scene } = get();
    const src = scene.items.find((i) => i.id === selectedItemId);
    if (!src) return;
    const draft: Item = { ...src, id: createId("item"), source: "user", position: [src.position[0], src.position[1], src.position[2]] };
    delete draft.confidence;
    const copy = placeItem(draft, scene, [src.position[0] + 0.3, src.position[2] + 0.3]);
    get().edit((d) => {
      d.items.push(copy);
    });
    set({ selectedItemId: copy.id });
  },
  rotateSelected: (deg) => {
    const id = get().selectedItemId;
    if (!id) return;
    get().updateItem(
      id,
      (it) => {
        it.rotationY = normalizeAngle(snapToGridAngle(it.rotationY + (deg * Math.PI) / 180));
      },
      `rotate:${id}`,
    );
  },
}));

/** Standing inside a room (photo « Hauteur d'yeux » or a slideshow interior shot): ceilings on, walls full. */
export function isEyeView(s: Pick<AppState, "mode" | "photoView" | "slideshow" | "slideCam">): boolean {
  return s.slideshow ? s.slideCam === "eye" : s.mode === "photo" && s.photoView === "eye";
}

/** Camera-side walls lowered right now (user toggle; always on in the slideshow's outside shots). */
export function isCutActive(s: Pick<AppState, "mode" | "photoView" | "slideshow" | "slideCam" | "wallsCut">): boolean {
  if (isEyeView(s)) return false;
  return s.slideshow ? true : s.wallsCut;
}

function pruneSelection(scene: Scene, s: AppState): Partial<AppState> {
  return {
    selectedItemId: s.selectedItemId && scene.items.some((i) => i.id === s.selectedItemId) ? s.selectedItemId : null,
    selectedRoomId: s.selectedRoomId && scene.rooms.some((r) => r.id === s.selectedRoomId) ? s.selectedRoomId : null,
    hoveredItemId: null,
  };
}

// Autosave (debounced). Storage may be unavailable (private mode, quota): never crash.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.scene === prev.scene || typeof window === "undefined") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(useStore.getState().scene));
    } catch {
      /* ignore */
    }
  }, 400);
});
