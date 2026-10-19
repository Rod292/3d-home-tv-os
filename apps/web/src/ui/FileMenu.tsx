import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useStore } from "../state/store";
import { exportScene, loadExample, pickFile, resetToDemo } from "./fileActions";
import { IconChevronDown, IconDownload, IconFilm, IconFolder, IconHelp, IconKeyboard, IconReset, IconScan, IconUpload } from "./icons";

interface Entry {
  icon: ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  run: () => void;
}

/** "Fichier" dropdown: import / example / export, help, reset. */
export function FileMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const setOverlay = useStore((s) => s.setOverlay);

  const groups: Entry[][] = [
    [
      { icon: <IconUpload />, label: "Importer un scan…", hint: ".appart3d.json ou scène — ou glissez le fichier", run: pickFile },
      { icon: <IconScan />, label: "Charger le scan exemple", run: () => void loadExample() },
      { icon: <IconDownload />, label: "Exporter la scène", hint: "Fichier .json réimportable", run: exportScene },
    ],
    [{ icon: <IconFilm />, label: "Diaporama", hint: "Visite automatique plein écran — touche P", run: () => useStore.getState().startSlideshow() }],
    [
      { icon: <IconHelp />, label: "Guide de démarrage", run: () => setOverlay("welcome") },
      { icon: <IconKeyboard />, label: "Raccourcis clavier", hint: "?", run: () => setOverlay("help") },
    ],
    [{ icon: <IconReset />, label: "Réinitialiser (démo)", danger: true, run: () => resetToDemo() }],
  ];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    requestAnimationFrame(() => items.current[0]?.focus());
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>(".menu-trigger")?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = list.length;
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + n) % n]?.focus();
    } else if (e.key === "Tab") setOpen(false);
  };

  let idx = 0;
  return (
    <div className="menu-root" ref={root} onKeyDown={onKeyDown}>
      <button className={`menu-trigger${open ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Importer, exporter, aide">
        <IconFolder />
        <span className="hide-sm">Fichier</span>
        <IconChevronDown className="chev" width={14} height={14} />
      </button>
      {open && (
        <div className="menu panel" role="menu" aria-label="Fichier">
          {groups.map((g, gi) => (
            <div key={gi} className="menu-group" role="group">
              {g.map((it) => {
                const k = idx++;
                return (
                  <button
                    key={it.label}
                    ref={(el) => {
                      items.current[k] = el;
                    }}
                    role="menuitem"
                    className={`menu-item${it.danger ? " danger" : ""}`}
                    onClick={() => {
                      setOpen(false);
                      it.run();
                    }}
                  >
                    <span className="menu-icon">{it.icon}</span>
                    <span className="menu-text">
                      <span>{it.label}</span>
                      {it.hint && it.hint !== "?" && <small>{it.hint}</small>}
                    </span>
                    {it.hint === "?" && <kbd className="kbd-light">?</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
