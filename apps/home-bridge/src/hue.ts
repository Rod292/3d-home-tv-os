/** Philips Hue adapter (API v1 over HTTPS, self-signed certificate, polling with change detection). */
import type { Device, DeviceAction, DeviceCapabilities, DeviceState } from "@appart3d/home";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Agent, request } from "node:https";
import {
  briToPercent,
  clamp,
  hexToXy,
  hsToHex,
  kelvinToHex,
  kelvinToMired,
  miredToKelvin,
  percentToBri,
  xyToHex,
} from "./color.ts";
import { parseEnvFile } from "./config.ts";
import { discoverHueIps } from "./hueDiscovery.ts";
import { errMsg, logger } from "./log.ts";
import { HttpError, type Adapter } from "./types.ts";

const log = logger("hue");

export interface HueLightState {
  on?: boolean;
  bri?: number;
  hue?: number;
  sat?: number;
  xy?: [number, number];
  ct?: number;
  colormode?: "xy" | "ct" | "hs";
  reachable?: boolean;
}

export interface HueLight {
  name: string;
  type: string;
  modelid?: string;
  state: HueLightState;
  capabilities?: { control?: { ct?: { min: number; max: number }; colorgamuttype?: string } };
}

export interface HueGroup {
  name: string;
  type: string;
  class?: string;
  lights: string[];
}

export function hueKind(light: HueLight): "light" | "plug" {
  return /plug/i.test(light.type) ? "plug" : "light";
}

export function hueCapabilities(light: HueLight): DeviceCapabilities {
  const t = light.type.toLowerCase();
  const caps: DeviceCapabilities = {};
  if (t.includes("dimmable") || t.includes("color")) caps.brightness = true;
  if (t.includes("extended color") || t === "color light") caps.color = true;
  if (t.includes("color temperature") || (t.includes("extended color") && light.capabilities?.control?.ct !== undefined))
    caps.kelvin = true;
  return caps;
}

export function hueStateToDeviceState(light: HueLight): DeviceState {
  const s = light.state;
  const reachable = s.reachable !== false;
  const caps = hueCapabilities(light);
  const state: DeviceState = { on: reachable ? (s.on ?? null) : null, reachable };
  if (caps.brightness && typeof s.bri === "number") state.brightness = briToPercent(s.bri);
  if (caps.color || caps.kelvin) {
    const mode = s.colormode ?? (caps.color ? "xy" : "ct");
    if (mode === "ct" && typeof s.ct === "number") {
      state.kelvin = miredToKelvin(s.ct);
      state.color = kelvinToHex(state.kelvin);
    } else if (mode === "hs" && typeof s.hue === "number" && typeof s.sat === "number") {
      state.color = hsToHex(s.hue, s.sat);
    } else if (s.xy) {
      state.color = xyToHex(s.xy[0], s.xy[1]);
    }
  }
  return state;
}

export function hueLightToDevice(id: string, light: HueLight, room: string): Device {
  return {
    id: `hue:light:${id}`,
    name: light.name,
    kind: hueKind(light),
    source: "hue",
    room,
    state: hueStateToDeviceState(light),
    capabilities: hueCapabilities(light),
  };
}

/** Merge DeviceActions into one Hue v1 state body. */
export function hueActionsToBody(actions: DeviceAction[], light: HueLight): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const ctRange = light.capabilities?.control?.ct ?? { min: 153, max: 500 };
  for (const a of actions) {
    switch (a.type) {
      case "toggle":
        body.on = !(light.state.on ?? false);
        break;
      case "power":
        body.on = a.on;
        break;
      case "brightness":
        if (a.value <= 0) body.on = false;
        else {
          body.on = true;
          body.bri = percentToBri(a.value);
        }
        break;
      case "color":
        body.on = body.on ?? true;
        body.xy = hexToXy(a.hex);
        delete body.ct;
        break;
      case "kelvin":
        body.on = body.on ?? true;
        body.ct = clamp(kelvinToMired(a.value), ctRange.min, ctRange.max);
        delete body.xy;
        break;
      default:
        throw new HttpError(400, `action ${a.type} non supportée par une lampe Hue`);
    }
  }
  if (body.on === false) return { on: false };
  if (hueKind(light) === "plug") return "on" in body ? { on: body.on } : {};
  return body;
}

/** Map lights to their Room (not Zone) name. */
export function hueRoomIndex(groups: Record<string, HueGroup>): Map<string, string> {
  const idx = new Map<string, string>();
  for (const g of Object.values(groups)) {
    if (g.type !== "Room") continue;
    for (const l of g.lights) idx.set(l, g.name);
  }
  return idx;
}

const insecureAgent = new Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 4 });

function hueRequest(method: string, url: string, body?: unknown): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      url,
      {
        method,
        agent: insecureAgent,
        timeout: 5000,
        headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error(`réponse Hue illisible (HTTP ${res.statusCode})`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    // Never include the URL in errors: it contains the Hue username.
    req.on("error", (e) => reject(new Error(`pont Hue injoignable: ${e.message}`)));
    if (data) req.write(data);
    req.end();
  });
}

/** The bridge answered with an API error (bad key…): not a network problem, no rediscovery. */
class HueApiError extends Error {}

function hueApiError(res: unknown): string | null {
  if (Array.isArray(res)) {
    const errs = res
      .map((r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: { description?: string } }).error : null))
      .filter((e) => e !== null);
    if (errs.length) return errs.map((e) => e.description ?? "erreur").join("; ");
  }
  return null;
}

