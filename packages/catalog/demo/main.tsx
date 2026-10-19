import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Item, ItemCategory, Vec3 } from "@appart3d/scene";
import { CATALOG, FurnitureModel, MODELS, PERSON_PRESETS, theme, toonMaterial, useCatalogThumbnail } from "../src";

interface Cell {
  item: Item;
  x: number;
  z: number;
  title: string;
  sub: string;
  /** Extra items drawn in the cell's local frame (e.g. people seated on a sofa). */
  children?: Item[];
}

interface Row {
  title: string;
  z: number;
  cells: Cell[];
}

const GAP = 0.7;

function makeItem(category: ItemCategory, variant: string, dims: Vec3, id: string, extra: Partial<Item> = {}): Item {
  return { id, category, variant, position: [0, 0, 0], rotationY: 0, dimensions: dims, source: "demo", ...extra };
}

const MAN = { ...PERSON_PRESETS.tallYoungMan };
const WOMAN = { ...PERSON_PRESETS.youngWoman };
const SIT: Vec3 = [0.5, 1.3, 0.75];
const STAND: Vec3 = [0.5, 1.75, 0.3];

/** People presets + a seated scene (sitting convention: feet on the floor, back against the backrest cushion). */
function peopleRows(): { title: string; items: { item: Item; title: string; sub: string; children?: Item[] }[] }[] {
  const p = (variant: string, dims: Vec3, id: string, attributes?: Record<string, string>, extra: Partial<Item> = {}) =>
    makeItem("person", variant, dims, id, attributes ? { attributes, ...extra } : extra);
  const presets = [
    { item: p("person/standing", STAND, "pp-man-stand", MAN), title: "Jeune homme (debout)", sub: "preset tallYoungMan" },
    { item: p("person/standing", STAND, "pp-woman-stand", WOMAN), title: "Jeune femme (debout)", sub: "preset youngWoman" },
    { item: p("person/sitting", SIT, "pp-man-sit", MAN), title: "Jeune homme (assis)", sub: fmt(SIT) },
    { item: p("person/sitting", SIT, "pp-woman-sit", WOMAN), title: "Jeune femme (assise)", sub: fmt(SIT) },
    { item: p("person/sitting-relaxed", [0.8, 1.3, 0.8], "pp-man-relax", MAN), title: "Détendu", sub: "bras sur le dossier" },
    { item: p("person/standing", STAND, "pp-default"), title: "Défaut", sub: "sans attributs" },
    { item: p("person/standing", STAND, "pp-bun", { hairStyle: "bun", hair: "#b5651d", top: "#5b7fa6", bottomStyle: "pants", bottom: "#e8dcc6", skin: "#a8704a" }), title: "Chignon", sub: "pantalon" },
  ];
  // sofa/modern 2.2 × 0.85 × 0.95: back cushion front at z ≈ -0.23 → person center z = -0.23 + d/2
  const sofaZ = -0.23 + SIT[2] / 2;
  const scene = [
    {
      item: makeItem("sofa", "sofa/modern", [2.2, 0.85, 0.95], "pp-sofa", { color: "#c9b8a0" }),
      title: "Canapé + 2 personnes",
      sub: "assis, y = 0",
      children: [
        p("person/sitting", SIT, "pp-sofa-man", MAN, { position: [-0.45, 0, sofaZ] }),
        p("person/sitting", SIT, "pp-sofa-woman", WOMAN, { position: [0.45, 0, sofaZ] }),
      ],
    },
    {
      item: makeItem("armchair", "armchair/swivel", [0.8, 0.74, 0.78], "pp-swivel", { color: "#2f7d4f" }),
      title: "Fauteuil pivotant + personne",
      sub: "assise",
      children: [p("person/sitting", SIT, "pp-swivel-woman", WOMAN, { position: [0, 0, -0.24 + SIT[2] / 2] })],
    },
    { item: makeItem("armchair", "armchair/swivel", [0.8, 0.74, 0.78], "pp-swivel-alone", { color: "#2f7d4f" }), title: "Fauteuil pivotant", sub: "#2f7d4f" },
    {
      item: makeItem("sofa", "sofa/rounded", [2.2, 0.85, 0.95], "pp-sofa2"),
      title: "Canapé + détendu",
      sub: "bras sur le dossier",
      children: [p("person/sitting-relaxed", [0.8, 1.3, 0.8], "pp-sofa2-man", MAN, { position: [0.1, 0, -0.25 + 0.4] })],
    },
  ];
  return [
    { title: "Personnes", items: presets },
    { title: "Scène personnes", items: scene },
  ];
}

function fmt(d: Vec3): string {
  return d.map((v) => v.toFixed(2)).join(" × ");
}

