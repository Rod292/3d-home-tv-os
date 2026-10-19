import { describe, expect, it } from "vitest";
import { ITEM_CATEGORIES } from "@appart3d/scene";
import {
  frameBounds,
  thumbnailKey,
  thumbnailDimensions,
  renderCatalogThumbnail,
  getCachedThumbnail,
  THUMBNAIL_VIEW_DIR,
} from "../src/thumbnail";

/** Project a point with the returned camera (orthographic) → normalized [-1, 1] coords. */
function project(cam: ReturnType<typeof frameBounds>, p: [number, number, number]): [number, number] {
  const f = [cam.target[0] - cam.position[0], cam.target[1] - cam.position[1], cam.target[2] - cam.position[2]];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
  const fwd = f.map((v) => v / fl) as [number, number, number];
  // right = fwd × up(0,1,0), up = right × fwd (three.js lookAt convention)
  let r: [number, number, number] = [-fwd[2], 0, fwd[0]];
  const rl = Math.hypot(...r);
  r = r.map((v) => v / rl) as [number, number, number];
  const u: [number, number, number] = [r[1] * fwd[2] - r[2] * fwd[1], r[2] * fwd[0] - r[0] * fwd[2], r[0] * fwd[1] - r[1] * fwd[0]];
  const q = [p[0] - cam.position[0], p[1] - cam.position[1], p[2] - cam.position[2]] as const;
  const x = q[0] * r[0] + q[1] * r[1] + q[2] * r[2];
  const y = q[0] * u[0] + q[1] * u[1] + q[2] * u[2];
  return [(x - (cam.left + cam.right) / 2) / ((cam.right - cam.left) / 2), (y - (cam.top + cam.bottom) / 2) / ((cam.top - cam.bottom) / 2)];
}

function corners(min: [number, number, number], max: [number, number, number]) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) out.push([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
  return out;
}

describe("thumbnail camera framing", () => {
  const boxes: [[number, number, number], [number, number, number]][] = [
    [[-1.1, 0, -0.475], [1.1, 0.85, 0.475]], // sofa
    [[-0.2, 0, -0.2], [0.2, 2.4, 0.2]], // tall & thin
    [[-1, 0, -0.7], [1, 0.015, 0.7]], // rug
    [[-0.5, 0, -1.7], [0.5, 2.6, 1.7]], // stairs
  ];
  for (const [min, max] of boxes) {
    it(`frames ${max.join("×")} inside the image, centered, filling it`, () => {
      const cam = frameBounds(min, max, { margin: 0.08 });
      expect(cam.right - cam.left).toBeCloseTo(cam.top - cam.bottom, 6); // square
      const pts = corners(min, max).map((p) => project(cam, p));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      for (const v of [...xs, ...ys]) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-6);
      // centered
      expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 5);
      expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0, 5);
      // the larger extent fills the frame minus the margin
      const fill = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
      expect(fill).toBeCloseTo(1 / 1.16, 3);
      // everything between near and far
      for (const p of corners(min, max)) {
        const dist = Math.hypot(p[0] - cam.position[0], p[1] - cam.position[1], p[2] - cam.position[2]);
        expect(dist).toBeGreaterThan(cam.near);
        expect(dist).toBeLessThan(cam.far);
      }
    });
  }

  it("looks at the model from the front-right, above (3/4 iso)", () => {
    const cam = frameBounds([-0.5, 0, -0.5], [0.5, 1, 0.5]);
    const d = [cam.position[0] - cam.target[0], cam.position[1] - cam.target[1], cam.position[2] - cam.target[2]];
    expect(d[0]).toBeGreaterThan(0);
    expect(d[1]).toBeGreaterThan(0);
    expect(d[2]).toBeGreaterThan(0);
    expect(THUMBNAIL_VIEW_DIR[2]).toBeGreaterThan(THUMBNAIL_VIEW_DIR[0]);
  });
});

describe("thumbnail cache key", () => {
  it("resolves the default variant and default color", () => {
    expect(thumbnailKey("sofa")).toBe(thumbnailKey("sofa", "sofa/modern"));
    expect(thumbnailKey("sofa", "modern")).toBe(thumbnailKey("sofa", "sofa/modern"));
    expect(thumbnailKey("sofa", "sofa/nope")).toBe(thumbnailKey("sofa"));
    expect(thumbnailKey("sofa")).toBe("sofa/modern|#5b7fa6");
    // variant default color
    expect(thumbnailKey("sofa", "sofa/rounded")).toBe("sofa/rounded|#d38a66");
  });

  it("normalizes colors and distinguishes them", () => {
    expect(thumbnailKey("chair", undefined, "#ABC")).toBe(thumbnailKey("chair", undefined, "#aabbcc"));
    expect(thumbnailKey("chair", undefined, "#aabbcc")).not.toBe(thumbnailKey("chair", undefined, "#aabbcd"));
  });

  it("has dimensions for every category", () => {
    for (const c of ITEM_CATEGORIES) {
      const d = thumbnailDimensions(c);
      expect(d.every((v) => v > 0), c).toBe(true);
    }
    expect(thumbnailDimensions("lamp", "lamp/globe")).toEqual([0.3, 0.4, 0.3]);
  });
});

describe("thumbnail rendering without WebGL", () => {
  it("resolves to undefined and never throws (SSR / node)", async () => {
    await expect(renderCatalogThumbnail("sofa")).resolves.toBeUndefined();
    expect(getCachedThumbnail("sofa")).toBeUndefined();
  });
});
