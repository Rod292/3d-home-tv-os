/**
 * Bridge configuration: ~/.config/appart3d/home.json (mode 600), created with defaults on first run.
 * Override the path with HOME_BRIDGE_CONFIG (tests, experiments).
 */
import { randomBytes, randomInt } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface BridgeConfig {
  port: number;
  host: string;
  homeName: string;
  /** Long random secret; clients send it as Bearer token or get it as the appart3d_home cookie. */
  accessToken: string;
  /** 6 digits, exchanged for the cookie at GET /pair?code=… (rotate: `pnpm pair --rotate`). */
  pairCode: string;
  /** Built web app to serve (null = apps/web/dist of this repo). */
  webDist: string | null;
  /** Advertise the bridge on the LAN with Bonjour (`_appart3d._tcp`, via macOS dns-sd) for native apps. */
  bonjour: boolean;
  /** Origins allowed by CORS (with credentials). */
  corsOrigins: string[];
  /** Scene opened by "/" when the URL has no ?scene= (phone PWA, menu bar app). null = app default. */
  defaultScene: string | null;
  hue: { enabled: boolean; configFile: string; pollMs: number };
  homeAssistant: { enabled: boolean; url: string; tokenFile: string; tvEntity: string | null };
  /** StackChan robot base URL, e.g. "http://192.168.1.42:8080". null = robot disabled. */
  robotUrl: string | null;
  /** Shared key sent as X-Cam-Key header (see firmware cam_secret.h). */
  robotKey: string | null;
  /**
   * Sony amplifier driven by the robot's infrared (the TV's sound goes through it, optical = fixed TV
   * level): the TV's volume ± and the amp_mute / amp_power buttons are sent as Sony SIRC codes.
   */
  amp: { enabled: boolean; address: number; bits: number; framesPerStep: number };
  /** Source room name (Hue room, HA area) -> label shown in the apps. */
  rooms: Record<string, string>;
  /** Per-device room override: device id -> label. */
  deviceRooms: Record<string, string>;
  /** Per-device display name override. */
  deviceNames: Record<string, string>;
  /**
   * Device -> 3D item links. Keys are device ids, or "kind:<kind>" (applies to every device of that
   * kind without an explicit entry). A null value means "explicitly unlinked".
   */
  links: Record<string, string | null>;
  /** Tile order shared by every client (device ids; unlisted devices follow in the usual order). */
  deviceOrder: string[];
  /** Devices with a special role in scenes. */
  roles: { ambientStrip: string | null };
  /** Home coordinates, for the sun position when Home Assistant's `sun.sun` is unavailable. */
  location: { latitude: number; longitude: number };
  /**
   * HomePod mini over AirPlay, driven from the Mac with pyatv (Home Assistant in Docker can't reach it).
   * `host` (Bonjour) is re-resolved when `ip` stops answering; `id` = AirPlay identifier (last resort scan);
   * `python` = bin directory of the pyatv venv.
   */
  homepod: { enabled: boolean; host: string; ip: string | null; id: string | null; name: string; room: string; python: string };
}

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_WEB_DIST = resolve(APP_DIR, "../web/dist");
/** Source of /shared/* (scene, photos): served live so a scene edit shows up without rebuilding the web app. */
export const DEFAULT_SHARED_DIR = resolve(APP_DIR, "../web/public/shared");

export function configPath(): string {
  return process.env.HOME_BRIDGE_CONFIG ?? join(homedir(), ".config", "appart3d", "home.json");
}

export function newAccessToken(): string {
  return randomBytes(32).toString("hex");
}

export function newPairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const MOCK = process.env.HOME_BRIDGE_MOCK === "1";
/** Mock devices (src/mock.ts) → items of apps/web/public/shared/demo-apartment.json. */
export const DEMO_NAMES: Record<string, string> = { "hue:light:12": "Lampe à poser", "hue:light:18": "Lampadaire", "hue:light:9": "Suspension", "hue:light:17": "Suspension cuisine", "hue:light:8": "Lampe donut" };
export const DEMO_LINKS: Record<string, string> = {
  "hue:light:12": "item_table_lamp",
  "hue:light:18": "item_floorlamp",
  "hue:light:17": "item_pendant_kitchen",
  "hue:light:8": "item_donut",
  "kind:fan": "item_fan",
  "kind:tv": "item_2",
};

