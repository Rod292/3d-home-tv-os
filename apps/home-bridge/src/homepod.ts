/**
 * HomePod mini (AirPlay) adapter. Home Assistant (in Docker) cannot reach the HomePod, so the bridge
 * talks to it from the Mac with pyatv: a long-lived Python helper (scripts/homepod.py, run with the
 * pyatv venv) streams the now-playing state as JSON lines and answers commands on stdin (artwork,
 * transport, volume). The helper is restarted with a backoff when it exits (HomePod asleep, IP changed:
 * it re-resolves the Bonjour host by itself).
 *
 * Without pairing, pyatv exposes metadata, artwork and volume over AirPlay; transport commands are only
 * offered when pyatv reports them available (they come and go with what is playing).
 */
import type { Device, DeviceAction, DeviceCapabilities, DeviceState, MediaInfo } from "@appart3d/home";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expandHome, type BridgeConfig } from "./config.ts";
import { errMsg, logger } from "./log.ts";
import { HttpError, type Adapter, type Artwork } from "./types.ts";

const log = logger("homepod");

export const HOMEPOD_ID = "airplay:homepod";
export const HELPER_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/homepod.py");

export type HomePodConfig = BridgeConfig["homepod"];

/* ------------------------------------------------------------------ helper protocol */

export interface HelperPlaying {
  device_state?: string | null;
  media_type?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  position?: number | null;
  total_time?: number | null;
  hash?: string | null;
}

export interface HelperFeatures {
  play?: boolean;
  pause?: boolean;
  playPause?: boolean;
  next?: boolean;
  previous?: boolean;
  setVolume?: boolean;
  volume?: boolean;
  artwork?: boolean;
  app?: boolean;
}

export interface HelperState {
  type: "state";
  playing: HelperPlaying | null;
  features: HelperFeatures;
  volume: number | null;
  artworkId?: string | null;
  app?: { name?: string | null; id?: string | null } | null;
}

export type HelperMessage =
  | { type: "connected"; ip?: string; name?: string; model?: string | null; identifier?: string }
  | HelperState
  | { type: "reply"; id: number; ok: boolean; error?: string; mime?: string; data?: string }
  | { type: "error"; message: string }
  | { type: "log"; message: string };

