/** Aggregates adapters into one HomeSnapshot, routes actions, runs scenes, emits change events. */
import type { Device, DeviceAction, HomeEvent, HomeSnapshot, SunInfo } from "@appart3d/home";
import { DEFAULT_SCENES } from "@appart3d/home";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SHARED_DIR, DEFAULT_WEB_DIST, type BridgeConfig } from "./config.ts";
import { ambilightServiceCall, type HaAdapter } from "./ha.ts";
import { errMsg, logger } from "./log.ts";
import type { RobotClient } from "./robot.ts";
import { planScene } from "./scenes.ts";
import { computeSun, HORIZON, shouldPushSun } from "./sun.ts";
import { composeTv, planTvAction } from "./tv.ts";
import { HttpError, type Adapter, type Artwork } from "./types.ts";

const log = logger("hub");

/** Buttons added to the TV when the Sony amp is driven by the robot. */
const AMP_BUTTONS = ["amp_mute", "amp_power"];

export interface BridgeSnapshot extends HomeSnapshot {
  /** Additive: adapter problems (disabled, unreachable…). */
  warnings?: string[];
}

export interface HubParts {
  adapters: Adapter[];
  ha?: HaAdapter;
  robot?: RobotClient;
  /** Clock (tests). */
  now?: () => Date;
  /** Max wait for the TV to report "on" before launching an app (ms, default 25 s). */
  tvOnTimeoutMs?: number;
  /** How often the sun is re-evaluated (ms, default 60 s). */
  sunIntervalMs?: number;
  /** Forced solar elevation (dev / screenshots: HOME_BRIDGE_SUN_ELEVATION). */
  sunElevation?: number;
}

/** Beyond this gap (degrees) Home Assistant's sun is considered wrong (HA home location not set). */
export const SUN_MISMATCH_DEG = 8;

/** HOME_BRIDGE_SUN_ELEVATION=<degrees> forces the sun (development, screenshots). */
export function forcedSunElevation(env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = env.HOME_BRIDGE_SUN_ELEVATION;
  if (raw === undefined || raw.trim() === "") return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? v : undefined;
}

/** Apply config (room labels, names, 3D links) to a raw adapter device. */
export function decorate(d: Device, cfg: Pick<BridgeConfig, "rooms" | "deviceRooms" | "deviceNames" | "links">): Device {
  const room = cfg.deviceRooms[d.id] ?? (d.room ? (cfg.rooms[d.room] ?? d.room) : d.kind === "tv" ? "Salon" : "Maison");
  const out: Device = { ...d, room, name: cfg.deviceNames[d.id] ?? d.name };
  // Explicit id first, then any device of that kind (the TV carries its Ambilight: no separate link).
  const link = d.id in cfg.links ? cfg.links[d.id] : cfg.links[`kind:${d.kind}`];
  if (link) out.itemId = link;
  else delete out.itemId;
  return out;
}

export class Hub {
  private cfg: BridgeConfig;
  private parts: HubParts;
  private owner = new Map<string, Adapter | "tv">();
  private current = new Map<string, Device>();
  private currentJson = new Map<string, string>();
  private listeners = new Set<(e: HomeEvent) => void>();
  private updatedAt = new Date().toISOString();
  private lastSun: SunInfo | null = null;
  private sunTimer: NodeJS.Timeout | null = null;
  private sunMismatchLogged = false;

  constructor(cfg: BridgeConfig, parts: HubParts) {
    this.cfg = cfg;
    this.parts = parts;
  }

  async start(): Promise<void> {
    const onChange = () => this.recompute();
    if (this.parts.ha) this.parts.ha.onSunChange = () => this.checkSun();
    this.lastSun = this.sun();
    this.sunTimer = setInterval(() => this.checkSun(), this.parts.sunIntervalMs ?? 60_000);
    this.sunTimer.unref?.();
    await Promise.all([
      ...this.parts.adapters.map((a) => a.start(onChange).catch((e) => log.error(`${a.name}: ${errMsg(e)}`))),
      this.parts.robot?.start(onChange).catch((e) => log.error(`robot: ${errMsg(e)}`)),
    ]);
    this.recompute();
  }

  stop(): void {
    if (this.sunTimer) clearInterval(this.sunTimer);
    this.sunTimer = null;
    for (const a of this.parts.adapters) a.stop();
    this.parts.robot?.stop();
  }

  setConfig(cfg: BridgeConfig): void {
    this.cfg = cfg;
    this.recompute();
  }