/** One row per catalog group with every variant, then stress-test rows. */
function buildLayout(): Row[] {
  const rows: { title: string; items: { item: Item; title: string; sub: string; children?: Item[] }[] }[] = [];
  const groups = [...new Set(CATALOG.map((e) => e.group))];
  for (const g of groups) {
    const items: { item: Item; title: string; sub: string }[] = [];
    for (const e of CATALOG.filter((x) => x.group === g)) {
      for (const v of MODELS[e.category]) {
        const dims = v.defaultDimensions ?? e.defaultDimensions;
        items.push({ item: makeItem(e.category, v.key, dims, `${v.key}`), title: v.label, sub: fmt(dims) });
      }
    }
    rows.push({ title: g, items });
  }
  rows.push(...peopleRows());
  const stress: [ItemCategory, string, Vec3[]][] = [
    ["sofa", "sofa/modern", [[1.3, 0.75, 0.85], [2.2, 0.85, 0.95], [3.4, 0.9, 1.05]]],
    ["sofa", "sofa/corner", [[2.0, 0.8, 1.4], [3.4, 0.9, 2.1]]],
    ["bed", "bed/classic", [[0.9, 0.8, 1.9], [2.0, 1.1, 2.2]]],
    ["shelf", "shelf/bookcase", [[0.6, 0.9, 0.3], [1.8, 2.4, 0.35]]],
    ["storage", "storage/kitchen-counter", [[0.6, 0.9, 0.6], [3.6, 0.9, 0.65]]],
    ["table", "table/classic", [[0.7, 0.72, 0.7], [2.6, 0.76, 1.0]]],
    ["wardrobe", "wardrobe/hinged", [[0.6, 1.8, 0.55], [2.6, 2.4, 0.62]]],
    ["chair", "chair/wood", [[0.38, 0.75, 0.4], [0.6, 1.1, 0.6]]],
    ["plant", "plant/bush", [[0.25, 0.35, 0.25], [1.0, 1.6, 0.7]]],
    ["stairs", "stairs/straight", [[0.8, 1.2, 1.6], [1.2, 3.0, 3.8]]],
    ["bicycle", "bicycle/road", [[1.4, 0.8, 0.38], [1.9, 1.1, 0.5]]],
    ["curtain", "curtain/pair", [[1.0, 1.4, 0.1], [2.8, 2.6, 0.16]]],
    ["radiator", "radiator/panel", [[0.4, 0.9, 0.08], [1.4, 0.5, 0.12]]],
    ["ceilingFan", "ceilingFan/default", [[0.9, 0.3, 0.9], [1.5, 0.5, 1.5]]],
  ];
  stress.push(["person", "person/sitting", [[0.35, 0.9, 0.5], [0.7, 1.6, 1.0]]]);
  stress.push(["armchair", "armchair/swivel", [[0.6, 0.6, 0.6], [1.1, 0.9, 1.0]]]);
  const sItems: { item: Item; title: string; sub: string }[] = [];
  stress.forEach(([cat, variant, list]) =>
    list.forEach((dims, i) => sItems.push({ item: makeItem(cat, variant, dims, `stress-${variant}-${i}`), title: variant, sub: fmt(dims) })),
  );
  // split stress into two rows
  rows.push({ title: "Test de dimensions", items: sItems.slice(0, 9) });
  rows.push({ title: "Test de dimensions (suite)", items: sItems.slice(9, 20) });
  rows.push({ title: "Test de dimensions (fin)", items: sItems.slice(20, 30) });
  rows.push({ title: "Test de dimensions (extra)", items: sItems.slice(30) });

  let z = 0;
  return rows.filter((r) => !ONLY || r.title.startsWith(ONLY)).map((r) => {
    const depth = Math.max(...r.items.map((i) => i.item.dimensions[2]));
    let x = 0;
    const cells: Cell[] = r.items.map((it) => {
      const w = it.item.dimensions[0];
      const cell = { ...it, x: x + w / 2, z: z + depth / 2 };
      x += w + GAP;
      return cell;
    });
    const width = x - GAP;
    cells.forEach((c) => (c.x -= width / 2));
    const row = { title: r.title, z, cells };
    z += depth + 1.4;
    return row;
  });
}

function BBox({ dims }: { dims: Vec3 }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...dims)), [dims]);
  return (
    <lineSegments geometry={geo} position={[0, dims[1] / 2, 0]}>
      <lineBasicMaterial color="#e2725b" />
    </lineSegments>
  );
}

