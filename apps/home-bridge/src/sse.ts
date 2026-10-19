/** Server-sent events framing. Events use the default "message" type so EventSource.onmessage gets them. */
import type { HomeEvent } from "@appart3d/home";

export function sseFrame(event: HomeEvent): string {
  // JSON.stringify never emits raw newlines, but split defensively: each line needs its own "data:".
  return JSON.stringify(event).split("\n").map((l) => `data: ${l}`).join("\n") + "\n\n";
}

export const SSE_RETRY = "retry: 3000\n\n";
export const SSE_PING = ": ping\n\n";
