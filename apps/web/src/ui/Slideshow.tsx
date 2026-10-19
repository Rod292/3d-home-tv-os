import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { slideshowBus, slideshowFx, useSlides } from "../state/slideshow";
import { handOffView } from "../three/IsoRig";
import { IconClose, IconMoon, IconNext, IconPause, IconPlay, IconSun } from "./icons";

const IDLE_MS = 2000;

/**
 * "Mode diaporama" overlay: fade veil, caption (room · area), shot progress and a tiny control bar
 * that hides itself after 2 s without pointer movement. The camera rig drives the veil and the
 * progress fill directly (see SlideshowRig).
 */
export function SlideshowUI() {
  const { index, count, caption } = useSlides();
  const paused = useStore((s) => s.slidePaused);
  const night = useStore((s) => s.night);
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const wake = () => {
      setIdle(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // Grabbing the 3D view (drag, wheel, pinch, click) ends the slideshow and hands over to free
  // navigation from the current framing — viewers want to look around themselves.
  useEffect(() => {
    const grab = (e: Event) => {
      const t = e.target as Element | null;
      if (!t?.closest?.(".viewport") || t.closest(".ss-bar")) return;
      const h = slideshowFx.handoff;
      if (h.valid) handOffView(h.target, h.az, h.polar, h.zoom);
      const st = useStore.getState();
      st.stopSlideshow({ explore: true });
      st.toast("Navigation libre — touche P ou bouton « Diaporama » pour relancer.");
    };
    window.addEventListener("pointerdown", grab, true);
    window.addEventListener("wheel", grab, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", grab, true);
      window.removeEventListener("wheel", grab, true);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("ss-idle", idle);
    return () => document.body.classList.remove("ss-idle");
  }, [idle]);

  const s = useStore.getState;

  return (
    <div className={`slideshow${paused ? " is-paused" : ""}${idle ? " is-idle" : ""}`}>
      <div className="ss-vignette" aria-hidden />
      <div className="ss-veil" ref={(el) => void (slideshowFx.veil = el)} aria-hidden />
      {caption && (
        <div className="ss-caption" key={index} ref={(el) => void (slideshowFx.caption = el)} aria-live="polite">
          {caption.eyebrow && <div className="ss-eyebrow">{caption.eyebrow}</div>}
          <div className="ss-title">
            <span>{caption.title}</span>
            {caption.detail && !caption.eyebrow && (
              <>
                <span className="ss-dot" aria-hidden>
                  ·
                </span>
                <span className="ss-detail">{caption.detail}</span>
              </>
            )}
          </div>
          {caption.detail && caption.eyebrow && <div className="ss-sub">{caption.detail}</div>}
          <div className="ss-steps" aria-hidden>
            {Array.from({ length: count }, (_, i) => (
              <span key={i} className={`ss-step${i < index ? " is-done" : ""}`}>
                {i === index && <i ref={(el) => void (slideshowFx.progress = el)} />}
              </span>
            ))}
          </div>
        </div>
      )}
      {!slideshowFx.hideChrome && <div className="ss-bar" role="toolbar" aria-label="Diaporama">
        <button className="ss-btn" onClick={() => s().setSlidePaused(!paused)} title={paused ? "Lecture (Espace)" : "Pause (Espace)"} aria-label={paused ? "Lecture" : "Pause"}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>
        <button className="ss-btn" onClick={() => slideshowBus.emit("next")} title="Plan suivant (→)" aria-label="Plan suivant">
          <IconNext />
        </button>
        <span className="ss-sep" />
        <button
          className="ss-btn ss-wide"
          onClick={() => s().toggleNight()}
          title={night ? "Passer en version jour (N)" : "Passer en version nuit (N)"}
          aria-pressed={night}
        >
          {night ? <IconSun /> : <IconMoon />}
          <span>{night ? "Jour" : "Nuit"}</span>
        </button>
        <span className="ss-sep" />
        <button className="ss-btn ss-wide" onClick={() => s().stopSlideshow()} title="Quitter le diaporama (Échap)">
          <IconClose />
          <span>Quitter</span>
        </button>
      </div>}
    </div>
  );
}
