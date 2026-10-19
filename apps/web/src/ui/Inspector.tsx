import { useMemo, type ReactNode } from "react";
import { getCatalogEntry, type CatalogVariant } from "@appart3d/catalog";
import type { Item, ItemMount, Vec3 } from "@appart3d/scene";
import { useStore } from "../state/store";
import { toDeg } from "../state/angles";
import { itemTitle, needsReview } from "../state/analysis";
import { catalogMount, effectiveMount, maxElevation, MOUNT_LABELS } from "../state/mount";
import { useConflicts } from "./useAnalysis";
import { ColorField, FURNITURE_SWATCHES } from "./ColorField";
import { Thumb } from "./Thumb";
import { IconAlert, IconCeiling, IconCheck, IconClose, IconCopy, IconFloor, IconRotateLeft, IconRotateRight, IconTarget, IconTrash, IconWallMount } from "./icons";

const AXES: { idx: 0 | 1 | 2; label: string; max: number }[] = [
  { idx: 0, label: "Largeur", max: 4 },
  { idx: 1, label: "Hauteur", max: 3 },
  { idx: 2, label: "Profondeur", max: 4 },
];

const MOUNT_ICONS: Record<ItemMount, typeof IconFloor> = { floor: IconFloor, wall: IconWallMount, ceiling: IconCeiling };

