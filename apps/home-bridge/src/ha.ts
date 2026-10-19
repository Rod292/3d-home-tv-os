/**
 * Home Assistant adapter: REST for service calls / initial states, WebSocket (Node's global
 * WebSocket) for registries and live `state_changed` events.
 * Exposes media_player (TV) and fan entities. Hue lights known to HA are ignored (Hue is driven
 * directly); a fan's own light (light.* on the same HA device) is folded into the fan device, and the
 * TV's Ambilight (philips_js light) into the TV device (`state.ambilight`).
 * Over ADB (androidtv integration) it also reads the TV's foreground app and installed apps, and
 * launches apps.
 */
import type { AmbilightCapabilities, AmbilightState, Device, DeviceAction, DeviceState, MediaInfo, SunInfo, TvApp } from "@appart3d/home";
import { tvAppButton } from "@appart3d/home";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { clamp, hsToHex, parseHex } from "./color.ts";
import { errMsg, logger } from "./log.ts";
import { sunFromHa } from "./sun.ts";
import { appLabel, FOCUS_COMMAND, installedApps, isAdbEntity, launchCommands, launchFailed, PACKAGES_COMMAND, parseFocus, parsePackages } from "./tvApp.ts";
import { HttpError, type Adapter, type Artwork } from "./types.ts";

const log = logger("ha");

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HaEntityEntry {
  entity_id: string;
  device_id?: string | null;
  platform?: string;
  area_id?: string | null;
  disabled_by?: string | null;
}

export interface HaRegistry {
  entities: HaEntityEntry[];
  /** device_id -> area_id */
  deviceAreas: Map<string, string | null>;
  /** area_id -> name */
  areas: Map<string, string>;
}

export interface HaMapping {
  devices: Device[];
  /** fan entity -> paired light entity */
  fanLights: Map<string, string>;
  /** TV entity -> its Ambilight light entity */
  ambilights: Map<string, string>;
}

const OFF_STATES = new Set(["off", "standby"]);
const DEAD_STATES = new Set(["unavailable", "unknown"]);

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function friendly(s: HaState): string {
  return str(s.attributes.friendly_name) ?? s.entity_id.split(".")[1]!.replace(/_/g, " ");
}

export function isTvEntity(s: HaState, entry: HaEntityEntry | undefined, tvEntity: string | null): boolean {
  if (!s.entity_id.startsWith("media_player.")) return false;
  if (tvEntity) return s.entity_id === tvEntity;
  if (isAdbEntity(s.entity_id)) return false; // the ADB link of the same TV, not a second TV
  return (
    s.attributes.device_class === "tv" ||
    entry?.platform === "philips_js" ||
    /(^|_|\.)tv(_|$)|television|philips/i.test(s.entity_id)
  );
}

function areaName(entry: HaEntityEntry | undefined, reg: HaRegistry | undefined): string {
  if (!entry || !reg) return "";
  const areaId = entry.area_id ?? (entry.device_id ? reg.deviceAreas.get(entry.device_id) : null) ?? null;
  return areaId ? (reg.areas.get(areaId) ?? "") : "";
}

/** Find the light belonging to a fan: same HA device, else a light whose name starts with the fan's. */
export function pairFanLight(fan: string, states: HaState[], reg: HaRegistry | undefined): string | undefined {
  const byId = new Map(reg?.entities.map((e) => [e.entity_id, e]) ?? []);
  const fanDevice = byId.get(fan)?.device_id;
  const lights = states.filter((s) => s.entity_id.startsWith("light.") && byId.get(s.entity_id)?.platform !== "hue");
  if (fanDevice) {
    const same = lights.find((l) => byId.get(l.entity_id)?.device_id === fanDevice);
    if (same) return same.entity_id;
  }
  const obj = fan.slice("fan.".length);
  return lights.find((l) => l.entity_id.slice("light.".length).startsWith(obj))?.entity_id;
}

/**
 * Content key of a Home Assistant `entity_picture` (its rotating `token` query left out, so the key only
 * changes with the picture itself). Never exposes the URL (it carries an access token).
 */
export function pictureKey(entityPicture: string): string {
  const stable = entityPicture.replace(/([?&])token=[^&]*&?/, "$1").replace(/[?&]$/, "");
  return createHash("sha1").update(stable).digest("hex").slice(0, 16);
}

