import { useStore, type Mode } from "../state/store";
import { FileMenu } from "./FileMenu";
import { useConflicts } from "./useAnalysis";
import { IconCamera, IconFilm, IconHand, IconHelp, IconHouse, IconPencil, IconRedo, IconRooms, IconShieldCheck, IconSofa, IconUndo } from "./icons";
import { homeAvailable, useHome } from "../state/home";

export const MODES: { mode: Mode; label: string; icon: typeof IconHand; key: string; hint: string }[] = [
  { mode: "navigate", label: "Naviguer", icon: IconHand, key: "1", hint: "Explorer l'appartement" },
  { mode: "arrange", label: "Aménager", icon: IconSofa, key: "2", hint: "Ajouter et déplacer les meubles" },
  { mode: "rooms", label: "Pièces", icon: IconRooms, key: "3", hint: "Sols, murs et noms des pièces" },
  { mode: "photo", label: "Photo", icon: IconCamera, key: "4", hint: "Prendre une jolie photo" },
  { mode: "home", label: "Maison", icon: IconHouse, key: "H", hint: "Piloter les lampes et appareils de la maison" },
];

export function TopBar() {
  const name = useStore((s) => s.scene.name);
  const mode = useStore((s) => s.mode);
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const conflicts = useConflicts();
  const hasHome = useHome((st) => homeAvailable(st.status));
  const s = useStore.getState;

  return (
    <header className="topbar panel">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <svg viewBox="0 0 32 32" width="24" height="24">
            <path d="M4 14 16 5l12 9v13H4z" fill="var(--terracotta)" />
            <path d="M12 27v-8h8v8" fill="var(--paper)" />
          </svg>
        </span>
        <div className="brand-text">
          <span className="brand-name">Appart3D</span>
          <label className="project-name-wrap" title="Renommer le projet">
            <input
              className="project-name"
              value={name}
              aria-label="Nom du projet"
              spellCheck={false}
              size={Math.max(8, Math.min(28, name.length + 1))}
              onChange={(e) => s().edit((d) => void (d.name = e.target.value), "rename")}
              onBlur={(e) => {
                if (!e.target.value.trim()) s().edit((d) => void (d.name = "Mon appartement"), "rename");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <IconPencil className="pencil" width={14} height={14} />
          </label>
        </div>
      </div>

      <nav className="modes" aria-label="Modes">
        {MODES.filter((m) => m.mode !== "home" || hasHome).map(({ mode: m, label, icon: Icon, key, hint }) => (
          <button key={m} className={`mode mode-${m}${mode === m ? " is-active" : ""}`} onClick={() => s().setMode(m)} title={`${hint} (${key})`} aria-pressed={mode === m}>
            <Icon />
            <span className="mode-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="actions">
        <div className="undo-group">
          <button className="icon-btn" onClick={() => s().undo()} disabled={!canUndo} title="Annuler (Ctrl/⌘+Z)" aria-label="Annuler">
            <IconUndo />
          </button>
          <button className="icon-btn" onClick={() => s().redo()} disabled={!canRedo} title="Rétablir (Ctrl/⌘+Maj+Z)" aria-label="Rétablir">
            <IconRedo />
          </button>
        </div>
        <span className="sep" />
        <button
          className={`icon-btn check-btn${conflicts.size ? " has-issues" : ""}`}
          onClick={() => s().openLeft("objects", conflicts.size ? "conflicts" : "all")}
          title={conflicts.size ? `Vérifier l'aménagement : ${conflicts.size} chevauchement(s)` : "Vérifier l'aménagement : aucun chevauchement"}
          aria-label={`Vérifier l'aménagement${conflicts.size ? ` (${conflicts.size} chevauchements)` : ""}`}
        >
          <IconShieldCheck />
          {conflicts.size > 0 && <span className="dot-badge red">{conflicts.size}</span>}
        </button>
        <button className="demo-btn" onClick={() => s().startSlideshow()} title="Diaporama : visite automatique (P)">
          <IconFilm />
          <span className="hide-sm">Diaporama</span>
        </button>
        <FileMenu />
        <button className="icon-btn hide-touch" onClick={() => s().setOverlay("help")} title="Raccourcis clavier (?)" aria-label="Raccourcis clavier">
          <IconHelp />
        </button>
      </div>
    </header>
  );
}