function Gallery({ showBoxes, showLabels }: { showBoxes: boolean; showLabels: boolean }) {
  const rows = useMemo(buildLayout, []);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const totalZ = rows.length ? (rows[rows.length - 1] as Row).z : 0;
  return (
    <group position={[0, 0, -totalZ / 2]}>
      {rows.map((r) => {
        const x0 = Math.min(...r.cells.map((c) => c.x - c.item.dimensions[0] / 2));
        return (
          <group key={r.title}>
            {showLabels && (
              <Html position={[x0 - 0.3, 0, r.z + 0.2]} center={false} zIndexRange={[5, 0]}>
                <div className="group" style={{ transform: "translate(-100%, -50%)" }}>{r.title}</div>
              </Html>
            )}
            {r.cells.map((c) => (
              <group
                key={c.item.id}
                position={[c.x, 0, c.z]}
                onPointerOver={(e) => (e.stopPropagation(), setHovered(c.item.id))}
                onPointerOut={() => setHovered((h) => (h === c.item.id ? null : h))}
                onClick={(e) => (e.stopPropagation(), setSelected((s) => (s === c.item.id ? null : c.item.id)))}
              >
                <FurnitureModel item={c.item} hovered={hovered === c.item.id} selected={selected === c.item.id} />
                {c.children?.map((ch) => (
                  <group key={ch.id} position={ch.position} rotation={[0, ch.rotationY, 0]}>
                    <FurnitureModel item={ch} />
                  </group>
                ))}
                {showBoxes && <BBox dims={c.item.dimensions} />}
                {showLabels && (
                  <Html position={[0, 0, c.item.dimensions[2] / 2 + 0.12]} zIndexRange={[5, 0]}>
                    <div className="lbl">
                      <b>{c.title}</b> <i>{c.sub}</i>
                    </div>
                  </Html>
                )}
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

const params = new URLSearchParams(location.search);
const num3 = (k: string, d: [number, number, number]): [number, number, number] => {
  const v = params.get(k)?.split(",").map(Number);
  return v && v.length === 3 && v.every(Number.isFinite) ? (v as [number, number, number]) : d;
};
/** URL options (handy for screenshots): ?only=Salon&cam=x,y,z&target=x,y,z&boxes=1&labels=0 */
const ONLY = params.get("only");
const CAM = num3("cam", [10, 14, 18]);
/** ?view=vignettes shows only the thumbnails grid; ?thumbs=1 opens the side panel. */
const VIEW = params.get("view");

function Thumb({ category, variant, label }: { category: ItemCategory; variant: string; label: string }) {
  const url = useCatalogThumbnail(category, variant);
  return (
    <figure className="thumb">
      {url ? <img src={url} alt={label} width={96} height={96} /> : <div className="ph" />}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Vignettes({ full }: { full: boolean }) {
  return (
    <div className={full ? "vignettes full" : "vignettes"}>
      <h2>Vignettes</h2>
      {[...new Set(CATALOG.map((e) => e.group))].map((g) => (
        <section key={g}>
          <h3>{g}</h3>
          <div className="grid">
            {CATALOG.filter((e) => e.group === g).flatMap((e) =>
              (e.variants ?? []).map((v) => <Thumb key={v.key} category={e.category} variant={v.key} label={v.label} />),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
const TARGET = num3("target", [0, 0, 0]);

function App() {
  const [showBoxes, setShowBoxes] = useState(params.get("boxes") === "1");
  const [showLabels, setShowLabels] = useState(params.get("labels") !== "0");
  const [showThumbs, setShowThumbs] = useState(params.get("thumbs") === "1");
  if (VIEW === "vignettes") return <Vignettes full />;
  return (
    <>
      {showThumbs && <Vignettes full={false} />}
      <div className="panel">
        <h1>Appart3D · Catalogue</h1>
        <label>
          <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Boîtes englobantes
        </label>
        <label>
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Étiquettes
        </label>
        <label>
          <input type="checkbox" checked={showThumbs} onChange={(e) => setShowThumbs(e.target.checked)} /> Vignettes
        </label>
        <small>Clic : sélectionner · survol : surbrillance · glisser : orbiter</small>
      </div>
      <Canvas shadows camera={{ position: CAM, fov: 35, near: 0.1, far: 200 }} dpr={[1, 2]}>
        <color attach="background" args={[theme.background]} />
        <hemisphereLight args={["#fff6ea", "#cdb294", 0.9]} />
        <directionalLight
          position={[8, 16, 10]}
          intensity={2.8}
          color="#fff1dc"
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-camera-left={-22}
          shadow-camera-right={22}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={toonMaterial(theme.floor.wood)}>
          <planeGeometry args={[80, 80]} />
        </mesh>
        <Gallery showBoxes={showBoxes} showLabels={showLabels} />
        <OrbitControls makeDefault target={TARGET} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