/** What the TV shows (app, channel, programme title, picture proxied by the bridge). undefined = nothing known. */
export function haTvMedia(s: HaState, deviceId = `ha:${s.entity_id}`): MediaInfo | undefined {
  const a = s.attributes;
  const app = str(a.app_name);
  const channel = str(a.media_channel);
  const rawTitle = str(a.media_title);
  const picture = str(a.entity_picture);
  // philips_js repeats the app / channel as media_title: keep a title only when it says something more.
  const title = rawTitle && rawTitle !== app && rawTitle !== channel ? rawTitle : undefined;
  if (!app && !channel && !title && !picture) return undefined;
  const media: MediaInfo = { state: s.state === "paused" ? "paused" : s.state === "idle" ? "idle" : "playing" };
  if (title) media.title = title;
  if (app) media.app = app;
  if (channel) media.channel = channel;
  const artist = str(a.media_artist) ?? str(a.media_series_title);
  if (artist) media.artist = artist;
  const position = num(a.media_position);
  const duration = num(a.media_duration);
  if (position !== undefined && duration !== undefined && duration > 0) {
    media.position = position;
    media.duration = duration;
    const at = str(a.media_position_updated_at);
    if (at && !Number.isNaN(Date.parse(at))) media.updatedAt = new Date(at).toISOString();
  }
  if (picture) media.artworkUrl = `/api/home/media/${encodeURIComponent(deviceId)}/artwork?h=${pictureKey(picture)}`;
  return media;
}

/** Adds the app read over ADB (YouTube, myCANAL…) when the TV is on and says nothing itself. */
export function withForegroundApp(state: DeviceState, adb: HaState | undefined): DeviceState {
  const pkg = state.on ? parseFocus(str(adb?.attributes.adb_response)) : null;
  if (!pkg) return state;
  const app = appLabel(pkg);
  return { ...state, media: { ...(state.media ?? { state: "playing" as const }), app: state.media?.app ?? app } };
}

export function haTvState(s: HaState): DeviceState {
  const dead = DEAD_STATES.has(s.state);
  // jointSPACE goes to sleep when the TV is off: "unavailable" usually just means "off".
  const on = dead || OFF_STATES.has(s.state) ? false : true;
  const state: DeviceState = { on, reachable: true };
  const vol = num(s.attributes.volume_level);
  if (on && vol !== undefined) state.volume = Math.round(vol * 100);
  const source = str(s.attributes.source) ?? str(s.attributes.app_name);
  if (on && source) state.source = source;
  const media = on ? haTvMedia(s) : undefined;
  if (media) state.media = media;
  return state;
}

export function haLightState(s: HaState): DeviceState {
  const dead = DEAD_STATES.has(s.state);
  const on = dead ? null : s.state === "on";
  const state: DeviceState = { on, reachable: !dead };
  const bri = num(s.attributes.brightness);
  if (on && bri !== undefined) state.brightness = Math.round((bri / 255) * 100);
  const hs = s.attributes.hs_color;
  const rgb = s.attributes.rgb_color;
  if (on && Array.isArray(hs) && typeof hs[0] === "number" && typeof hs[1] === "number") state.color = hsToHex((hs[0] / 360) * 65535, (hs[1] / 100) * 254); // HA: degrees / percent
  else if (on && Array.isArray(rgb) && rgb.length === 3 && rgb.every((c) => typeof c === "number"))
    state.color = `#${(rgb as number[]).map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0")).join("")}`;
  return state;
}

/** Ambilight effects worth offering: the everyday ones (no "Expert" variants, no raw "Mode: …", no custom color = the swatches). */
export function ambilightEffects(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is string => typeof e === "string" && /^FOLLOW_(VIDEO|AUDIO|COLOR):/.test(e) && !/:\s*Expert$/i.test(e) && !/CUSTOM_COLOR/.test(e));
}

/** The Ambilight light as the TV's `state.ambilight` (off when unavailable: it sleeps with the TV). */
export function haAmbilightState(s: HaState): AmbilightState {
  const light = haLightState(s);
  const out: AmbilightState = { on: light.on === true };
  if (out.on && light.color) out.color = light.color;
  if (out.on && light.brightness !== undefined) out.brightness = light.brightness;
  const effect = str(s.attributes.effect);
  if (out.on && effect) out.effect = effect;
  return out;
}

