import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CATALOG, type CatalogEntry } from "@appart3d/catalog";
import type { ItemCategory } from "@appart3d/scene";
import { useStore } from "../state/store";
import { matchesQuery } from "../state/analysis";
import { groundAt } from "../state/pick";
import { Thumb } from "./Thumb";
import { SearchField } from "./SearchField";
import { IconPlus } from "./icons";

type Group = CatalogEntry["group"];
const GROUP_ORDER: Group[] = ["Salon", "Chambre", "Cuisine", "Salle de bain", "Bureau", "Déco", "Divers"];

const fmt = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");
const isPhone = () => window.matchMedia("(max-width: 720px)").matches;

/** Catalog tab of the left panel: search, group filter, model cards (click or drag into the scene to add). */
export function CatalogPanel() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group | "all">("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const allGroups = useMemo(() => {
    const present = new Set(CATALOG.map((e) => e.group));
    const extra = [...present].filter((g) => !GROUP_ORDER.includes(g));
    return [...GROUP_ORDER.filter((g) => present.has(g)), ...extra];
  }, []);

  const sections = useMemo(() => {
    const list = CATALOG.filter((e) => (group === "all" || e.group === group) && matchesQuery(query, e.label, e.group, e.category));
    return allGroups.map((g) => ({ group: g, entries: list.filter((e) => e.group === g) })).filter((s) => s.entries.length > 0);
  }, [query, group, allGroups]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [group]);

  const count = sections.reduce((n, s) => n + s.entries.length, 0);

  return (
    <>
      <div className="panel-tools">
        <SearchField value={query} onChange={setQuery} placeholder="Canapé, lampe, plante…" label="Rechercher un meuble" />
        <div className="chips" role="tablist" aria-label="Catégories">
          {(["all", ...allGroups] as const).map((g) => (
            <button key={g} role="tab" aria-selected={group === g} className={`chip-filter${group === g ? " is-active" : ""}`} onClick={() => setGroup(g)}>
              {g === "all" ? "Tout" : g}
            </button>
          ))}
        </div>
      </div>
      <div className="catalog-scroll" ref={scrollRef}>
        {count === 0 ? (
          <div className="empty-state">
            <p className="empty-title">Aucun meuble ne correspond</p>
            <p className="empty">Essayez un autre mot, ou une autre catégorie.</p>
            <button
              className="btn"
              onClick={() => {
                setQuery("");
                setGroup("all");
              }}
            >
              Tout afficher
            </button>
          </div>
        ) : (
          <>
            <p className="catalog-tip">Cliquez pour ajouter, ou glissez un meuble dans la pièce.</p>
            {sections.map(({ group: g, entries }) => (
              <section key={g} className="catalog-group" aria-label={g}>
                {(group === "all" || query) && <h3>{g}</h3>}
                <div className="catalog-grid">
                  {entries.map((e) => (
                    <CatalogCard key={e.category} entry={e} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function CatalogCard({ entry }: { entry: CatalogEntry }) {
  const startDrag = useCatalogDrag();
  const suppressClick = useRef(false);
  const variant = entry.variants?.[0];
  const color = variant?.defaultColor ?? entry.defaultColor;
  const dims = variant?.defaultDimensions ?? entry.defaultDimensions;
  return (
    <button
      className="catalog-item"
      onPointerDown={(e) => startDrag(e, entry.category, entry.label, color, variant?.key, suppressClick)}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        useStore.getState().addItem(entry.category);
        if (isPhone()) useStore.getState().setCatalogOpen(false);
      }}
      title={`Ajouter : ${entry.label}`}
      aria-label={`Ajouter : ${entry.label}, ${fmt(dims[0])} × ${fmt(dims[2])} mètres`}
    >
      <Thumb category={entry.category} variant={variant?.key} color={color} />
      <span className="catalog-meta">
        <span className="catalog-label">{entry.label}</span>
        <span className="catalog-dims">
          {fmt(dims[0])} × {fmt(dims[2])} m
          {entry.mount && entry.mount !== "floor" && <span className="mount-tag">{entry.mount === "wall" ? "mural" : "plafond"}</span>}
        </span>
      </span>
      <span className="catalog-add" aria-hidden>
        <IconPlus width={14} height={14} />
      </span>
    </button>
  );
}

/* ---------- Drag a card into the 3D view ---------- */

const DRAG_THRESHOLD = 6;

function useCatalogDrag() {
  return (
    e: ReactPointerEvent<HTMLElement>,
    category: ItemCategory,
    label: string,
    color: string,
    variant: string | undefined,
    suppressClick: { current: boolean },
  ) => {
    // Touch: keep native scrolling of the list; tap adds the item.
    if (e.pointerType === "touch" || e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ghost: HTMLDivElement | null = null;

    const overCanvas = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return !!el && el.tagName === "CANVAS";
    };

    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD) return;
        ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.innerHTML = `<span class="drag-swatch"></span><span></span>`;
        (ghost.firstChild as HTMLElement).style.background = color;
        (ghost.lastChild as HTMLElement).textContent = label;
        document.body.appendChild(ghost);
        document.body.classList.add("is-dragging-card");
      }
      ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 10}px)`;
      ghost.classList.toggle("can-drop", overCanvas(ev.clientX, ev.clientY));
    };

    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!ghost) return;
      ghost.remove();
      document.body.classList.remove("is-dragging-card");
      suppressClick.current = true;
      // The click (if any) fires right after pointerup; clear the flag afterwards in case it doesn't.
      setTimeout(() => (suppressClick.current = false), 0);
      if (ev.type === "pointerup" && overCanvas(ev.clientX, ev.clientY)) {
        const at = groundAt(ev.clientX, ev.clientY) ?? undefined;
        useStore.getState().addItem(category, { at, variant });
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
}
