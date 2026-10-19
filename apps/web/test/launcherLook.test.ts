import { describe, expect, it } from "vitest";
import { isLauncherApp, launcherPalette } from "../src/lib/launcherLook";

describe("launcherPalette", () => {
  it("follows the sun", () => {
    expect(launcherPalette(40).base[0]).toBe("#1e3a64");
    expect(launcherPalette(3).base[0]).toBe("#2a2350");
    expect(launcherPalette(-12).base[0]).toBe("#0b1026");
    expect(launcherPalette(null)).toBe(launcherPalette(40));
  });
});

describe("isLauncherApp", () => {
  it("recognizes the Maison home screen", () => {
    expect(isLauncherApp("Tvlauncher")).toBe(true);
    expect(isLauncherApp("Maison")).toBe(true);
    expect(isLauncherApp("Netflix")).toBe(false);
    expect(isLauncherApp(undefined)).toBe(false);
  });
});