export function defaultConfig(): BridgeConfig {
  return {
    port: 8787,
    host: "0.0.0.0",
    homeName: "Home",
    accessToken: newAccessToken(),
    pairCode: newPairCode(),
    webDist: null,
    bonjour: true,
    corsOrigins: ["http://localhost:5173"],
    defaultScene: "/shared/demo-apartment.json",
    hue: { enabled: true, configFile: join(homedir(), ".config", "appart3d", "hue.env"), pollMs: 1500 },
    homeAssistant: {
      enabled: true,
      url: "http://localhost:8123",
      tokenFile: join(homedir(), ".config", "appart3d", "ha-token"),
      tvEntity: null,
    },
    robotUrl: null,
    robotKey: null,
    amp: { enabled: true, address: 16, bits: 12, framesPerStep: 20 },
    rooms: { "Living room": "Salon", Kitchen: "Cuisine", Bedroom: "Chambre" },
    deviceRooms: {},
    // Your devices: display names and links to 3D items, set in ~/.config/appart3d/home.json.
    // e.g. deviceNames: { "hue:light:3": "Floor lamp" }, links: { "hue:light:3": "item_floorlamp", "kind:tv": "item_tv" }
    // The mock (HOME_BRIDGE_MOCK=1) comes linked to the demo apartment, so it works end to end with no hardware.
    deviceNames: MOCK ? DEMO_NAMES : {},
    links: MOCK ? DEMO_LINKS : {},
    deviceOrder: [],
    roles: { ambientStrip: MOCK ? "hue:light:12" : null },
    location: { latitude: 48.86, longitude: 2.35 },
    homepod: {
      enabled: false,
      host: "Living-Room.local",
      ip: null,
      id: null,
      name: "HomePod mini",
      room: "Salon",
      python: "~/.config/appart3d/pyatv-venv/bin",
    },
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge saved values over defaults (one level of nested objects; maps are taken as-is). */
export function mergeConfig(defaults: BridgeConfig, saved: unknown): BridgeConfig {
  if (!isObj(saved)) return defaults;
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(saved)) {
    const d = (defaults as unknown as Record<string, unknown>)[k];
    if (isObj(d) && isObj(v) && (k === "hue" || k === "homeAssistant" || k === "roles" || k === "location" || k === "homepod")) out[k] = { ...d, ...v };
    else out[k] = v;
  }
  const cfg = out as unknown as BridgeConfig;
  if (typeof cfg.accessToken !== "string" || cfg.accessToken.length < 32) cfg.accessToken = newAccessToken();
  if (typeof cfg.pairCode !== "string" || !/^\d{6}$/.test(cfg.pairCode)) cfg.pairCode = newPairCode();
  return cfg;
}

export function writeConfig(cfg: BridgeConfig, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

/** Load (creating or completing the file if needed). */
export function loadConfig(path = configPath()): { config: BridgeConfig; created: boolean } {
  if (!existsSync(path)) {
    const cfg = defaultConfig();
    writeConfig(cfg, path);
    return { config: cfg, created: true };
  }
  const raw = readFileSync(path, "utf8");
  const saved: unknown = JSON.parse(raw);
  const cfg = mergeConfig(defaultConfig(), saved);
  if (JSON.stringify(cfg, null, 2) + "\n" !== raw) writeConfig(cfg, path);
  return { config: cfg, created: false };
}

/** Read-modify-write so concurrent edits (pair CLI vs server) don't clobber each other. */
export function updateConfig(mutate: (cfg: BridgeConfig) => void, path = configPath()): BridgeConfig {
  const { config } = loadConfig(path);
  mutate(config);
  writeConfig(config, path);
  return config;
}

/** Parse shell-style `KEY=value` lines (optional `export`, quotes, comments). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]!] = v;
  }
  return out;
}

export function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}
