import { useEffect } from "react";
import { useStore, type Mode } from "../state/store";
import { cameraBus, heldKeys } from "../state/view";
import { slideshowBus } from "../state/slideshow";
import { homeAvailable, useHome } from "../state/home";

const PAN_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
const MODE_KEYS: Record<string, Mode> = { Digit1: "navigate", Digit2: "arrange", Digit3: "rooms", Digit4: "photo" };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return type !== "range" && type !== "color" && type !== "checkbox" && type !== "button";
  }
  return false;
}

/** Global keyboard shortcuts. Uses physical key codes for camera keys so AZERTY works too. */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      // Slideshow: its own tiny keymap; everything else is inert while it plays.
      if (s.slideshow) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "Escape" || e.code === "KeyP") {
          e.preventDefault();
          s.stopSlideshow();
        } else if (e.code === "Space" || e.key === "k") {
          e.preventDefault();
          if (!e.repeat) s.setSlidePaused(!s.slidePaused);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          if (!e.repeat) slideshowBus.emit("next");
        } else if (e.code === "KeyN") {
          if (!e.repeat) s.toggleNight();
        }
        return;
      }
      if (e.key === "Escape") {
        if (s.overlay) {
          if (s.overlay === "welcome") {
            try {
              localStorage.setItem("appart3d:welcome:v1", "1");
            } catch {
              /* ignore */
            }
          }
          s.setOverlay(null);
          return;
        }
        if (s.mode === "photo") s.setMode(s.lastEditMode);
        else if (s.mode === "home" && useHome.getState().view.kind !== "list") useHome.getState().back();
        else {
          s.selectItem(null);
          s.selectRoom(null);
        }
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      if (isTyping(e.target)) return;
      if (s.overlay) {
        if (e.key === "?" && s.overlay === "help") s.setOverlay(null);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        s.setOverlay("help");
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && k === "d") {
        e.preventDefault();
        if (s.mode === "arrange") s.duplicateSelected();
        return;
      }
      if (mod || e.altKey) return;

      if ((e.key === "Delete" || e.key === "Backspace") && s.mode === "arrange" && s.selectedItemId) {
        e.preventDefault();
        s.removeSelected();
        return;
      }
      if (e.code === "KeyR" && s.mode === "arrange" && s.selectedItemId) {
        e.preventDefault();
        s.rotateSelected(e.shiftKey ? -15 : 15);
        return;
      }
      if (e.code === "KeyF" && s.mode === "arrange" && s.selectedItemId) {
        e.preventDefault();
        s.focusItem(s.selectedItemId);
        return;
      }
      if (e.code === "KeyN") {
        if (!e.repeat) s.toggleNight();
        return;
      }
      if (e.code === "KeyH") {
        const h = useHome.getState();
        if (!e.repeat && homeAvailable(h.status) && !h.widget) s.setMode(s.mode === "home" ? s.lastEditMode : "home");
        return;
      }
      if (e.code === "KeyP") {
        if (useHome.getState().widget) return;
        if (!e.repeat) s.startSlideshow();
        return;
      }
      if (e.code === "KeyM" && s.mode !== "photo") {
        s.setWallsCut(!s.wallsCut);
        return;
      }
      if ((e.code === "KeyQ" || e.code === "KeyE") && s.mode !== "photo") {
        if (!e.repeat) cameraBus.emit({ type: "rotate", dir: e.code === "KeyQ" ? -1 : 1 });
        return;
      }
      if ((e.code === "Digit0" || e.key === "Home") && s.mode !== "photo") {
        cameraBus.emit({ type: "overview" });
        return;
      }
      const mode = MODE_KEYS[e.code];
      if (mode && !useHome.getState().widget) {
        s.setMode(mode);
        return;
      }
      if (PAN_CODES.has(e.code)) {
        e.preventDefault();
        heldKeys.add(e.code);
        cameraBus.emit({ type: "wake" });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
    };
    const clear = () => heldKeys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
    };
  }, []);
}