  subscribe(fn: (e: HomeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: HomeEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch (err) {
        log.warn(`listener: ${errMsg(err)}`);
      }
    }
  }

  /** Raw devices from every adapter, with the TV composed from HA + robot. */
  private collect(): { device: Device; owner: Adapter | "tv" }[] {
    const out: { device: Device; owner: Adapter | "tv" }[] = [];
    const robot = this.parts.robot;
    const robotInfo = { configured: !!robot, online: !!robot?.online, buttons: robot?.buttons ?? [] };
    let tvDone = false;
    for (const a of this.parts.adapters) {
      for (const d of a.devices()) {
        if (a === this.parts.ha && d.kind === "tv") {
          const tv = tvDone ? d : composeTv(d, robotInfo);
          tvDone = true;
          if (tv) out.push({ device: tv, owner: "tv" });
        } else out.push({ device: d, owner: a });
      }
    }
    if (!tvDone && robot) {
      const tv = composeTv(undefined, robotInfo);
      if (tv) out.push({ device: tv, owner: "tv" });
    }
    // Sony amp through the robot: the TV's volume buttons drive it, plus mute / power buttons.
    if (this.ampActive()) {
      for (const o of out) {
        if (o.owner !== "tv") continue;
        const buttons = (o.device.capabilities.buttons ?? []).filter((b) => !AMP_BUTTONS.includes(b));
        // The TV's own level is meaningless (fixed optical output): no number, only ± on the amp.
        const { volume: _tvVolume, ...state } = o.device.state;
        o.device = { ...o.device, state, capabilities: { ...o.device.capabilities, volume: true, buttons: [...buttons, ...AMP_BUTTONS] } };
      }
    }
    return out;
  }

  recompute(): void {
    const next = new Map<string, Device>();
    const owners = new Map<string, Adapter | "tv">();
    for (const { device, owner } of this.collect()) {
      const d = decorate(device, this.cfg);
      next.set(d.id, d);
      owners.set(d.id, owner);
    }
    const sameSet = next.size === this.current.size && [...next.keys()].every((k) => this.current.has(k));
    const changed: Device[] = [];
    const json = new Map<string, string>();
    for (const [id, d] of next) {
      const j = JSON.stringify(d);
      json.set(id, j);
      if (this.currentJson.get(id) !== j) changed.push(d);
    }
    this.current = next;
    this.currentJson = json;
    this.owner = owners;
    if (!sameSet || changed.length) this.updatedAt = new Date().toISOString();
    if (!sameSet) this.emit({ type: "snapshot", snapshot: this.snapshot() });
    else for (const d of changed) this.emit({ type: "device", device: d });
  }

  /** Devices in the shared tile order (config `deviceOrder`), then by room and name. */
  devices(): Device[] {
    const room = (r: string) => ["Salon", "Cuisine", "Chambre"].indexOf(r) >>> 0;
    const rank = new Map((this.cfg.deviceOrder ?? []).map((id, i) => [id, i]));
    const pos = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
    return [...this.current.values()].sort(
      (a, b) => pos(a.id) - pos(b.id) || room(a.room) - room(b.room) || a.room.localeCompare(b.room) || a.name.localeCompare(b.name),
    );
  }

  /** Applies a new config and pushes a full snapshot (device order, names… changed). */
  setConfigAndPush(cfg: BridgeConfig): BridgeSnapshot {
    this.setConfig(cfg);
    const snap = this.snapshot();
    this.emit({ type: "snapshot", snapshot: snap });
    return snap;
  }

  device(id: string): Device {
    const d = this.current.get(id);
    if (!d) throw new HttpError(404, `appareil inconnu: ${id}`);
    return d;
  }

  warnings(): string[] {
    return [...this.parts.adapters.flatMap((a) => a.warnings()), ...(this.parts.robot?.warnings() ?? []), ...this.linkWarnings()];
  }

  private sceneIds: { key: string; ids: Set<string> | null } = { key: "", ids: null };

