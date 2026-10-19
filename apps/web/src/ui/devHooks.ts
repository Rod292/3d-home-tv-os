import { useStore, type Mode, type ObjectFilter } from "../state/store";
import { conflictsOf, needsReview } from "../state/analysis";

/**
 * DEV-only URL hooks to reach UI states directly (screenshots, manual QA). Examples:
 *   ?mode=arrange&select=first&panel=objects&filter=review
 *   ?select=review | ?select=conflict | ?select=<itemId>
 *   ?overlay=help | ?overlay=welcome | ?welcome=0 (never show the welcome sheet)
 *   ?panel=closed
 *   ?photo=eye&eyeRoom=room_1 | ?photo=orbit (photo mode views)
 * Public (handled in main.tsx, not dev-only): ?night=1, ?demo=1. Dev slideshow jumps: &demoShot=3&demoT=2.5
 *   ?view=3d (&scene=…&night=0|1&autoRotate=0) — embedded 3D view for the native apps: canvas only,
 *   transparent, Maison looks, taps posted to window.webkit.messageHandlers.appart3d; commands via
 *   window.appart3dEmbed.post({type:"focusItem"|"highlightDevice"|"setNight"|"overview"|"autoRotate", …}).
 *   Try it in a browser with &home=mock (devices simulated in the page).
 */
export function applyDevHooks(params: URLSearchParams) {
  const s = useStore.getState();
  const mode = params.get("mode") as Mode | null;
  if (mode && ["navigate", "arrange", "rooms", "photo", "home"].includes(mode)) s.setMode(mode);
  const panel = params.get("panel");
  const filter = params.get("filter") as ObjectFilter | null;
  if (panel === "objects" || panel === "catalog") s.openLeft(panel, filter ?? undefined);
  if (panel === "closed") s.setCatalogOpen(false);
  const sel = params.get("select");
  if (sel) {
    const items = useStore.getState().scene.items;
    const conflicts = conflictsOf(useStore.getState().scene);
    const it =
      sel === "first" ? items[0] : sel === "review" ? items.find(needsReview) : sel === "conflict" ? items.find((i) => conflicts.has(i.id)) : items.find((i) => i.id === sel);
    if (it) {
      if (useStore.getState().mode !== "arrange") s.setMode("arrange");
      s.selectItem(it.id);
    }
  }
  const room = params.get("room");
  if (room) {
    const r = room === "first" ? s.scene.rooms[0] : s.scene.rooms.find((x) => x.id === room);
    if (r) {
      s.setMode("rooms");
      s.selectRoom(r.id);
    }
  }
  const photo = params.get("photo");
  if (photo === "eye" || photo === "orbit") {
    s.setMode("photo");
    const r = params.get("eyeRoom");
    if (r) s.selectRoom(r);
    s.setPhotoView(photo);
  }
  // Maison mode (with ?home=mock): &homeScene=movie runs a scene, &homeOpen=<deviceId|item:itemId> opens a view,
  // &homeAct=<deviceId>:<json action> sends an action, &homeRoom=Salon picks a room chip.
  void import("../state/home").then(({ useHome }) => {
    const run = () => {
      const h = useHome.getState();
      if (h.status !== "online") return setTimeout(run, 150);
      const sc = params.get("homeScene");
      if (sc) h.runScene(sc);
      for (const a of params.getAll("homeAct")) {
        const i = a.indexOf(":{");
        try {
          h.act(a.slice(0, i), JSON.parse(a.slice(i + 1)));
        } catch {
          /* ignore */
        }
      }
      const room = params.get("homeRoom");
      if (room) h.setRoom(room);
      const open = params.get("homeOpen");
      if (open?.startsWith("item:")) h.itemClicked(open.slice(5));
      else if (open) h.openDevice(open);
    };
    if (["homeScene", "homeOpen", "homeAct", "homeRoom"].some((k) => params.has(k))) run();
  });
  const overlay = params.get("overlay");
  if (overlay === "help" || overlay === "welcome") s.setOverlay(overlay);
}