export function ItemInspector() {
  const item = useStore((s) => s.scene.items.find((i) => i.id === s.selectedItemId));
  if (!item) return null;
  return <ItemFields item={item} />;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="insp-section">
      <h3>
        <span>{title}</span>
        {aside && <span className="insp-aside">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

function ItemFields({ item }: { item: Item }) {
  const { updateItem, rotateSelected, duplicateSelected, removeSelected, selectItem, markVerified, setItemMount, focusItem } = useStore.getState();
  const scene = useStore((s) => s.scene);
  const conflicts = useConflicts();
  const entry = getCatalogEntry(item.category);
  const title = itemTitle(item);
  const color = item.color ?? entry?.defaultColor ?? "#cccccc";
  const mount = effectiveMount(item);
  const defaultMount = catalogMount(item);
  const report = conflicts.get(item.id);
  const review = needsReview(item);

  const collisionNames = useMemo(() => {
    if (!report) return [];
    const names = report.items.map((id) => {
      const other = scene.items.find((i) => i.id === id);
      return { id, name: other ? itemTitle(other) : "objet" };
    });
    return report.walls.length ? [{ id: "", name: report.walls.length > 1 ? `${report.walls.length} murs` : "un mur" }, ...names] : names;
  }, [report, scene.items]);

  const setDim = (idx: 0 | 1 | 2, v: number) =>
    updateItem(
      item.id,
      (it) => {
        const dims = [...it.dimensions] as Vec3;
        dims[idx] = Math.max(0.02, Math.round(v * 100) / 100);
        it.dimensions = dims;
      },
      `dim:${item.id}:${idx}`,
    );
  const setElevation = (v: number) =>
    updateItem(item.id, (it) => void (it.position = [it.position[0], Math.max(0, Math.round(v * 100) / 100), it.position[2]]), `elev:${item.id}`);

  const elevMax = Math.max(maxElevation(item, scene), item.position[1]);
  // Ceiling items: y is derived from the room ceiling at render time, so no height field.
  const showElevation = mount === "wall" || (mount === "floor" && item.position[1] > 0);

  return (
    <aside className="inspector panel" aria-label="Propriétés de l'objet">
      <div className="insp-head">
        <Thumb category={item.category} variant={item.variant} color={color} size="md" />
        <div className="insp-title">
          <p className="eyebrow">
            {entry?.label ?? item.category}
            {entry?.group ? <span className="eyebrow-soft"> · {entry.group}</span> : null}
          </p>
          <input
            className="title-input"
            value={item.label ?? ""}
            placeholder={entry?.label ?? "Sans nom"}
            aria-label="Nom de l'objet"
            onChange={(e) =>
              updateItem(
                item.id,
                (it) => {
                  if (e.target.value) it.label = e.target.value;
                  else delete it.label;
                },
                `label:${item.id}`,
              )
            }
          />
        </div>
        <button className="icon-btn ghost" onClick={() => selectItem(null)} aria-label="Désélectionner (Échap)" title="Fermer (Échap)">
          <IconClose />
        </button>
      </div>

      <div className="insp-status">
        {report ? (
          <p className="status status-red" role="status">
            <IconAlert width={15} height={15} />
            <span>
              Chevauche{" "}
              {collisionNames.map((c, i) => (
                <span key={c.id || "wall"}>
                  {i > 0 && (i === collisionNames.length - 1 ? " et " : ", ")}
                  {c.id ? (
                    <button className="link" onClick={() => focusItem(c.id)}>
                      {c.name}
                    </button>
                  ) : (
                    c.name
                  )}
                </span>
              ))}
            </span>
          </p>
        ) : (
          <p className="status status-ok">
            <IconCheck width={15} height={15} /> Bien placé
          </p>
        )}
        {review && (
          <div className="status status-amber">
            <span>
              Scan incertain · {Math.round((item.confidence ?? 0) * 100)} %
            </span>
            <button className="btn btn-sm" onClick={() => markVerified(item.id)}>
              <IconCheck width={14} height={14} /> Vérifié
            </button>
          </div>
        )}
      </div>

      <div className="inspector-scroll">
        {entry?.variants && entry.variants.length > 1 && (
          <Section title="Modèle">
            <VariantPicker item={item} variants={entry.variants} color={color} />
          </Section>
        )}

        <Section title="Couleur">
          <ColorField value={color} swatches={FURNITURE_SWATCHES} onChange={(c, live) => updateItem(item.id, (it) => void (it.color = c), live ? `color:${item.id}` : undefined)} />
        </Section>

        <Section title="Dimensions" aside="mètres">
          {AXES.map(({ idx, label, max }) => (
            <SliderRow
              key={idx}
              id={`dim-${idx}`}
              label={label}
              min={0.05}
              max={Math.max(max, item.dimensions[idx])}
              value={item.dimensions[idx]}
              onChange={(v) => setDim(idx, v)}
            />
          ))}
        </Section>

        <Section title="Position">
          <div className="sub-field">
            <span className="sub-label" id="mount-label">
              Fixation
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="mount-label">
              {(["floor", "wall", "ceiling"] as ItemMount[]).map((m) => {
                const Icon = MOUNT_ICONS[m];
                return (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={mount === m}
                    className={mount === m ? "is-active" : ""}
                    onClick={() => setItemMount(item.id, m)}
                    title={m === defaultMount ? `${MOUNT_LABELS[m]} (par défaut pour ce meuble)` : MOUNT_LABELS[m]}
                  >
                    <Icon width={16} height={16} />
                    {MOUNT_LABELS[m]}
                    {m === defaultMount && <span className="default-dot" aria-label="par défaut" />}
                  </button>
                );
              })}
            </div>
          </div>
          {mount === "ceiling" && <p className="field-note">Accroché au plafond de la pièce.</p>}
          {showElevation && (
            <SliderRow id="elev" label="Hauteur" min={0} max={Math.max(0.1, elevMax)} value={item.position[1]} onChange={setElevation} />
          )}
          <div className="sub-field">
            <span className="sub-label">
              Rotation <output className="angle">{toDeg(item.rotationY)}°</output>
            </span>
            <div className="segmented">
              <button onClick={() => rotateSelected(-90)} title="Pivoter de −90°" aria-label="Pivoter de −90°">
                <IconRotateLeft /> 90°
              </button>
              <button onClick={() => rotateSelected(-15)} title="Pivoter de −15° (Maj+R)" aria-label="Pivoter de −15°">
                <IconRotateLeft /> 15°
              </button>
              <button onClick={() => rotateSelected(15)} title="Pivoter de +15° (R)" aria-label="Pivoter de +15°">
                15° <IconRotateRight />
              </button>
              <button onClick={() => rotateSelected(90)} title="Pivoter de +90°" aria-label="Pivoter de +90°">
                90° <IconRotateRight />
              </button>
            </div>
          </div>
        </Section>
      </div>

      <div className="inspector-foot">
        <button className="icon-btn bordered" onClick={() => focusItem(item.id)} title="Cadrer l'objet (F)" aria-label="Cadrer l'objet">
          <IconTarget />
        </button>
        <button onClick={duplicateSelected} title="Dupliquer (Ctrl/⌘+D)">
          <IconCopy /> Dupliquer
        </button>
        <button className="danger" onClick={removeSelected} title="Supprimer (Suppr)">
          <IconTrash /> Supprimer
        </button>
      </div>
    </aside>
  );
}

function SliderRow({ id, label, min, max, value, onChange }: { id: string; label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="slider-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <input
        className="num"
        type="number"
        min={min}
        step={0.01}
        value={Math.round(value * 100) / 100}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min) onChange(v);
        }}
        aria-label={`${label} en mètres`}
      />
    </div>
  );
}

function VariantPicker({ item, variants, color }: { item: Item; variants: CatalogVariant[]; color: string }) {
  const current = item.variant ?? variants[0]!.key;
  const pick = (v: CatalogVariant) => useStore.getState().updateItem(item.id, (it) => void (it.variant = v.key));
  if (variants.length > 6) {
    return (
      <select className="select" value={current} onChange={(e) => pick(variants.find((v) => v.key === e.target.value)!)} aria-label="Modèle">
        {variants.map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div className="variant-grid" role="radiogroup" aria-label="Modèle">
      {variants.map((v) => (
        <button key={v.key} role="radio" aria-checked={current === v.key} className={`variant${current === v.key ? " is-active" : ""}`} onClick={() => pick(v)} title={v.label}>
          <Thumb category={item.category} variant={v.key} color={color} size="sm" />
          <span>{v.label}</span>
        </button>
      ))}
    </div>
  );
}