  /** Links pointing at items missing from the served scene (ids shifted after a scene edit…). */
  linkWarnings(): string[] {
    const scene = this.cfg.defaultScene;
    // Same file the server serves: the live source copy for /shared/*, else the built web app.
    const file = !scene
      ? null
      : !this.cfg.webDist && scene.startsWith("/shared/")
        ? join(DEFAULT_SHARED_DIR, scene.slice("/shared/".length))
        : join(this.cfg.webDist ?? DEFAULT_WEB_DIST, scene);
    if (!file) return [];
    let ids: Set<string> | null = null;
    try {
      const key = `${file}@${statSync(file).mtimeMs}`;
      if (this.sceneIds.key !== key) {
        const scene = JSON.parse(readFileSync(file, "utf8")) as { items?: { id: string }[] };
        this.sceneIds = { key, ids: new Set((scene.items ?? []).map((i) => i.id)) };
      }
      ids = this.sceneIds.ids;
    } catch {
      return [];
    }
    if (!ids) return [];
    return this.devices()
      .filter((d) => d.itemId && !ids.has(d.itemId))
      .map((d) => `« ${d.name} » est relié à ${d.itemId}, absent de la maquette`);
  }

  /** Sun now: Home Assistant's `sun.sun` when connected, else computed from the clock and location. */
  sun(): SunInfo {
    const forced = this.parts.sunElevation;
    if (forced !== undefined) return { elevation: forced, isDay: forced > HORIZON };
    const loc = this.cfg.location ?? { latitude: 48.86, longitude: 2.35 };
    const local = computeSun(this.parts.now?.() ?? new Date(), loc.latitude, loc.longitude);
    const ha = this.parts.ha?.sun();
    if (!ha) return local;
    // Home Assistant without a configured home location (0, 0) describes another sky: trust our own
    // computation for the configured location when they disagree.
    if (Math.abs(ha.elevation - local.elevation) > SUN_MISMATCH_DEG) {
      if (!this.sunMismatchLogged) {
        this.sunMismatchLogged = true;
        log.warn(`soleil de Home Assistant (${ha.elevation}°) ≠ calcul local (${local.elevation}°) : emplacement HA à configurer ? calcul local utilisé`);
      }
      return local;
    }
    return ha;
  }

  /** Pushes a snapshot when the sun moved enough (≥ 0.5° or day / night flip). */
  checkSun(): void {
    const next = this.sun();
    if (!shouldPushSun(this.lastSun, next)) return;
    this.lastSun = next;
    this.emit({ type: "snapshot", snapshot: this.snapshot(next) });
  }

  snapshot(sun: SunInfo = this.sun()): BridgeSnapshot {
    const snap: BridgeSnapshot = { home: this.cfg.homeName, devices: this.devices(), scenes: DEFAULT_SCENES, updatedAt: this.updatedAt, sun };
    const w = this.warnings();
    if (w.length) snap.warnings = w;
    return snap;
  }

  /** Cover / logo of what a device plays (speaker: pyatv; TV: Home Assistant's entity_picture). */
  async artwork(id: string): Promise<Artwork | null> {
    const d = this.device(id);
    const owner = this.owner.get(id);
    if (owner === "tv") return d.source === "homeassistant" && this.parts.ha ? this.parts.ha.artwork(id) : null;
    return owner?.artwork ? owner.artwork(id) : null;
  }

  async act(id: string, action: DeviceAction): Promise<Device> {
    await this.actMany(id, [action]);
    return this.device(id);
  }

  private async actMany(id: string, actions: DeviceAction[]): Promise<void> {
    const d = this.device(id);
    const owner = this.owner.get(id);
    if (owner === "tv") {
      let poweredOn = false;
      for (const a of actions) {
        const tv = this.device(id);
        // The Ambilight of a TV just switched on answers once the TV is up (scene « Film »).
        if (a.type === "ambilight" && a.on !== false && poweredOn && tv.state.on !== true) await this.waitTvOn(id, 20_000).catch(() => undefined);
        await this.tvAct(this.device(id), a);
        if ((a.type === "power" && a.on) || (a.type === "toggle" && tv.state.on !== true)) poweredOn = tv.state.on !== true;
      }
    } else if (owner) await owner.act(id, actions);
    else throw new HttpError(404, `appareil inconnu: ${d.id}`);
    this.recompute();
  }

  private ampActive(): boolean {
    return !!this.cfg.amp?.enabled && !!this.parts.robot?.online;
  }

