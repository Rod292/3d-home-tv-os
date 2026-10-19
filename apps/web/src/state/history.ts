/**
 * Snapshot-based undo/redo. Scenes are immutable (produced with immer), so each snapshot
 * shares structure with its neighbours and costs almost nothing.
 */
export interface History<T> {
  past: T[];
  future: T[];
  /** Key of the last recorded change, used to merge rapid edits (slider drags, repeated R). */
  lastKey?: string;
  lastTime: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 900;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastTime: 0 };
}

/** Record `previous` (the state before a change) so it can be restored by undo. */
export function record<T>(h: History<T>, previous: T, key?: string, now = Date.now(), limit = HISTORY_LIMIT): History<T> {
  if (key !== undefined && key === h.lastKey && now - h.lastTime < COALESCE_MS && h.past.length > 0) {
    return { ...h, future: [], lastTime: now };
  }
  const past = h.past.length >= limit ? [...h.past.slice(h.past.length - limit + 1), previous] : [...h.past, previous];
  return { past, future: [], lastKey: key, lastTime: now };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = h.past[h.past.length - 1];
  if (value === undefined) return null;
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future], lastTime: 0 }, value };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = h.future[0];
  if (value === undefined) return null;
  return { history: { past: [...h.past, current], future: h.future.slice(1), lastTime: 0 }, value };
}
