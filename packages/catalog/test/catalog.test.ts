import { describe, expect, it } from "vitest";
import { ITEM_CATEGORIES, type ItemCategory, type Vec3 } from "@appart3d/scene";
import { CATALOG, getCatalogEntry } from "../src/catalog";
import { MODELS } from "../src/builders";
import { buildParts, buildModel } from "../src/model";
import { partsBounds, partsTriangles } from "../src/geometry";

const TOL = 0.01;

/**
 * Radial models whose parts don't fill the XZ box: the 3-blade fan sweeps a w × d ellipse,
 * but the blades' own bounding box is smaller and off-center along one axis.
 */
const RADIAL = new Set<ItemCategory>(["ceilingFan"]);

/** Every variant × (default dims, small, large) of its category. */
function cases(): { category: ItemCategory; variant: string; dims: Vec3; tag: string }[] {
  const out: { category: ItemCategory; variant: string; dims: Vec3; tag: string }[] = [];
  for (const category of ITEM_CATEGORIES) {
    const entry = getCatalogEntry(category);
    for (const v of MODELS[category]) {
      const base = v.defaultDimensions ?? entry?.defaultDimensions ?? [1, 1, 1];
      out.push({ category, variant: v.key, dims: base, tag: "default" });
      out.push({ category, variant: v.key, dims: base.map((x) => x * 0.7) as Vec3, tag: "small" });
      out.push({ category, variant: v.key, dims: [base[0] * 1.6, base[1] * 1.25, base[2] * 1.3], tag: "large" });
    }
  }
  return out;
}

describe("catalog", () => {
  it("has an entry for every ItemCategory", () => {
    for (const c of ITEM_CATEGORIES) {
      const e = getCatalogEntry(c);
      expect(e, c).toBeDefined();
      expect(e!.label.length).toBeGreaterThan(0);
      expect(e!.variants!.length).toBeGreaterThan(0);
    }
    expect(CATALOG.length).toBe(ITEM_CATEGORIES.length);
    expect(ITEM_CATEGORIES.length).toBe(43);
    expect(new Set(CATALOG.map((e) => e.category)).size).toBe(CATALOG.length);
  });

  it("every variant listed by the catalog resolves to its own builder", () => {
    for (const e of CATALOG) {
      expect(e.defaultVariant, e.category).toBe(e.variants![0]!.key);
      for (const v of e.variants!) expect(v.key.startsWith(`${e.category}/`), v.key).toBe(true);
    }
    expect(MODELS.pendantLamp.map((v) => v.key)).toEqual(["pendantLamp/cage", "pendantLamp/globe", "pendantLamp/dome", "pendantLamp/bulb"]);
    expect(MODELS.coatRack.map((v) => v.key)).toEqual(["coatRack/pole", "coatRack/hanging"]);
    expect(MODELS.curtain.map((v) => v.key)).toEqual(["curtain/pair", "curtain/single"]);
  });

  it("mount defaults", () => {
    const mount = (c: ItemCategory) => getCatalogEntry(c)!.mount ?? "floor";
    for (const c of ["radiator", "curtain", "artwork", "mirror"] as const) expect(mount(c), c).toBe("wall");
    for (const c of ["pendantLamp", "ceilingFan"] as const) {
      const e = getCatalogEntry(c)!;
      expect(mount(c), c).toBe("ceiling");
      // assumes a 2.5 m ceiling: top touches it
      expect((e.defaultElevation ?? 0) + e.defaultDimensions[1]).toBeCloseTo(2.5, 5);
    }
    for (const c of ["sofa", "bed", "bicycle", "coatRack", "lamp", "floorLamp"] as const) expect(mount(c), c).toBe("floor");
    expect(getCatalogEntry("radiator")!.defaultElevation).toBe(0.1);
    expect(getCatalogEntry("curtain")!.defaultElevation).toBe(0.05);
    expect(getCatalogEntry("curtain")!.defaultDimensions[1]).toBeGreaterThan(2.2);
  });

  it("French labels and groups for the new categories", () => {
    const labels: Partial<Record<ItemCategory, string>> = {
      bicycle: "Vélo",
      coatRack: "Portemanteau",
      pendantLamp: "Suspension",
      ceilingFan: "Ventilateur de plafond",
      radiator: "Radiateur",
      curtain: "Rideaux",
    };
    for (const [c, l] of Object.entries(labels)) expect(getCatalogEntry(c as ItemCategory)!.label).toBe(l);
    expect(getCatalogEntry("bicycle")!.group).toBe("Divers");
    expect(getCatalogEntry("coatRack")!.group).toBe("Divers");
    expect(getCatalogEntry("pendantLamp")!.group).toBe("Déco");
  });

  it("main categories expose several variants", () => {
    for (const c of ["sofa", "bed", "table", "chair", "storage", "lamp", "plant"] as const) {
      expect(MODELS[c].length, c).toBeGreaterThanOrEqual(2);
    }
    expect(MODELS.storage.some((v) => v.key === "storage/kitchen-counter")).toBe(true);
  });
});