  /** Volume / mute / power of the Sony amp, as SIRC codes sent by the robot. false: not an amp action. */
  private async ampAct(action: DeviceAction): Promise<boolean> {
    if (!this.ampActive()) return false;
    const { address, bits, framesPerStep } = this.cfg.amp;
    const robot = this.parts.robot!;
    if (action.type === "volumeStep") await robot.sony(address, action.delta > 0 ? 18 : 19, bits, framesPerStep);
    else if (action.type === "button" && action.name === "amp_mute") await robot.sony(address, 20, bits, 3);
    else if (action.type === "button" && action.name === "amp_power") await robot.sony(address, 21, bits, 3);
    else return false;
    log.info(`ampli Sony : ${action.type === "volumeStep" ? (action.delta > 0 ? "volume +" : "volume −") : action.name} (infrarouge du robot)`);
    return true;
  }

  /** Resolves once Home Assistant reports the TV on; rejects after `timeoutMs`. */
  private async waitTvOn(id: string, timeoutMs: number): Promise<void> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const tv = this.parts.ha?.devices().find((d) => d.id === id);
      if (tv?.state.on === true) {
        this.recompute();
        return;
      }
      if (Date.now() >= end) throw new HttpError(504, "la TV ne s'est pas allumée à temps");
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  /** Opens an app on the TV over ADB, switching the TV on first (and waiting for it) when it is off. */
  private async launchTvApp(tv: Device, pkg: string): Promise<void> {
    const ha = this.parts.ha;
    if (tv.source !== "homeassistant" || !ha?.enabled) throw new HttpError(503, "applis TV indisponibles sans Home Assistant");
    if (!ha.tvApps().some((a) => a.id === pkg)) throw new HttpError(400, `appli inconnue sur la TV : ${pkg}`);
    let wasOff = false;
    if (tv.state.on !== true) {
      wasOff = true;
      log.info(`TV éteinte : allumage avant d'ouvrir ${pkg}`);
      await this.tvAct(tv, { type: "power", on: true });
      await this.waitTvOn(tv.id, this.parts.tvOnTimeoutMs ?? 25_000);
    }
    try {
      await ha.launchApp(pkg);
    } catch (e) {
      if (!wasOff) throw e;
      // ADB comes up a little after the TV: one more try.
      await new Promise((r) => setTimeout(r, 2500));
      await ha.launchApp(pkg);
    }
  }

  private async tvAct(tv: Device, action: DeviceAction): Promise<void> {
    if (await this.ampAct(action)) return;
    const { ha, robot } = this.parts;
    const haOk = tv.source === "homeassistant" && !!ha?.enabled;
    if (action.type === "ambilight") {
      const entity = haOk ? ha!.ambilightEntityOf(tv.id) : undefined;
      if (!entity) throw new HttpError(400, "cette TV n'a pas d'Ambilight pilotable");
      const c = ambilightServiceCall(entity, action);
      await ha!.callService(c.domain, c.service, c.data);
      return;
    }
    if (action.type === "button" && action.name.startsWith("app:")) return this.launchTvApp(tv, action.name.slice("app:".length));
    const steps = planTvAction(tv.state, action, { ha: haOk, robot: !!robot?.online, buttons: robot?.buttons ?? [] });
    for (const step of steps) {
      if (step.via === "robot") {
        await robot!.send(step.button, step.repeat ?? 1);
        continue;
      }
      const entity = ha!.entityOf(tv.id);
      try {
        await ha!.callService("media_player", step.service, { entity_id: entity, ...step.data });
      } catch (e) {
        if (!step.fallbackButton || !robot) throw e;
        log.warn(`HA media_player.${step.service} a échoué (${errMsg(e)}), repli IR ${step.fallbackButton}`);
        await robot.send(step.fallbackButton);
      }
    }
  }

  async runScene(sceneId: string): Promise<BridgeSnapshot> {
    const plan = planScene(sceneId, this.devices(), { ambientStrip: this.cfg.roles.ambientStrip });
    if (!plan) throw new HttpError(404, `scène inconnue: ${sceneId}`);
    log.info(`scène ${sceneId}: ${plan.length} appareil(s)`);
    const results = await Promise.allSettled(plan.map((p) => this.actMany(p.deviceId, p.actions)));
    const errors = results.flatMap((r, i) => (r.status === "rejected" ? [`${plan[i]!.deviceId}: ${errMsg(r.reason)}`] : []));
    for (const e of errors) log.warn(`scène ${sceneId}: ${e}`);
    if (plan.length && errors.length === plan.length) throw new HttpError(502, `scène ${sceneId} : échec (${errors.join("; ")})`);
    const snap = this.snapshot();
    if (errors.length) snap.warnings = [...(snap.warnings ?? []), ...errors];
    return snap;
  }
}