export function haAmbilightCapabilities(s: HaState): AmbilightCapabilities {
  const modes = Array.isArray(s.attributes.supported_color_modes) ? s.attributes.supported_color_modes.filter((m): m is string => typeof m === "string") : null;
  const caps: AmbilightCapabilities = {
    color: modes ? modes.some((m) => ["hs", "rgb", "xy", "rgbw", "rgbww"].includes(m)) : true,
    brightness: modes ? modes.some((m) => m !== "onoff") : true,
  };
  const effects = ambilightEffects(s.attributes.effect_list);
  if (effects.length) caps.effects = effects;
  return caps;
}

export function haFanState(s: HaState, light: HaState | undefined): DeviceState {
  const dead = DEAD_STATES.has(s.state);
  const on = dead ? null : s.state === "on";
  const state: DeviceState = { on, reachable: !dead };
  if (!dead) state.speed = on ? Math.round(num(s.attributes.percentage) ?? 0) : 0;
  if (!dead && light && !DEAD_STATES.has(light.state)) state.lightOn = light.state === "on";
  return state;
}

export function mapHaEntities(states: HaState[], reg: HaRegistry | undefined, tvEntity: string | null, apps: readonly TvApp[] = []): HaMapping {
  const byId = new Map(reg?.entities.map((e) => [e.entity_id, e]) ?? []);
  const live = states.filter((s) => !byId.get(s.entity_id)?.disabled_by);
  const devices: Device[] = [];
  const fanLights = new Map<string, string>();
  const ambilights = new Map<string, string>();
  const stateOf = new Map(live.map((s) => [s.entity_id, s]));
  const tvLights = live.filter((s) => s.entity_id.startsWith("light.") && byId.get(s.entity_id)?.platform === "philips_js");
  const hasTv = live.some((s) => isTvEntity(s, byId.get(s.entity_id), tvEntity));

  for (const s of live) {
    const entry = byId.get(s.entity_id);
    if (s.entity_id.startsWith("fan.")) {
      const lightId = pairFanLight(s.entity_id, live, reg);
      if (lightId) fanLights.set(s.entity_id, lightId);
      const step = num(s.attributes.percentage_step);
      devices.push({
        id: `ha:${s.entity_id}`,
        name: friendly(s),
        kind: "fan",
        source: "homeassistant",
        room: areaName(entry, reg),
        state: haFanState(s, lightId ? stateOf.get(lightId) : undefined),
        capabilities: {
          // Tuya fans often report a 1 % step (1..100) although the motor has a few speeds: show 6 steps then.
          speedSteps: step && step >= 5 ? Math.round(100 / step) : 6,
          fanLight: lightId ? true : undefined,
        },
      });
    } else if (s.entity_id.startsWith("light.") && entry?.platform === "philips_js") {
      // The TV's Ambilight (jointSPACE) shows up as a light entity of the TV device: folded into the
      // TV below; a standalone light only when Home Assistant has no TV.
      if (hasTv) continue;
      devices.push({
        id: `ha:${s.entity_id}`,
        name: "Ambilight",
        kind: "light",
        source: "homeassistant",
        room: areaName(entry, reg) || "Salon",
        state: haLightState(s),
        capabilities: { brightness: true, color: true },
      });
    } else if (isTvEntity(s, entry, tvEntity)) {
      const sources = Array.isArray(s.attributes.source_list)
        ? s.attributes.source_list.filter((x): x is string => typeof x === "string")
        : [];
      const tv: Device = {
        id: `ha:${s.entity_id}`,
        name: friendly(s),
        kind: "tv",
        source: "homeassistant",
        room: areaName(entry, reg),
        state: withForegroundApp(haTvState(s), live.find((x) => isAdbEntity(x.entity_id))),
        capabilities: { volume: true, buttons: [...sources.map((x) => `source:${x}`), ...apps.map((a) => tvAppButton(a.id))] },
      };
      if (apps.length) tv.capabilities.apps = apps.map((a) => ({ ...a }));
      // Its Ambilight: the philips_js light of the same HA device, else the only one there is.
      const light = tvLights.find((l) => entry?.device_id && byId.get(l.entity_id)?.device_id === entry.device_id) ?? (tvLights.length === 1 ? tvLights[0] : undefined);
      if (light) {
        ambilights.set(s.entity_id, light.entity_id);
        tv.state.ambilight = haAmbilightState(light);
        tv.capabilities.ambilight = haAmbilightCapabilities(light);
      }
      devices.push(tv);
    }
  }
  for (const d of devices) {
    for (const k of Object.keys(d.capabilities) as (keyof Device["capabilities"])[])
      if (d.capabilities[k] === undefined) delete d.capabilities[k];
  }
  return { devices, fanLights, ambilights };
}

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/** Light actions (Ambilight) -> HA service calls. */
export function lightServiceCalls(entity: string, state: DeviceState, actions: DeviceAction[]): ServiceCall[] {
  const e = { entity_id: entity };
  return actions.map((a): ServiceCall => {
    switch (a.type) {
      case "toggle":
        return { domain: "light", service: state.on ? "turn_off" : "turn_on", data: e };
      case "power":
        return { domain: "light", service: a.on ? "turn_on" : "turn_off", data: e };
      case "brightness":
        return a.value <= 0
          ? { domain: "light", service: "turn_off", data: e }
          : { domain: "light", service: "turn_on", data: { ...e, brightness_pct: clamp(Math.round(a.value), 1, 100) } };
      case "color": {
        const rgb = parseHex(a.hex);
        if (!rgb) throw new HttpError(400, "couleur invalide");
        return { domain: "light", service: "turn_on", data: { ...e, rgb_color: rgb } };
      }
      case "kelvin":
        return { domain: "light", service: "turn_on", data: { ...e, color_temp_kelvin: Math.round(a.value) } };
      default:
        throw new HttpError(400, `action ${a.type} non supportée par une lumière`);
    }
  });
}

