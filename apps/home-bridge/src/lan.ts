import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";

/** Non-internal IPv4 addresses (en0 first). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  const ifs = networkInterfaces();
  const names = Object.keys(ifs).sort((a, b) => (a === "en0" ? -1 : b === "en0" ? 1 : a.localeCompare(b)));
  for (const name of names) {
    if (/^(utun|bridge|awdl|llw|vmnet|docker)/.test(name)) continue;
    for (const i of ifs[name] ?? []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out;
}

/** macOS Bonjour host name (e.g. "My-MacBook-Pro"), lower-cased; null elsewhere. */
export function localHostName(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const name = execFileSync("/usr/sbin/scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim();
    return name ? name.toLowerCase() : null;
  } catch {
    return null;
  }
}
