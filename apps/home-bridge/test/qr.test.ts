import { describe, expect, it } from "vitest";
import { encodeQr } from "../src/qr.ts";

describe("QR encoder", () => {
  it("picks the smallest version and draws finder patterns", () => {
    const m = encodeQr("http://192.168.1.23:8787/pair?code=123456");
    expect(m.length).toBe(29); // version 3-M
    const row0 = m[0]!.slice(0, 7).map(Number).join("");
    expect(row0).toBe("1111111");
    expect(m[1]!.slice(0, 7).map(Number).join("")).toBe("1000001");
    expect(m[m.length - 8]![8]).toBe(true); // dark module
  });
});