/** `ambilight` action -> one HA light service call on the Ambilight entity. */
export function ambilightServiceCall(entity: string, action: Extract<DeviceAction, { type: "ambilight" }>): ServiceCall {
  if (action.on === false) return { domain: "light", service: "turn_off", data: { entity_id: entity } };
  const data: Record<string, unknown> = { entity_id: entity };
  if (action.hex !== undefined) {
    const rgb = parseHex(action.hex);
    if (!rgb) throw new HttpError(400, "couleur invalide");
    data.rgb_color = rgb;
  }
  if (action.brightness !== undefined) data.brightness_pct = clamp(Math.round(action.brightness), 1, 100);
  if (action.effect !== undefined) data.effect = action.effect;
  return { domain: "light", service: "turn_on", data };
}

/** Fan actions -> HA service calls. */
export function fanServiceCalls(entity: string, light: string | undefined, state: DeviceState, actions: DeviceAction[]): ServiceCall[] {
  const calls: ServiceCall[] = [];
  const e = { entity_id: entity };
  for (const a of actions) {
    switch (a.type) {
      case "toggle":
        calls.push({ domain: "fan", service: state.on ? "turn_off" : "turn_on", data: e });
        break;
      case "power":
        calls.push({ domain: "fan", service: a.on ? "turn_on" : "turn_off", data: e });
        break;
      case "speed":
        if (a.value <= 0) calls.push({ domain: "fan", service: "turn_off", data: e });
        // turn_on with the speed, not set_percentage: Tuya keeps the motor switch (fan_switch) apart from
        // the speed, and set_percentage alone spins the motor while the switch — HA's on/off — stays off.
        else calls.push({ domain: "fan", service: "turn_on", data: { ...e, percentage: clamp(Math.round(a.value), 1, 100) } });
        break;
      case "fanLight":
        if (!light) throw new HttpError(400, "ce ventilateur n'a pas de lumière");
        calls.push({ domain: "light", service: a.on ? "turn_on" : "turn_off", data: { entity_id: light } });
        break;
      default:
        throw new HttpError(400, `action ${a.type} non supportée par un ventilateur`);
    }
  }
  return calls;
}

let msgId = 0;

/** Installed apps are re-read every 6 h (and retried every 5 min while the TV doesn't answer). */
export const APPS_REFRESH_MS = 6 * 3600_000;
export const APPS_RETRY_MS = 5 * 60_000;

