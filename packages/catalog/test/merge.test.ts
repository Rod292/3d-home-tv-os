import { describe, expect, it } from "vitest";
import { mergeParts } from "../src/merge";
import { modelFor } from "../src/model";

describe("mergeParts", () => {
  it("draws a model with one mesh per material", () => {
    const model = modelFor({ category: "floorLamp", variant: "floorLamp/evedal", dimensions: [0.32, 1.5, 0.32], id: "t" } as never);
    const merged = mergeParts(model.parts);
    const materials = new Set(model.parts.map((p) => `${p.color.toLowerCase()}|${p.role ?? "toon"}|${p.castShadow !== false}`));
    expect(merged.length).toBe(materials.size);
    expect(merged.length).toBeLessThan(model.parts.length);
    // Transforms are baked: the merged bounds match the model's own extent (up to its fit transform).
    const top = Math.max(...merged.map((g) => (g.geometry.computeBoundingBox(), g.geometry.boundingBox!.max.y)));
    expect(top).toBeGreaterThan(1);
  });
});
