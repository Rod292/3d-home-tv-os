/**
 * Finds the Hue bridge again when its IP changes (router reboot, DHCP): Bonjour `_hue._tcp`
 * through macOS's dns-sd first, then Philips' official discovery endpoint as a fallback.
 */
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";

/** Instance names from `dns-sd -B _hue._tcp` output ("… Add … _hue._tcp. Hue Bridge - 1A2B3C"). */
export function parseBrowse(out: string): string[] {
  const names = new Set<string>();
  for (const line of out.split("\n")) {
    const m = /\sAdd\s+\d+\s+\d+\s+\S+\s+_hue\._tcp\.\s+(.+)$/.exec(line);
    if (m) names.add(m[1]!.trim());
  }
  return [...names];
}

/** Host from `dns-sd -L` output ("… can be reached at ecb5fa1a2b3c.local.:443 …"). */
export function parseLookup(out: string): string | null {
  const m = /can be reached at\s+(\S+?)\.?:(\d+)/.exec(out);
  return m ? m[1]! : null;
}

/** IPs from https://discovery.meethue.com ([{ id, internalipaddress, port }]). */
export function parseCloud(body: unknown): string[] {
  if (!Array.isArray(body)) return [];
  return body.map((b) => (b as { internalipaddress?: unknown }).internalipaddress).filter((ip): ip is string => typeof ip === "string");
}

function run(args: string[], ms: number): Promise<string> {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn("/usr/bin/dns-sd", args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return resolve("");
    }
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.on("error", () => resolve(out));
    setTimeout(() => {
      child.kill();
      resolve(out);
    }, ms);
  });
}

/** Candidate bridge IPv4 addresses, best effort, never throws. */
export async function discoverHueIps(): Promise<string[]> {
  const ips = new Set<string>();
  if (process.platform === "darwin") {
    for (const name of parseBrowse(await run(["-B", "_hue._tcp", "local"], 3000))) {
      const host = parseLookup(await run(["-L", name, "_hue._tcp", "local"], 2500));
      if (!host) continue;
      try {
        ips.add((await lookup(host, { family: 4 })).address);
      } catch {
        /* unresolvable: skip */
      }
    }
  }
  if (ips.size === 0) {
    try {
      const res = await fetch("https://discovery.meethue.com", { signal: AbortSignal.timeout(5000) });
      for (const ip of parseCloud(await res.json())) ips.add(ip);
    } catch {
      /* offline: nothing more to try */
    }
  }
  return [...ips];
}
