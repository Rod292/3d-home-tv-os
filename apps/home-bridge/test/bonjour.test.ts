import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { advertise, bonjourArgs, restartDelay } from "../src/bonjour.ts";

describe("bonjour", () => {
  it("dns-sd arguments", () => {
    expect(bonjourArgs("Chez Alex et Sam", 8787)).toEqual([
      "-R",
      "Chez Alex et Sam",
      "_appart3d._tcp",
      "local",
      "8787",
      "home=Chez Alex et Sam",
    ]);
  });

  it("restart backoff", () => {
    expect([1, 2, 3, 10].map(restartDelay)).toEqual([2000, 4000, 8000, 60000]);
  });

  it("skips non-macOS and missing binary", () => {
    const spawnFn = vi.fn();
    advertise({ name: "x", port: 1, platform: "linux", spawnFn: spawnFn as never }).stop();
    advertise({ name: "x", port: 1, platform: "darwin", bin: "/nonexistent/dns-sd", spawnFn: spawnFn as never }).stop();
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("spawns, restarts on exit, kills on stop", () => {
    vi.useFakeTimers();
    const children: (EventEmitter & { kill: ReturnType<typeof vi.fn> })[] = [];
    const spawnFn = vi.fn(() => {
      const c = Object.assign(new EventEmitter(), { kill: vi.fn(), stderr: new EventEmitter() });
      children.push(c);
      return c;
    });
    const h = advertise({ name: "Test", port: 9, platform: "darwin", bin: process.execPath, spawnFn: spawnFn as never });
    expect(spawnFn).toHaveBeenCalledWith(process.execPath, bonjourArgs("Test", 9), expect.anything());
    children[0]!.emit("exit", 1, null);
    vi.advanceTimersByTime(2000);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    h.stop();
    expect(children[1]!.kill).toHaveBeenCalledWith("SIGTERM");
    children[1]!.emit("exit", null, "SIGTERM");
    vi.advanceTimersByTime(120_000);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