export class HueAdapter implements Adapter {
  readonly name = "hue";
  private base = "";
  private lights: Record<string, HueLight> = {};
  private rooms = new Map<string, string>();
  private lastRaw = "";
  private timer: NodeJS.Timeout | null = null;
  private lastGroups = 0;
  private problem: string | null = null;
  private onChange: () => void = () => {};
  private stopped = false;
  private configFile: string;
  private pollMs: number;
  private user = "";
  private ip = "";
  private failures = 0;
  private lastDiscovery = 0;
  private discovering = false;

  constructor(configFile: string, pollMs: number) {
    this.configFile = configFile;
    this.pollMs = pollMs;
  }

  async start(onChange: () => void): Promise<void> {
    this.onChange = onChange;
    let env: Record<string, string>;
    try {
      env = parseEnvFile(readFileSync(this.configFile, "utf8"));
    } catch (e) {
      this.problem = `Hue désactivé : config illisible (${errMsg(e)})`;
      log.warn(this.problem);
      return;
    }
    const ip = env.HUE_BRIDGE_IP;
    const user = env.HUE_USERNAME;
    if (!ip || !user) {
      this.problem = "Hue désactivé : HUE_BRIDGE_IP / HUE_USERNAME manquants";
      log.warn(this.problem);
      return;
    }
    this.user = user;
    // An address found by rediscovery (after a router reboot) wins over the original config.
    this.ip = readCachedIp() ?? ip;
    this.base = `https://${this.ip}/api/${user}`;
    log.info(`pont Hue ${this.ip}, sondage toutes les ${this.pollMs} ms`);
    await this.poll();
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  warnings(): string[] {
    return this.problem ? [this.problem] : [];
  }

  devices(): Device[] {
    const down = this.problem !== null;
    return Object.entries(this.lights).map(([id, l]) => {
      const d = hueLightToDevice(id, l, this.rooms.get(id) ?? "");
      // Bridge unreachable: keep the last known list but show everything as unreachable.
      if (down) d.state = { ...d.state, on: null, reachable: false };
      return d;
    });
  }

  async act(id: string, actions: DeviceAction[]): Promise<void> {
    if (!this.base) throw new HttpError(503, "Hue indisponible");
    const lightId = /^hue:light:(\d+)$/.exec(id)?.[1];
    const light = lightId ? this.lights[lightId] : undefined;
    if (!lightId || !light) throw new HttpError(404, `lampe inconnue ${id}`);
    const body = hueActionsToBody(actions, light);
    if (Object.keys(body).length === 0) return;
    const res = await hueRequest("PUT", `${this.base}/lights/${lightId}/state`, body);
    const err = hueApiError(res);
    if (err) throw new HttpError(502, `Hue: ${err}`);
    await this.poll();
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      await this.poll();
      this.schedule();
    }, this.pollMs);
  }

  private async poll(): Promise<void> {
    try {
      if (Date.now() - this.lastGroups > 60_000) {
        const groups = await hueRequest("GET", `${this.base}/groups`);
        const err = hueApiError(groups);
        if (err) throw new HueApiError(err);
        this.rooms = hueRoomIndex(groups as Record<string, HueGroup>);
        this.lastGroups = Date.now();
      }
      const lights = await hueRequest("GET", `${this.base}/lights`);
      const err = hueApiError(lights);
      if (err) throw new HueApiError(err);
      const raw = JSON.stringify(lights);
      this.failures = 0;
      const recovered = this.problem !== null;
      if (recovered) log.info("pont Hue de nouveau joignable");
      this.problem = null;
      if (recovered || raw !== this.lastRaw) {
        this.lastRaw = raw;
        this.lights = lights as Record<string, HueLight>;
        this.onChange();
      }
    } catch (e) {
      const msg = `Hue: ${errMsg(e)}`;
      if (msg !== this.problem) {
        log.warn(msg);
        this.problem = msg;
        this.onChange();
      }
      // Network failures (not API errors): the bridge may have a new IP after a Wi-Fi outage.
      if (!(e instanceof HueApiError)) this.failures++;
      if (this.failures >= 4 && !this.discovering && Date.now() - this.lastDiscovery > 60_000) void this.rediscover();
    }
  }

  private async rediscover(): Promise<void> {
    this.discovering = true;
    this.lastDiscovery = Date.now();
    try {
      log.info("pont Hue injoignable : recherche sur le réseau…");
      for (const ip of await discoverHueIps()) {
        if (ip === this.ip) continue;
        const base = `https://${ip}/api/${this.user}`;
        try {
          const cfg = await hueRequest("GET", `${base}/config`);
          if (hueApiError(cfg)) continue; // another bridge, or this key isn't authorized there
          log.info(`pont Hue retrouvé : ${this.ip} → ${ip}`);
          this.ip = ip;
          this.base = base;
          this.failures = 0;
          writeCachedIp(ip);
          await this.poll();
          return;
        } catch {
          /* not reachable: next candidate */
        }
      }
      log.warn("pont Hue introuvable sur le réseau (nouvel essai dans 1 min)");
    } finally {
      this.discovering = false;
    }
  }
}

const CACHE_FILE = join(homedir(), ".config", "appart3d", "hue-bridge-ip");

function readCachedIp(): string | null {
  try {
    const ip = readFileSync(CACHE_FILE, "utf8").trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

function writeCachedIp(ip: string): void {
  try {
    writeFileSync(CACHE_FILE, `${ip}\n`, { mode: 0o600 });
  } catch (e) {
    log.warn(`adresse du pont Hue non mémorisée : ${errMsg(e)}`);
  }
}