export class HaAdapter implements Adapter {
  readonly name = "homeassistant";
  private url: string;
  private tokenFile: string;
  private tvEntity: string | null;
  private token: string | null = null;
  private states = new Map<string, HaState>();
  private reg: HaRegistry | undefined;
  private mapping: HaMapping = { devices: [], fanLights: new Map(), ambilights: new Map() };
  /** Launchable apps installed on the TV (read over ADB at start, then every APPS_REFRESH_MS). */
  private apps: TvApp[] = [];
  private appsTimer: NodeJS.Timeout | null = null;
  /** ADB commands run one at a time (they all answer in the same `adb_response` attribute). */
  private adbChain: Promise<unknown> = Promise.resolve();
  /** Last `mCurrentFocus` answer (kept while other ADB commands overwrite adb_response). */
  private focusResponse: string | undefined;
  private ws: WebSocket | null = null;
  private pending = new Map<number, (msg: { success: boolean; result?: unknown; error?: { message: string } }) => void>();
  private problem: string | null = null;
  private onChange: () => void = () => {};
  private stopped = false;
  private retryMs = 2000;
  private retryTimer: NodeJS.Timeout | null = null;
  private lastJson = "";
  private adbTimer: NodeJS.Timeout | null = null;
  /** Called when `sun.sun` changes (the hub decides whether it is worth a new snapshot). */
  onSunChange: () => void = () => {};

  constructor(url: string, tokenFile: string, tvEntity: string | null) {
    this.url = url.replace(/\/+$/, "");
    this.tokenFile = tokenFile;
    this.tvEntity = tvEntity;
  }

  get enabled(): boolean {
    return this.token !== null;
  }

  warnings(): string[] {
    return this.problem ? [this.problem] : [];
  }

  devices(): Device[] {
    return this.mapping.devices;
  }

  /** Home Assistant's sun (null when HA is not connected or has no `sun.sun`). */
  sun(): SunInfo | null {
    if (!this.token || this.problem) return null;
    return sunFromHa(this.states.get("sun.sun"));
  }

  async start(onChange: () => void): Promise<void> {
    this.onChange = onChange;
    try {
      this.token = readFileSync(this.tokenFile, "utf8").trim() || null;
    } catch {
      this.token = null;
    }
    if (!this.token) {
      this.problem = `Home Assistant désactivé : jeton absent (${this.tokenFile})`;
      log.warn(this.problem);
      return;
    }
    log.info(`Home Assistant ${this.url}`);
    this.adbTimer = setInterval(() => void this.pollForegroundApp(), 5000);
    await this.loadStatesRest().catch((e) => this.fail(`REST: ${errMsg(e)}`));
    this.connect();
    this.scheduleApps(3000);
  }