/** One stdout line of the helper → message (null: not JSON / unknown type). */
export function parseHelperLine(line: string): HelperMessage | null {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const m = v as Record<string, unknown>;
  switch (m.type) {
    case "connected":
      return m as HelperMessage;
    case "state":
      return {
        type: "state",
        playing: typeof m.playing === "object" && m.playing !== null ? (m.playing as HelperPlaying) : null,
        features: typeof m.features === "object" && m.features !== null ? (m.features as HelperFeatures) : {},
        volume: typeof m.volume === "number" && Number.isFinite(m.volume) ? m.volume : null,
        artworkId: typeof m.artworkId === "string" ? m.artworkId : null,
        app: typeof m.app === "object" && m.app !== null ? (m.app as HelperState["app"]) : null,
      };
    case "reply":
      return typeof m.id === "number" ? (m as HelperMessage) : null;
    case "error":
    case "log":
      return { type: m.type, message: typeof m.message === "string" ? m.message : "" };
  }
  return null;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/** pyatv DeviceState → contract media state. */
export function mediaStateOf(deviceState: string | null | undefined): MediaInfo["state"] {
  switch (deviceState) {
    case "playing":
    case "loading":
    case "seeking":
      return "playing";
    case "paused":
      return "paused";
    default:
      return "idle";
  }
}

/** Key of the current cover (changes with the content): pyatv's artwork id, else the now-playing hash. */
export function artworkKey(st: HelperState): string | null {
  const raw = st.artworkId || st.playing?.hash;
  if (!raw) return null;
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

/** Transport controls pyatv offers right now (PlayPause covers both play and pause). */
export function mediaCapabilities(f: HelperFeatures): NonNullable<DeviceCapabilities["media"]> {
  const out: NonNullable<DeviceCapabilities["media"]> = [];
  if (f.play || f.playPause) out.push("play");
  if (f.pause || f.playPause) out.push("pause");
  if (f.next) out.push("next");
  if (f.previous) out.push("previous");
  return out;
}

export interface HomePodStatus {
  connected: boolean;
  state: HelperState | null;
  /** When `state` was received (position sample time). */
  stateAt: Date | null;
}

/** Helper status → contract device. */
export function homepodDevice(status: HomePodStatus, cfg: Pick<HomePodConfig, "name" | "room">, id = HOMEPOD_ID): Device {
  const caps: DeviceCapabilities = {};
  const device: Device = { id, name: cfg.name || "HomePod mini", kind: "speaker", source: "airplay", room: cfg.room || "Salon", state: { on: null, reachable: false }, capabilities: caps };
  const st = status.state;
  if (!status.connected || !st) return device;
  const ms = mediaStateOf(st.playing?.device_state);
  const media: MediaInfo = { state: ms };
  if (ms !== "idle" && st.playing) {
    const p = st.playing;
    const title = str(p.title);
    const artist = str(p.artist);
    const album = str(p.album);
    const app = str(st.app?.name);
    const position = num(p.position);
    const duration = num(p.total_time);
    if (title) media.title = title;
    if (artist) media.artist = artist;
    if (album) media.album = album;
    if (app) media.app = app;
    if (position !== undefined) media.position = position;
    if (duration !== undefined && duration > 0) media.duration = duration;
    if (status.stateAt) media.updatedAt = status.stateAt.toISOString();
    const key = artworkKey(st);
    if (st.features.artwork && key) media.artworkUrl = `/api/home/media/${encodeURIComponent(id)}/artwork?h=${key}`;
  }
  const state: DeviceState = { on: ms === "playing", reachable: true, media };
  if (typeof st.volume === "number") state.volume = Math.round(st.volume);
  const controls = mediaCapabilities(st.features);
  if (controls.length) caps.media = controls;
  if (st.features.setVolume) caps.volume = true;
  device.state = state;
  return device;
}

export type HelperCommand = { cmd: "play" | "pause" | "play_pause" | "next" | "previous" } | { cmd: "set_volume"; value: number };

/** Device action → helper commands, refusing what pyatv does not offer right now (never sends blind). */
export function planHomePodAction(st: HelperState | null, action: DeviceAction): HelperCommand[] {
  if (!st) throw new HttpError(503, "HomePod injoignable");
  const f = st.features;
  const playing = mediaStateOf(st.playing?.device_state) === "playing";
  const play = (): HelperCommand[] => {
    if (f.play) return [{ cmd: "play" }];
    if (f.playPause) return playing ? [] : [{ cmd: "play_pause" }];
    throw new HttpError(409, "lecture indisponible sur le HomePod en ce moment");
  };
  const pause = (): HelperCommand[] => {
    if (f.pause) return [{ cmd: "pause" }];
    if (f.playPause) return playing ? [{ cmd: "play_pause" }] : [];
    throw new HttpError(409, "pause indisponible sur le HomePod en ce moment");
  };
  const playPause = (): HelperCommand[] => (f.playPause ? [{ cmd: "play_pause" }] : playing ? pause() : play());
  const volume = (v: number): HelperCommand[] => {
    if (!f.setVolume) throw new HttpError(409, "volume indisponible sur le HomePod");
    return [{ cmd: "set_volume", value: Math.max(0, Math.min(100, Math.round(v))) }];
  };
  switch (action.type) {
    case "media":
      switch (action.command) {
        case "play":
          return play();
        case "pause":
          return pause();
        case "playPause":
          return playPause();
        case "next":
        case "previous":
          if (!f[action.command]) throw new HttpError(409, `${action.command === "next" ? "piste suivante" : "piste précédente"} indisponible`);
          return [{ cmd: action.command }];
      }
      break;
    case "toggle":
      return playPause();
    case "power":
      return action.on ? play() : playing ? pause() : [];
    case "volume":
      return volume(action.value);
    case "volumeStep":
      return volume((st.volume ?? 30) + action.delta * 5);
  }
  throw new HttpError(400, `action ${action.type} non supportée par le HomePod`);
}

/* ------------------------------------------------------------------ adapter */

export interface HomePodOptions {
  /** Command line of the helper (tests: a fake executable). Default: `<python>/python -I scripts/homepod.py …`. */
  command?: string[];
  /** First restart delay (ms), doubled up to `maxBackoffMs`. */
  backoffMs?: number;
  maxBackoffMs?: number;
  /** Helper reply timeout (ms). */
  replyTimeoutMs?: number;
}

export class HomePodAdapter implements Adapter {
  readonly name = "homepod";
  private cfg: HomePodConfig;
  private opts: Required<Omit<HomePodOptions, "command">> & { command?: string[] };
  private child: ChildProcessWithoutNullStreams | null = null;
  private status: HomePodStatus = { connected: false, state: null, stateAt: null };
  private onChange: () => void = () => {};
  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private backoff: number;
  private problem: string | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (m: Extract<HelperMessage, { type: "reply" }>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private art: { key: string; promise: Promise<Artwork | null> } | null = null;
  /** Last IP the helper connected to (passed back first on restart: the HomePod may have moved). */
  private lastIp: string | null;

  constructor(cfg: HomePodConfig, opts: HomePodOptions = {}) {
    this.cfg = cfg;
    this.opts = { backoffMs: 2000, maxBackoffMs: 5 * 60_000, replyTimeoutMs: 10_000, ...opts };
    this.backoff = this.opts.backoffMs;
    this.lastIp = cfg.ip;
  }

  warnings(): string[] {
    return this.problem ? [this.problem] : [];
  }

  devices(): Device[] {
    return [homepodDevice(this.status, this.cfg)];
  }

  /** Current helper state (tests, scenes). */
  get helperState(): HelperState | null {
    return this.status.connected ? this.status.state : null;
  }

  private commandLine(): string[] {
    if (this.opts.command) return this.opts.command;
    const py = join(expandHome(this.cfg.python), "python");
    const args = [py, "-I", HELPER_SCRIPT];
    if (this.lastIp) args.push("--ip", this.lastIp);
    if (this.cfg.host) args.push("--host", this.cfg.host);
    if (this.cfg.id) args.push("--id", this.cfg.id);
    return args;
  }

  async start(onChange: () => void): Promise<void> {
    this.onChange = onChange;
    this.stopped = false;
    const [exe] = this.commandLine();
    if (!exe || (exe.includes("/") && !existsSync(exe))) {
      this.problem = `HomePod désactivé : pyatv introuvable (${exe}) — voir apps/home-bridge/README`;
      log.warn(this.problem);
      return;
    }
    this.spawn();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.child?.kill("SIGTERM");
    this.child = null;
  }

  private spawn(): void {
    if (this.stopped) return;
    const [exe, ...args] = this.commandLine();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(exe!, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    } catch (e) {
      this.fail(`lancement impossible: ${errMsg(e)}`);
      return this.scheduleRestart();
    }
    this.child = child;
    createInterface({ input: child.stdout }).on("line", (line) => this.onLine(line));
    let stderrTail = "";
    child.stderr.on("data", (b: Buffer) => {
      stderrTail = (stderrTail + b.toString("utf8")).slice(-600);
    });
    child.stdin.on("error", () => undefined);
    child.on("error", (e) => this.fail(`processus: ${errMsg(e)}`));
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      const lastErr = stderrTail.trim().split("\n").pop();
      if (code && code !== 0 && lastErr && !this.problem) this.fail(lastErr);
      log.info(`assistant pyatv arrêté (${signal ?? `code ${code}`})`);
      const wasConnected = this.status.connected;
      this.status = { connected: false, state: null, stateAt: null };
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new HttpError(503, "HomePod déconnecté"));
      }
      this.pending.clear();
      if (wasConnected) this.onChange();
      this.scheduleRestart();
    });
  }

  private scheduleRestart(): void {
    if (this.stopped) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, this.opts.maxBackoffMs);
    this.retryTimer = setTimeout(() => this.spawn(), delay);
    this.retryTimer.unref?.();
  }

  private fail(msg: string): void {
    const p = `HomePod : ${msg}`;
    if (p !== this.problem) log.warn(msg);
    this.problem = p;
  }

  private onLine(line: string): void {
    const m = parseHelperLine(line);
    if (!m) return;
    switch (m.type) {
      case "connected":
        if (m.ip && m.ip !== this.lastIp) log.info(`HomePod sur ${m.ip}${this.cfg.ip && m.ip !== this.cfg.ip ? ` (adresse changée, configurée ${this.cfg.ip})` : ""}`);
        else log.info(`HomePod connecté (${m.name ?? "?"}, ${m.model ?? "?"})`);
        if (m.ip) this.lastIp = m.ip;
        this.backoff = this.opts.backoffMs;
        this.problem = null;
        break;
      case "state":
        this.status = { connected: true, state: m, stateAt: new Date() };
        this.problem = null;
        this.onChange();
        break;
      case "reply": {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        p.resolve(m);
        break;
      }
      case "error":
        this.fail(m.message);
        break;
      case "log":
        log.info(m.message);
        break;
    }
  }

  private request(cmd: Record<string, unknown>): Promise<Extract<HelperMessage, { type: "reply" }>> {
    const child = this.child;
    if (!child || !this.status.connected) return Promise.reject(new HttpError(503, "HomePod injoignable"));
    const id = ++this.seq;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HttpError(504, "le HomePod n'a pas répondu"));
      }, this.opts.replyTimeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
      child.stdin.write(JSON.stringify({ id, ...cmd }) + "\n");
    });
  }

  async act(id: string, actions: DeviceAction[]): Promise<void> {
    if (id !== HOMEPOD_ID) throw new HttpError(404, `appareil inconnu ${id}`);
    for (const a of actions) {
      for (const c of planHomePodAction(this.helperState, a)) {
        const r = await this.request(c);
        if (!r.ok) throw new HttpError(r.error === "unsupported" ? 409 : 502, `HomePod : ${r.error ?? "échec"}`);
      }
    }
    void this.request({ cmd: "refresh" }).catch(() => undefined);
  }

  /** Cover of what plays now (cached by content key; null when none). */
  artwork(id: string): Promise<Artwork | null> {
    const st = this.helperState;
    if (id !== HOMEPOD_ID || !st?.features.artwork || mediaStateOf(st.playing?.device_state) === "idle") return Promise.resolve(null);
    const key = artworkKey(st);
    if (!key) return Promise.resolve(null);
    if (this.art?.key === key) return this.art.promise;
    const promise = this.request({ cmd: "artwork", width: 600 }).then(
      (r): Artwork | null => (r.ok && r.data ? { mime: r.mime ?? "image/jpeg", data: Buffer.from(r.data, "base64"), key } : null),
      () => null,
    );
    this.art = { key, promise };
    // Failures are not cached for long: next request retries.
    void promise.then((a) => {
      if (!a && this.art?.key === key) setTimeout(() => this.art?.key === key && (this.art = null), 5000).unref?.();
    });
    return promise;
  }
}
