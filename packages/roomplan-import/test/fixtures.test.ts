/**
 * Keeps fixtures/*.appart3d.json in sync with src/fixtures.ts.
 * Regenerate with: UPDATE_FIXTURES=1 pnpm --filter @appart3d/roomplan-import test
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateFixtureEnvelope } from "../src";

const FILES = {
  "single-room.appart3d.json": () => generateFixtureEnvelope("single"),
  "multi-room-structure.appart3d.json": () => generateFixtureEnvelope("multi"),
  "ios16-room.appart3d.json": () => generateFixtureEnvelope("ios16"),
  "demo-scan.appart3d.json": () => generateFixtureEnvelope("multi"),
} as const;

describe("fixture files", () => {
  for (const [name, gen] of Object.entries(FILES)) {
    it(`${name} matches the generator`, () => {
      const url = new URL(`../fixtures/${name}`, import.meta.url);
      const expected = JSON.stringify(gen(), null, 2) + "\n";
      if (process.env.UPDATE_FIXTURES || !existsSync(url)) writeFileSync(url, expected);
      expect(readFileSync(url, "utf8")).toBe(expected);
    });
  }
});