  stop(): void {
    this.stopped = true;
    if (this.adbTimer) clearInterval(this.adbTimer);
    if (this.appsTimer) clearTimeout(this.appsTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
  }

  entityOf(deviceId: string): string {
    return deviceId.replace(/^ha:/, "");
  }

  /** Ambilight light entity folded into this TV device (undefined: none). */
  ambilightEntityOf(tvId: string): string | undefined {
    return this.mapping.ambilights.get(this.entityOf(tvId));
  }

  /** Launchable apps found on the TV. */
  tvApps(): TvApp[] {
    return this.apps;
  }

  private adbEntity(): string | undefined {
    return [...this.states.keys()].find(isAdbEntity);
  }

  /**
   * Runs a shell command on the TV over ADB (HA androidtv.adb_command) and returns its output
   * (attribute adb_response). Serialized: every command answers in the same attribute.
   */
  adbCommand(command: string): Promise<string | undefined> {
    const run = async (): Promise<string | undefined> => {
      const adb = this.adbEntity();
      if (!adb || !this.token) throw new HttpError(503, "liaison ADB de la TV indisponible dans Home Assistant");
      const changed = await this.callService("androidtv", "adb_command", { entity_id: adb, command });
      // Same answer as last time → no state change in the reply: read the entity.
      let state = changed.find((x) => x.entity_id === adb);
      if (!state) state = (await this.fetchState(adb)) ?? undefined;
      return str(state?.attributes.adb_response);
    };
    const p = this.adbChain.then(run, run);
    this.adbChain = p.catch(() => undefined);
    return p;
  }

  private async fetchState(entity: string): Promise<HaState | null> {
    try {
      const res = await fetch(`${this.url}/api/states/${entity}`, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const st = (await res.json()) as HaState;
      if (st?.entity_id) this.states.set(st.entity_id, st);
      return st;
    } catch {
      return null;
    }
  }

  private scheduleApps(ms: number): void {
    if (this.stopped) return;
    if (this.appsTimer) clearTimeout(this.appsTimer);
    this.appsTimer = setTimeout(() => void this.refreshApps(), ms);
    this.appsTimer.unref?.();
  }

  /** Reads the installed apps over ADB (read-only `pm list packages`); retries sooner when it fails. */
  async refreshApps(): Promise<void> {
    try {
      const packages = parsePackages(await this.adbCommand(PACKAGES_COMMAND));
      if (!packages.length) throw new Error("réponse vide");
      const apps = installedApps(packages);
      if (JSON.stringify(apps) !== JSON.stringify(this.apps)) log.info(`applis TV : ${apps.map((a) => a.label).join(", ") || "aucune connue"}`);
      this.apps = apps;
      this.remap();
      this.scheduleApps(APPS_REFRESH_MS);
    } catch (e) {
      log.warn(`applis TV illisibles (${errMsg(e)}), nouvel essai dans 5 min`);
      this.scheduleApps(APPS_RETRY_MS);
    }
  }

  /** Opens an installed app on the TV (the TV must be on). Then refreshes the foreground app quickly. */
  async launchApp(pkg: string): Promise<void> {
    const app = this.apps.find((a) => a.id === pkg);
    if (!app) throw new HttpError(400, `appli inconnue sur la TV : ${pkg}`);
    const [leanback, launcher] = launchCommands(pkg);
    if (launchFailed(await this.adbCommand(leanback!)) && launchFailed(await this.adbCommand(launcher!)))
      throw new HttpError(502, `impossible d'ouvrir ${app.label} sur la TV`);
    log.info(`TV : ${app.label} ouverte (ADB)`);
    void this.pollForegroundApp();
    for (const ms of [1500, 4000]) setTimeout(() => void this.pollForegroundApp(), ms).unref?.();
  }

  private picture: { key: string; promise: Promise<Artwork | null> } | null = null;

  /** The TV's `entity_picture`, fetched from Home Assistant with the token (never handed to clients). */
  artwork(deviceId: string): Promise<Artwork | null> {
    const pic = str(this.states.get(this.entityOf(deviceId))?.attributes.entity_picture);
    if (!pic || !this.token) return Promise.resolve(null);
    const key = pictureKey(pic);
    if (this.picture?.key === key) return this.picture.promise;
    const url = /^https?:\/\//.test(pic) ? pic : `${this.url}${pic.startsWith("/") ? "" : "/"}${pic}`;
    const sameHost = url.startsWith(this.url);
    const promise = (async (): Promise<Artwork | null> => {
      try {
        const res = await fetch(url, { headers: sameHost ? { authorization: `Bearer ${this.token}` } : {}, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
        if (!mime.startsWith("image/")) return null;
        const data = Buffer.from(await res.arrayBuffer());
        if (!data.length || data.length > 8 * 1024 * 1024) return null;
        return { mime, data, key };
      } catch (e) {
        log.warn(`image TV: ${errMsg(e)}`);
        return null;
      }
    })();
    this.picture = { key, promise };
    void promise.then((a) => {
      if (!a && this.picture?.key === key) this.picture = null;
    });
    return promise;
  }

  async act(id: string, actions: DeviceAction[]): Promise<void> {
    const device = this.mapping.devices.find((d) => d.id === id);
    if (!device) throw new HttpError(404, `appareil inconnu ${id}`);
    const entity = this.entityOf(id);
    if (device.kind === "light") {
      for (const c of lightServiceCalls(entity, device.state, actions)) await this.callService(c.domain, c.service, c.data);
      return;
    }
    if (device.kind !== "fan") throw new HttpError(400, `${id}: passer par la TV composite`);
    for (const c of fanServiceCalls(entity, this.mapping.fanLights.get(entity), device.state, actions)) {
      await this.callService(c.domain, c.service, c.data);
    }
  }

  /** While the TV is on, ask it over ADB which app is in front (the answer lands in adb_response). */
  async pollForegroundApp(): Promise<void> {
    const tv = this.mapping.devices.find((d) => d.kind === "tv");
    if (!tv?.state.on || !this.adbEntity() || !this.token) return;
    try {
      const r = await this.adbCommand(FOCUS_COMMAND);
      if (parseFocus(r)) {
        this.focusResponse = r;
        this.remap();
      }
    } catch {
      /* TV asleep / ADB not authorized: keep the last known app */
    }
  }

  /** Calls a Home Assistant service; returns the states it changed (already applied). */
  async callService(domain: string, service: string, data: Record<string, unknown>): Promise<HaState[]> {
    if (!this.token) throw new HttpError(503, "Home Assistant indisponible");
    let res: Response;
    try {
      res = await fetch(`${this.url}/api/services/${domain}/${service}`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      throw new HttpError(502, `Home Assistant injoignable: ${errMsg(e)}`);
    }
    if (!res.ok) throw new HttpError(502, `Home Assistant ${domain}.${service}: HTTP ${res.status}`);
    // Service responses list the changed states: apply them right away (WS will confirm).
    const changed = (await res.json().catch(() => [])) as unknown;
    const list = Array.isArray(changed) ? (changed as HaState[]).filter((s) => s?.entity_id) : [];
    for (const s of list) this.states.set(s.entity_id, s);
    this.remap();
    return list;
  }

  private async loadStatesRest(): Promise<void> {
    const res = await fetch(`${this.url}/api/states`, {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json()) as HaState[];
    this.states = new Map(list.map((s) => [s.entity_id, s]));
    this.remap();
  }

  private fail(msg: string): void {
    if (msg !== this.problem) log.warn(msg);
    this.problem = `Home Assistant: ${msg}`;
  }

  private remap(): void {
    // Other ADB commands (installed apps, app launch) overwrite adb_response: keep the last focus answer.
    const states = [...this.states.values()].map((s) => {
      if (!isAdbEntity(s.entity_id)) return s;
      const r = str(s.attributes.adb_response);
      if (parseFocus(r)) {
        this.focusResponse = r;
        return s;
      }
      return this.focusResponse ? { ...s, attributes: { ...s.attributes, adb_response: this.focusResponse } } : s;
    });
    this.mapping = mapHaEntities(states, this.reg, this.tvEntity, this.apps);
    const json = JSON.stringify(this.mapping.devices);
    if (json !== this.lastJson) {
      this.lastJson = json;
      this.onChange();
    }
  }

  private send<T>(msg: Record<string, unknown>): Promise<T> {
    return new Promise((resolvePromise, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error("WebSocket fermé"));
      const id = ++msgId;
      this.pending.set(id, (m) => (m.success ? resolvePromise(m.result as T) : reject(new Error(m.error?.message ?? "échec"))));
      ws.send(JSON.stringify({ id, ...msg }));
    });
  }

  private connect(): void {
    if (this.stopped) return;
    const wsUrl = this.url.replace(/^http/, "ws") + "/api/websocket";
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: this.token }));
      else if (msg.type === "auth_invalid") {
        this.fail("jeton refusé");
        ws.close();
      } else if (msg.type === "auth_ok") void this.onReady();
      else if (msg.type === "result" && typeof msg.id === "number") {
        const cb = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        cb?.(msg as never);
      } else if (msg.type === "event") {
        const data = (msg.event as { data?: { entity_id?: string; new_state?: HaState | null } } | undefined)?.data;
        if (!data?.entity_id) return;
        if (data.new_state) this.states.set(data.entity_id, data.new_state);
        else this.states.delete(data.entity_id);
        if (/^(fan|light|media_player)\./.test(data.entity_id)) this.remap();
        else if (data.entity_id === "sun.sun") this.onSunChange();
      }
    });
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const cb of this.pending.values()) cb({ success: false, error: { message: "WebSocket fermé" } });
      this.pending.clear();
      if (this.stopped) return;
      this.fail("connexion WebSocket perdue, nouvel essai…");
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 60_000);
    });
    ws.addEventListener("error", () => {
      /* "close" follows */
    });
  }

  private async onReady(): Promise<void> {
    this.retryMs = 2000;
    try {
      const [states, entities, devices, areas] = await Promise.all([
        this.send<HaState[]>({ type: "get_states" }),
        this.send<HaEntityEntry[]>({ type: "config/entity_registry/list" }).catch(() => []),
        this.send<{ id: string; area_id: string | null }[]>({ type: "config/device_registry/list" }).catch(() => []),
        this.send<{ area_id: string; name: string }[]>({ type: "config/area_registry/list" }).catch(() => []),
      ]);
      this.reg = {
        entities,
        deviceAreas: new Map(devices.map((d) => [d.id, d.area_id])),
        areas: new Map(areas.map((a) => [a.area_id, a.name])),
      };
      this.states = new Map(states.map((s) => [s.entity_id, s]));
      await this.send({ type: "subscribe_events", event_type: "state_changed" });
      if (this.problem) log.info("Home Assistant connecté");
      this.problem = null;
      this.remap();
      this.onSunChange();
      log.info(`${this.mapping.devices.length} appareil(s) Home Assistant`);
    } catch (e) {
      this.fail(`initialisation: ${errMsg(e)}`);
      this.ws?.close();
    }
  }
}
