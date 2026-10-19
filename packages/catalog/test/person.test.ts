import { describe, expect, it } from "vitest";
import type { Vec3 } from "@appart3d/scene";
import { MODELS } from "../src/builders";
import { PERSON_PRESETS, personLook } from "../src/builders/person";
import { getCatalogEntry } from "../src/catalog";
import { attributesKey, buildModel, buildParts, modelFor } from "../src/model";
import { partsBounds, partsTriangles } from "../src/geometry";
import { thumbnailKey } from "../src/thumbnail";

const TOL = 0.01;
const LOOKS: (Record<string, string> | undefined)[] = [
  undefined,
  { ...PERSON_PRESETS.tallYoungMan },
  { ...PERSON_PRESETS.youngWoman },
  { hairStyle: "bun", bottomStyle: "pants", headwear: "cap", glasses: "on-shirt", glassesColor: "#ffd000" },
  { skin: "not-a-color", hairStyle: "mohawk", headwear: "??" },
];

function expectFit(parts: ReturnType<typeof buildParts>, [w, h, d]: Vec3, tag: string) {
  const b = partsBounds(parts);
  expect(Math.abs(b.min.y), tag).toBeLessThanOrEqual(TOL);
  expect(Math.abs(b.max.y - h), tag).toBeLessThanOrEqual(TOL);
  expect(Math.abs(b.min.x + w / 2), tag).toBeLessThanOrEqual(TOL);
  expect(Math.abs(b.max.x - w / 2), tag).toBeLessThanOrEqual(TOL);
  expect(Math.abs(b.min.z + d / 2), tag).toBeLessThanOrEqual(TOL);
  expect(Math.abs(b.max.z - d / 2), tag).toBeLessThanOrEqual(TOL);
}

describe("person", () => {
  it("catalog entry", () => {
    const e = getCatalogEntry("person")!;
    expect(e.label).toBe("Personne");
    expect(e.group).toBe("Divers");
    expect(e.variants!.map((v) => v.key)).toEqual(["person/sitting", "person/standing", "person/sitting-relaxed"]);
    expect(e.variants![0]!.defaultDimensions).toEqual([0.5, 1.3, 0.75]);
    expect(e.variants![1]!.defaultDimensions).toEqual([0.5, 1.75, 0.3]);
    expect(e.variants![0]!.placement).toMatch(/y = 0/);
    expect(Object.keys(e.attributes!)).toContain("bottomStyle");
  });

  for (const v of MODELS.person) {
    const base = v.defaultDimensions!;
    const sizes: [string, Vec3][] = [
      ["default", base],
      ["small", base.map((x) => x * 0.7) as Vec3],
      ["large", [base[0] * 1.6, base[1] * 1.25, base[2] * 1.3]],
    ];
    for (const [tag, dims] of sizes) {
      it(`${v.key} fits ${tag} for every look, < 3.2k tris`, () => {
        for (const attributes of LOOKS) {
          const parts = buildParts({ category: "person", variant: v.key, dimensions: dims, ...(attributes ? { attributes } : {}) });
          expectFit(parts, dims, `${v.key} ${tag} ${JSON.stringify(attributes)}`);
          expect(partsTriangles(parts)).toBeLessThanOrEqual(3200);
          for (const p of parts) for (const n of [...p.pos, ...(p.scale ?? [])]) expect(Number.isFinite(n)).toBe(true);
        }
      });
    }
  }

  it("sitting convention: feet on the floor, seat ≈ 0.44 m at the default size", () => {
    const parts = buildParts({ category: "person", variant: "person/sitting", dimensions: [0.5, 1.3, 0.75] });
    // the lowest skin/bottom part above 0.3 m (thigh underside) sits near 0.44
    const thighs = parts.filter((p) => p.rot && p.geo.kind === "cyl");
    expect(thighs.length).toBeGreaterThan(0);
    for (const t of thighs) expect(t.pos[1]).toBeGreaterThan(0.45);
    for (const t of thighs) expect(t.pos[1]).toBeLessThan(0.56);
  });

  it("presets render with their colors", () => {
    const man = buildParts({ category: "person", variant: "person/sitting", dimensions: [0.5, 1.3, 0.75], attributes: { ...PERSON_PRESETS.tallYoungMan } });
    const colors = new Set(man.map((p) => p.color));
    for (const c of ["#efc9a8", "#3b2a20", "#8e8a86", "#e2622b", "#6b4a32", "#3c4250"]) expect(colors.has(c), c).toBe(true);
    expect(man.some((p) => p.color === "#e2622b" && p.role === "mirror")).toBe(true);
    const woman = buildParts({ category: "person", variant: "person/standing", dimensions: [0.5, 1.75, 0.3], attributes: { ...PERSON_PRESETS.youngWoman } });
    const wc = new Set(woman.map((p) => p.color));
    for (const c of ["#f0cdb0", "#2a1d18", "#2f4a33", "#f2efe9", "#5a3a26", "#4a3426"]) expect(wc.has(c), c).toBe(true);
  });

  it("look: item color is the top fallback, invalid values fall back to defaults", () => {
    expect(personLook({}, "#123456").top).toBe("#123456");
    expect(personLook({ top: "ABCDEF" }, "#123456").top).toBe("#abcdef");
    const l = personLook({ skin: "nope", hairStyle: "mohawk", glasses: "ON-CAP" }, "#000000");
    expect(l.skin).toBe("#f1c7a5");
    expect(l.hairStyle).toBe("short");
    expect(l.glasses).toBe("on-cap");
  });

  it("attributes are part of the model and thumbnail cache keys", () => {
    expect(attributesKey({ b: "1", a: "2" })).toBe(attributesKey({ a: "2", b: "1" }));
    expect(attributesKey({})).toBe("");
    const dims: Vec3 = [0.5, 1.3, 0.75];
    const a = buildModel({ category: "person", dimensions: dims, id: "p", attributes: { top: "#ff0000" } });
    const a2 = buildModel({ category: "person", dimensions: dims, id: "p", attributes: { top: "#ff0000" } });
    const b = buildModel({ category: "person", dimensions: dims, id: "p", attributes: { top: "#00ff00" } });
    expect(a2).toBe(a);
    expect(b).not.toBe(a);
    expect(b.parts.some((p) => p.color === "#00ff00")).toBe(true);
    const viaItem = modelFor({ category: "person", dimensions: dims, id: "p", attributes: { top: "#00ff00" } });
    expect(viaItem).toBe(b);
    expect(thumbnailKey("person", undefined, undefined, { hair: "#111111" })).not.toBe(thumbnailKey("person"));
    expect(thumbnailKey("person", undefined, undefined, {})).toBe(thumbnailKey("person"));
  });
});

describe("armchair/swivel", () => {
  it("is registered with its French label and green default", () => {
    const v = MODELS.armchair.find((x) => x.key === "armchair/swivel")!;
    expect(v.label).toBe("Fauteuil pivotant");
    expect(v.defaultColor).toBe("#2f7d4f");
  });
  for (const dims of [[0.8, 0.74, 0.78], [0.56, 0.52, 0.55], [1.2, 0.95, 1.0]] as Vec3[]) {
    it(`fits ${dims.join("×")}`, () => {
      const parts = buildParts({ category: "armchair", variant: "armchair/swivel", dimensions: dims, color: "#2f7d4f" });
      expectFit(parts, dims, "swivel");
      expect(parts.some((p) => p.color === "#2f7d4f")).toBe(true);
      expect(partsTriangles(parts)).toBeLessThanOrEqual(3200);
    });
  }
});
