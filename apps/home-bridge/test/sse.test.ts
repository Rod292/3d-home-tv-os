import { describe, expect, it } from "vitest";
import { sseFrame } from "../src/sse.ts";

describe("SSE framing", () => {
  it("one data line, blank-line terminated, default event type", () => {
    const f = sseFrame({ type: "error", message: "a\nb" });
    expect(f).toBe('data: {"type":"error","message":"a\\nb"}\n\n');
    expect(f.split("\n\n").length).toBe(2);
    expect(f.startsWith("event:")).toBe(false);
    expect(JSON.parse(f.slice(6))).toEqual({ type: "error", message: "a\nb" });
  });
});
