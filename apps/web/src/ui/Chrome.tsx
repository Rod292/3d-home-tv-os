import { useStore, type Mode } from "../state/store";
import { cameraBus } from "../state/view";
import { IconCamera, IconClose, IconEye, IconHome, IconKeyboard, IconMoon, IconOrbit, IconRotateLeft, IconRotateRight, IconSun, IconWalls } from "./icons";

/** Jour / Nuit switch (key N). With the sun known (Maison mode + bridge): Auto (soleil) → Jour → Nuit. */
export function NightToggle({ className = "" }: { className?: string }) {
  const night = useStore((s) => s.night);
  const daylight = useStore((s) => s.daylight);
  const sunKnown = useStore((s) => s.sunElevation !== null && !s.slideshow);
  const auto = sunKnown && daylight === "auto";
  const label = auto ? "Auto" : night ? "Nuit" : "Jour";
  const title = sunKnown
    ? auto
      ? `Suit le soleil (${night ? "nuit" : "jour"} en ce moment) — cliquer pour forcer le jour (N)`
      : night
        ? "Version nuit forcée — cliquer pour suivre le soleil (N)"
        : "Version jour forcée — cliquer pour forcer la nuit (N)"
    : night
      ? "Version nuit — cliquer pour revenir au jour (N)"
      : "Version jour — cliquer pour allumer les lampes de nuit (N)";
  return (
    <button
      className={`night-toggle${night ? " is-night" : ""}${auto ? " is-auto" : ""} ${className}`}
      onClick={() => useStore.getState().toggleNight()}
      role={sunKnown ? undefined : "switch"}
      aria-checked={sunKnown ? undefined : night}
      aria-label={sunKnown ? `Ambiance : ${auto ? "automatique (soleil)" : night ? "nuit" : "jour"}` : "Version nuit"}
      title={title}
    >
      <span className="nt-knob" aria-hidden>
        {night ? <IconMoon width={14} height={14} /> : <IconSun width={14} height={14} />}
      </span>
      <span className="nt-label">{label}</span>
    </button>
  );
}

/** The 3–4 most useful gestures per mode; everything else lives in the "?" overlay. */
const HINTS: Record<Exclude<Mode, "photo">, [string, string][]> = {
  navigate: [
    ["Glisser", "tourner"],
    ["Clic droit", "déplacer"],
    ["Molette", "zoomer"],
    ["Double-clic", "cadrer une pièce"],
  ],
  arrange: [
    ["Glisser", "déplacer un meuble"],
    ["R", "pivoter"],
    ["Suppr", "supprimer"],
    ["Ctrl+Z", "annuler"],
  ],
  home: [
    ["Clic sur une lampe", "allumer / éteindre"],
    ["Glisser", "tourner"],
    ["Molette", "zoomer"],
  ],
  rooms: [
    ["Clic", "choisir une pièce"],
    ["Double-clic", "cadrer"],
    ["Q / E", "pivoter la vue"],
  ],
};

export function HintBar() {
  const mode = useStore((s) => s.mode);
  const dragging = useStore((s) => s.dragging);
  const hasSelection = useStore((s) => !!s.selectedItemId);
  if (mode === "photo") return null;
  let hints = HINTS[mode];
  if (dragging) hints = [["Alt", "sans aimantation"], ["Relâcher", "poser"]];
  else if (mode === "arrange" && !hasSelection) hints = [["Clic", "choisir un meuble"], ["Glisser", "le déplacer"], ["Q / E", "pivoter la vue"]];
  return (
    <footer className="hintbar" aria-label="Aide rapide">
      {hints.map(([k, v]) => (
        <span key={k} className="hint">
          <kbd>{k}</kbd> {v}
        </span>
      ))}
      {!dragging && (
        <button className="hint-more" onClick={() => useStore.getState().setOverlay("help")} aria-label="Tous les raccourcis clavier">
          <IconKeyboard width={15} height={15} /> <span>Raccourcis</span> <kbd>?</kbd>
        </button>
      )}
    </footer>
  );
}

/** Floating camera controls (bottom-right): overview, rotate the view, cut walls. */
export function ViewControls() {
  const wallsCut = useStore((s) => s.wallsCut);
  const setWallsCut = useStore((s) => s.setWallsCut);
  return (
    <div className="view-controls panel" role="toolbar" aria-label="Vue">
      <button className="icon-btn" onClick={() => cameraBus.emit({ type: "rotate", dir: -1 })} title="Pivoter la vue à gauche (Q)" aria-label="Pivoter la vue à gauche">
        <IconRotateLeft />
      </button>
      <button className="icon-btn" onClick={() => cameraBus.emit({ type: "overview" })} title="Vue d'ensemble (0)" aria-label="Vue d'ensemble">
        <IconHome />
      </button>
      <button className="icon-btn" onClick={() => cameraBus.emit({ type: "rotate", dir: 1 })} title="Pivoter la vue à droite (E)" aria-label="Pivoter la vue à droite">
        <IconRotateRight />
      </button>
      <span className="vc-sep" />
      <button
        className={`icon-btn toggle${wallsCut ? " is-on" : ""}`}
        onClick={() => setWallsCut(!wallsCut)}
        aria-pressed={wallsCut}
        title={wallsCut ? "Murs abaissés côté caméra — cliquer pour les afficher en entier (M)" : "Murs pleins — cliquer pour abaisser les murs côté caméra (M)"}
        aria-label="Abaisser les murs côté caméra"
      >
        <IconWalls />
      </button>
      <span className="vc-sep" />
      <NightToggle />
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-dot" aria-hidden />
          <span className="toast-text">{t.text}</span>
          <button className="icon-btn ghost" onClick={() => dismiss(t.id)} aria-label="Fermer la notification">
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Minimal floating toolbar shown in photo mode (the rest of the UI is hidden). */
export function PhotoBar() {
  const view = useStore((s) => s.photoView);
  const fov = useStore((s) => s.photoFov);
  const { setPhotoView, setPhotoFov, setMode, lastEditMode } = useStore.getState();
  return (
    <div className="photobar panel" role="toolbar" aria-label="Mode photo">
      <div className="segmented" role="radiogroup" aria-label="Point de vue">
        <button role="radio" aria-checked={view === "orbit"} className={view === "orbit" ? "is-active" : ""} onClick={() => setPhotoView("orbit")}>
          <IconOrbit /> <span>Vue libre</span>
        </button>
        <button role="radio" aria-checked={view === "eye"} className={view === "eye" ? "is-active" : ""} onClick={() => setPhotoView("eye")}>
          <IconEye /> <span>Hauteur d'yeux</span>
        </button>
      </div>
      <label className="fov">
        <span>Focale</span>
        <input type="range" min={28} max={85} step={1} value={fov} onChange={(e) => setPhotoFov(Number(e.target.value))} aria-valuetext={`${fov} mm`} />
        <output>{fov} mm</output>
      </label>
      <NightToggle className="on-photobar" />
      <div className="photo-actions">
        <button className="btn btn-primary btn-lg" onClick={() => cameraBus.emit({ type: "capture" })}>
          <IconCamera /> Prendre la photo
        </button>
        <button className="icon-btn bordered" onClick={() => setMode(lastEditMode)} aria-label="Quitter le mode photo (Échap)" title="Quitter (Échap)">
          <IconClose />
        </button>
      </div>
      <p className="photo-hint">{view === "eye" ? "Glisser pour regarder autour · WASD / flèches pour marcher" : "Glisser pour tourner · molette pour zoomer"}</p>
    </div>
  );
}
