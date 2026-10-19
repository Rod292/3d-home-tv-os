/**
 * Bonjour advertisement of the bridge (`_appart3d._tcp`, TXT home=<name>) so native apps find it on
 * the LAN. Uses macOS's `dns-sd -R` as a child process (no dependency); restarted if it exits,
 * killed on shutdown. No-op on other platforms or when dns-sd is missing.
 */
import { BONJOUR_SERVICE } from "@appart3d/home";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { errMsg, logger } from "./log.ts";

const log = logger("bonjour");

export const DNS_SD = "/usr/bin/dns-sd";

/** Arguments of `dns-sd -R <name> <type> local <port> home=<home>`. */
export function bonjourArgs(name: string, port: number, home = name): string[] {
  return ["-R", name, BONJOUR_SERVICE, "local", String(port), `home=${home}`];
}

/** Restart delay after the n-th consecutive failure: 2 s, 4 s, … capped at 60 s. */
export function restartDelay(failures: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, failures - 1));
}

export interface BonjourHandle {
  stop(): void;
}

export interface BonjourOptions {
  name: string;
  port: number;
  home?: string;
  platform?: NodeJS.Platform;
  bin?: string;
  spawnFn?: typeof spawn;
}

export function advertise(opts: BonjourOptions): BonjourHandle {
  const platform = opts.platform ?? process.platform;
  const bin = opts.bin ?? DNS_SD;
  const noop: BonjourHandle = { stop() {} };
  if (platform !== "darwin") {
    log.info("Bonjour ignoré (macOS uniquement)");
    return noop;
  }
  if (!existsSync(bin)) {
    log.warn(`Bonjour ignoré : ${bin} introuvable`);
    return noop;
  }
  const spawnFn = opts.spawnFn ?? spawn;
  const args = bonjourArgs(opts.name, opts.port, opts.home);
  let child: ChildProcess | null = null;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let failures = 0;
  let startedAt = 0;

  const start = () => {
    timer = null;
    if (stopped) return;
    startedAt = Date.now();
    const c = spawnFn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    child = c;
    c.stderr?.on("data", () => {}); // drain
    c.on("error", (e) => log.warn(`dns-sd : ${errMsg(e)}`));
    c.on("exit", (code, signal) => {
      if (child === c) child = null;
      if (stopped) return;
      failures = Date.now() - startedAt > 60_000 ? 1 : failures + 1;
      const delay = restartDelay(failures);
      log.warn(`dns-sd arrêté (${signal ?? code}), relance dans ${Math.round(delay / 1000)} s`);
      timer = setTimeout(start, delay);
      timer.unref();
    });
  };
  start();
  // Never leave an orphan advertisement behind if the bridge exits without calling stop().
  process.once("exit", () => child?.kill("SIGTERM"));
  log.info(`annonce « ${opts.name} » (${BONJOUR_SERVICE}, port ${opts.port})`);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      child?.kill("SIGTERM");
      child = null;
    },
  };
}
