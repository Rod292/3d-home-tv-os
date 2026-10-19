/** Preset swatches + native custom picker. */
export const FURNITURE_SWATCHES = [
  "#f4f1ea", // cream
  "#e8d5b5", // sand
  "#d9824b", // terracotta
  "#b5523b", // brick
  "#8fae8b", // sage
  "#5f7f5c", // olive
  "#5b7fa6", // slate blue
  "#2f3a4a", // ink
  "#a77b52", // walnut
  "#d9b48a", // oak
  "#eae4f2", // lilac
  "#3a3330", // charcoal
];

export const WALL_SWATCHES = ["#fbf7f1", "#f3e9dc", "#ead7c3", "#e9c9b5", "#dfe7da", "#c9d8c5", "#d6e0ea", "#b8c8d9", "#f2dfc4", "#e3d4e6"];

export const FLOOR_SWATCHES = ["#d9b48a", "#c99f74", "#a77b52", "#7d5a3c", "#e6e9ec", "#d8d2c8", "#cfc6bd", "#bdbab5", "#9aa5a0", "#e9dcc6"];

interface Props {
  value: string;
  swatches: string[];
  /** `live` is true while dragging the custom picker (so history can coalesce). */
  onChange: (color: string, live: boolean) => void;
}

export function ColorField({ value, swatches, onChange }: Props) {
  const v = value.toLowerCase();
  return (
    <div className="swatches" role="radiogroup">
      {swatches.map((c) => (
        <button
          key={c}
          className={`swatch${v === c ? " is-active" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c, false)}
          role="radio"
          aria-checked={v === c}
          aria-label={c}
          title={c}
        />
      ))}
      <label className={`swatch custom${swatches.includes(v) ? "" : " is-active"}`} title="Couleur personnalisée" style={{ ["--c" as string]: value }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#cccccc"} onChange={(e) => onChange(e.target.value, true)} aria-label="Couleur personnalisée" />
      </label>
    </div>
  );
}