describe("models fit their dimensions", () => {
  for (const { category, variant, dims, tag } of cases()) {
    it(`${variant} (${tag} ${dims.map((x) => x.toFixed(2)).join("×")})`, () => {
      const parts = buildParts({ category, variant, dimensions: dims, id: "test" });
      expect(parts.length).toBeGreaterThan(0);
      const b = partsBounds(parts);
      const [w, h, d] = dims;
      expect(b.min.y, "sits on the floor").toBeCloseTo(0, 2);
      expect(Math.abs(b.min.y)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(b.max.y - h), `height ${b.max.y.toFixed(3)} vs ${h}`).toBeLessThanOrEqual(TOL);
      if (RADIAL.has(category)) {
        // inside the box, touching it on at least one side per axis, hub centered
        for (const [lo, hi, half] of [[b.min.x, b.max.x, w / 2], [b.min.z, b.max.z, d / 2]] as const) {
          expect(lo).toBeGreaterThanOrEqual(-half - TOL);
          expect(hi).toBeLessThanOrEqual(half + TOL);
          expect(Math.max(-lo, hi)).toBeGreaterThan(half * 0.8);
        }
        expect(Math.abs(b.max.z - d / 2)).toBeLessThanOrEqual(TOL);
        return;
      }
      expect(Math.abs(b.min.x + w / 2), `min x ${b.min.x.toFixed(3)} vs ${-w / 2}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(b.max.x - w / 2), `max x ${b.max.x.toFixed(3)} vs ${w / 2}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(b.min.z + d / 2), `min z ${b.min.z.toFixed(3)} vs ${-d / 2}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(b.max.z - d / 2), `max z ${b.max.z.toFixed(3)} vs ${d / 2}`).toBeLessThanOrEqual(TOL);
      for (const p of parts) for (const v of [...p.pos, ...(p.scale ?? [])]) expect(Number.isFinite(v)).toBe(true);
    });
  }
});

describe("budget & robustness", () => {
  it("every model stays under ~3k triangles", () => {
    for (const { category, variant, dims, tag } of cases()) {
      const n = partsTriangles(buildParts({ category, variant, dimensions: dims, id: "x" }));
      expect(n, `${variant} ${tag}: ${n} tris`).toBeLessThanOrEqual(3200);
    }
  });

  it("falls back to the default variant and survives degenerate dimensions", () => {
    const m = buildModel({ category: "sofa", variant: "sofa/does-not-exist", dimensions: [2, 0.8, 0.9] });
    expect(m.variant).toBe("sofa/modern");
    for (const c of ITEM_CATEGORIES) {
      const parts = buildParts({ category: c, dimensions: [0.05, 0.05, 0.05] });
      const b = partsBounds(parts);
      expect(Number.isFinite(b.max.x) || parts.length === 0).toBe(true);
    }
  });

  it("memoizes models", () => {
    const a = buildModel({ category: "bed", dimensions: [1.6, 0.9, 2], id: "a" });
    const b = buildModel({ category: "bed", dimensions: [1.6, 0.9, 2], id: "a" });
    expect(a).toBe(b);
  });
});

describe("speaker/homepod-mini", () => {
  const dims: Vec3 = [0.098, 0.084, 0.098];
  it("is a ~10 cm sphere with a flat top, glow disc on top, space grey by default", () => {
    const e = getCatalogEntry("speaker")!;
    const v = e.variants!.find((x) => x.key === "speaker/homepod-mini")!;
    expect(v.defaultDimensions).toEqual(dims);
    expect(v.defaultColor).toBe("#4a4d52");
    const parts = buildParts({ category: "speaker", variant: "speaker/homepod-mini", dimensions: dims, id: "hp" });
    const b = partsBounds(parts);
    expect(b.max.x - b.min.x).toBeCloseTo(0.098, 3);
    expect(b.max.y).toBeCloseTo(0.084, 3);
    const glow = parts.filter((p) => p.role === "glow");
    expect(glow).toHaveLength(1);
    // the glow disc reaches the very top, centered
    const gb = partsBounds(glow);
    expect(gb.max.y).toBeCloseTo(0.084, 3);
    expect(Math.abs(gb.min.x + gb.max.x)).toBeLessThan(1e-6);
    expect(gb.max.x - gb.min.x).toBeLessThan(0.05);
    expect(parts.some((p) => p.color === "#4a4d52")).toBe(true);
  });

  it("white HomePod mini: item color drives the fabric", () => {
    const parts = buildParts({ category: "speaker", variant: "speaker/homepod-mini", dimensions: dims, color: "#f2f1ed", id: "hp" });
    expect(parts[0]!.color).toBe("#f2f1ed");
  });
});
