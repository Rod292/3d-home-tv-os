/**
 * StackChan robot client (camera server, port 8080): IR remote buttons.
 *   GET /status            → { …, "remote": true } when the firmware supports the IR remote
 *   GET /remote/list       → { "buttons": [...] }
 *   GET /remote/send?name=X&repeat=1..10 → { "ok": true }
 * Every request carries `X-Cam-Key` (never logged). The robot handles one request at a time:
 * calls are serialized. Degrades gracefully when unreachable / remote unsupported (no buttons).
 */
import { errMsg, logger } from "./log.ts";
import { HttpError } from "./types.ts";

const log = logger("robot");

const ERRORS: Record<number, string> = {
  400: "nom ou répétition invalide",
  403: "clé refusée (robotKey)",
  404: "bouton inconnu",
  409: "apprentissage en cours",
  503: "robot occupé",
  504: "délai dépassé",
};

export class RobotClient {
  private base: string;
  private key: string | null;
  private _buttons: string[] = [];
  private problem: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private onChange: () => void = () => {};
  private queue: Promise<unknown> = Promise.resolve();

  constructor(baseUrl: string, key: string | null) {
    this.base = baseUrl.replace(/\/+$/, "");
    this.key = key;
  }

  get buttons(): string[] {
    return this._buttons;
  }

  /** Reachable and IR remote supported. */
  get online(): boolean {
    return this.problem === null;
  }

  warnings(): string[] {
    return this.problem ? [this.problem] : [];
  }

  async start(onChange: () => void): Promise<void> {
    this.onChange = onChange;
    log.info(`robot ${this.base}${this.key ? "" : " (sans robotKey : les requêtes seront refusées)"}`);
    await this.refresh();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** One request at a time (the firmware answers 503 otherwise). */
  private get(path: string, timeoutMs = 4000): Promise<unknown> {
    const run = async () => {
      const headers: Record<string, string> = {};
      if (this.key) headers["X-Cam-Key"] = this.key;
      const res = await fetch(`${this.base}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new HttpError(res.status === 404 || res.status === 400 ? 400 : 502, ERRORS[res.status] ?? `HTTP ${res.status}`);
      return res.json();
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Reload support + button list (every 5 min when OK, every 30 s after a failure). */
  async refresh(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    try {
      const status = (await this.get("/status")) as { remote?: unknown };
      if (status.remote !== true) throw new Error("firmware sans télécommande IR (pas de \"remote\" dans /status)");
      const json = (await this.get("/remote/list")) as { buttons?: unknown };
      const buttons = Array.isArray(json.buttons) ? json.buttons.filter((b): b is string => typeof b === "string") : [];
      const changed = JSON.stringify(buttons) !== JSON.stringify(this._buttons) || this.problem !== null;
      this._buttons = buttons;
      if (this.problem) log.info(`robot joignable, ${buttons.length} bouton(s)`);
      this.problem = null;
      if (changed) this.onChange();
      this.timer = setTimeout(() => void this.refresh(), 5 * 60_000);
    } catch (e) {
      const msg = `robot indisponible : ${errMsg(e)}`;
      this._buttons = [];
      if (msg !== this.problem) {
        log.warn(msg);
        this.problem = msg;
        this.onChange();
      }
      this.timer = setTimeout(() => void this.refresh(), 30_000);
    }
  }

  /** Sony SIRC code built by the firmware (no learning): e.g. amp volume = address 16, command 18/19. */
  async sony(address: number, command: number, bits = 12, frames = 3): Promise<void> {
    if (!this.online) throw new HttpError(503, this.problem ?? "robot indisponible");
    try {
      await this.get(`/remote/sony?address=${address}&command=${command}&bits=${bits}&repeat=${Math.max(1, Math.min(20, frames))}`, 8000);
    } catch (e) {
      if (e instanceof HttpError) throw new HttpError(e.status, `robot: ${e.message}`);
      throw new HttpError(502, `robot injoignable: ${errMsg(e)}`);
    }
  }

  async send(name: string, repeat = 1): Promise<void> {
    if (!/^[a-z0-9_]{1,15}$/.test(name)) throw new HttpError(400, `nom de bouton invalide: ${name}`);
    if (!this.online) throw new HttpError(503, this.problem ?? "robot indisponible");
    let json: { ok?: boolean; error?: string };
    try {
      json = (await this.get(
        `/remote/send?name=${encodeURIComponent(name)}&repeat=${Math.max(1, Math.min(10, Math.round(repeat)))}`,
        8000,
      )) as { ok?: boolean; error?: string };
    } catch (e) {
      if (e instanceof HttpError) throw new HttpError(e.status, `robot: ${e.message}`);
      throw new HttpError(502, `robot: ${errMsg(e)}`);
    }
    if (!json.ok) throw new HttpError(502, `robot: ${json.error ?? "échec"}`);
  }
}
