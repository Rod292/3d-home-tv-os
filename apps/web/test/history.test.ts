import { describe, expect, it } from "vitest";
import { COALESCE_MS, emptyHistory, record, redo, undo } from "../src/state/history";

describe("history", () => {
  it("undoes and redoes snapshots", () => {
    let h = emptyHistory<number>();
    h = record(h, 0, undefined, 0);
    h = record(h, 1, undefined, 10);
    const u = undo(h, 2)!;
    expect(u.value).toBe(1);
    const u2 = undo(u.history, u.value)!;
    expect(u2.value).toBe(0);
    expect(undo(u2.history, 0)).toBeNull();
    const r = redo(u2.history, 0)!;
    expect(r.value).toBe(1);
    expect(redo(r.history, 1)!.value).toBe(2);
  });

  it("coalesces rapid edits with the same key", () => {
    let h = emptyHistory<number>();
    h = record(h, 0, "dim", 0);
    h = record(h, 1, "dim", 100);
    h = record(h, 2, "dim", 200);
    expect(h.past).toEqual([0]);
    h = record(h, 3, "dim", 200 + COALESCE_MS + 1);
    expect(h.past).toEqual([0, 3]);
    h = record(h, 4, "other", 2000);
    expect(h.past).toEqual([0, 3, 4]);
  });

  it("clears redo on new change and caps size", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 10; i++) h = record(h, i, undefined, i, 5);
    expect(h.past).toEqual([5, 6, 7, 8, 9]);
    const u = undo(h, 10)!;
    expect(u.history.future).toEqual([10]);
    expect(record(u.history, 9).future).toEqual([]);
  });
});
