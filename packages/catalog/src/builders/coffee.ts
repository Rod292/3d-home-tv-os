/** Countertop coffee gear: espresso machine (E61-style single boiler) and single-dose grinder. */
import { type Build, Parts, clamp, darken, lighten, palette } from "./common";

/* --------------------------------------------------------- espresso machine */

/**
 * Boxy stainless espresso machine: cup tray on top, group head + portafilter at the front center
 * (the handle reaches the front, +Z), steam wand on the right, drip tray, PID display and knobs.
 */
export const espressoMachine: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const handleLen = clamp(d * 0.28, 0.04, 0.12);
  const zBack = -d / 2;
  const zFront = d / 2 - handleLen; // body front face
  const trim = darken(color, 0.35);
  const dark = palette.ink;
  // feet + body
  for (const sx of [-1, 1]) for (const sz of [zBack + 0.02, zFront - 0.02]) p.cyl(sx * (w / 2 - 0.02), sz, 0, 0.012, 0.01, 0.01, dark, { seg: 8 });
  const bodyTop = h - 0.012;
  p.rbox([-w / 2, 0.012, zBack], [w / 2, bodyTop, zFront], color, Math.min(0.012, w * 0.05), { seg: 2 });
  // darker side insets read from the iso view
  for (const s of [-1, 1]) p.box([s > 0 ? w / 2 - 0.001 : -w / 2 - 0.001 + 0.0, h * 0.3, zBack + 0.03], [s > 0 ? w / 2 + 0.0 : -w / 2 + 0.001, bodyTop - 0.03, zFront - 0.03], trim);
  // cup tray rails on top
  p.box([-w / 2 + 0.01, bodyTop, zBack + 0.01], [w / 2 - 0.01, h, zFront - 0.01], lighten(color, 0.1));
  for (let i = 1; i < 6; i++) {
    const x = -w / 2 + (w * i) / 6;
    p.box([x - 0.002, h - 0.001, zBack + 0.02], [x + 0.002, h, zFront - 0.02], trim);
  }
  // front panel: PID display + pressure gauge + two knobs
  const fz = zFront;
  p.box([-w * 0.12, bodyTop - 0.06, fz], [w * 0.12, bodyTop - 0.035, fz + 0.004], "#1b2a33", { role: "screen" });
  p.cylZ(w * 0.28, bodyTop - 0.05, fz, fz + 0.006, 0.018, 0.018, palette.offWhite, { seg: 14 });
  for (const s of [-1, 1]) p.cylZ(s * w * 0.36, h * 0.45, fz, fz + 0.014, 0.012, 0.012, dark, { seg: 10 });
  // group head + portafilter (the handle defines the front of the bounding box)
  const gy = h * 0.52;
  p.cyl(0, fz + 0.035, gy, gy + 0.05, 0.032, 0.032, palette.steel, { seg: 16 });
  p.cyl(0, fz + 0.035, gy - 0.025, gy, 0.034, 0.034, lighten(palette.steel, 0.1), { seg: 16 });
  p.cylZ(0, gy - 0.012, fz + 0.06, d / 2 - 0.012, 0.011, 0.011, dark, { seg: 8 });
  p.sphere([0, gy - 0.012, d / 2 - 0.012], [0.012, 0.012, 0.012], dark, { seg: 8 });
  // steam wand on the right
  const wx = w / 2 - Math.min(0.035, w * 0.15);
  p.add({ kind: "tube", path: [[wx, h * 0.7, fz], [wx + 0.005, h * 0.66, fz + 0.03], [wx, h * 0.3, fz + 0.04]], r: 0.004, seg: 6, steps: 10 }, [0, 0, 0], palette.steel);
  // drip tray
  p.rbox([-w / 2 + 0.015, 0.012, fz - 0.002], [w / 2 - 0.015, 0.04, fz + Math.min(0.06, handleLen * 0.9)], color, 0.005, { seg: 1 });
  p.box([-w / 2 + 0.03, 0.04, fz + 0.005], [w / 2 - 0.03, 0.042, fz + Math.min(0.055, handleLen * 0.85)], trim);
  return p;
};

/* ------------------------------------------------------------------ grinder */

/**
 * Single-dose flat-burr grinder: square-ish body, burr chamber, funnel hopper on top,
 * spout + dosing cup on its stand at the front (+Z).
 */
export const coffeeGrinder: Build = (c) => {
  const p = new Parts();
  const { w, h, d, color } = c;
  const standLen = clamp(d * 0.32, 0.04, 0.09);
  const zBack = -d / 2;
  const zFront = d / 2 - standLen;
  const shade = darken(color, 0.3);
  const metal = palette.steel;
  // base plate spans the full depth (stand for the dosing cup)
  p.rbox([-w / 2, 0, zBack], [w / 2, 0.02, d / 2], shade, 0.006, { seg: 1 });
  // motor body
  const bodyTop = h * 0.62;
  p.rbox([-w / 2, 0.02, zBack], [w / 2, bodyTop, zFront], color, Math.min(0.018, w * 0.12), { seg: 2 });
  p.cylZ(w * 0.25, h * 0.15, zFront, zFront + 0.008, 0.01, 0.01, metal, { seg: 10 }); // on/off knob
  // burr chamber + hopper funnel
  const cz = (zBack + zFront) / 2;
  const rc = Math.min(w, zFront - zBack) * 0.42;
  p.cyl(0, cz, bodyTop, bodyTop + h * 0.08, rc, rc, metal, { seg: 20 });
  p.cyl(0, cz, bodyTop + h * 0.08, bodyTop + h * 0.1, rc * 1.03, rc * 1.03, shade, { seg: 20 });
  p.add({ kind: "lathe", pts: [[rc * 0.3, 0], [rc * 0.35, 0.01], [Math.min(w / 2, rc * 1.15), h - bodyTop - h * 0.1]], seg: 20 }, [0, bodyTop + h * 0.1, cz], lighten(color, 0.08));
  // spout + dosing cup
  const sy = bodyTop - 0.03;
  p.box([-0.012, sy - 0.02, zFront], [0.012, sy, zFront + Math.min(0.03, standLen * 0.5)], metal);
  const cupR = Math.min(standLen * 0.45, w * 0.3);
  p.cyl(0, d / 2 - cupR, 0.02, 0.02 + Math.min(0.07, sy * 0.4), cupR, cupR, metal, { seg: 16 });
  return p;
};
