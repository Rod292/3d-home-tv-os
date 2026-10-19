import { DEFAULT_SCENES, HOME_API, type Device, type DeviceAction, type HomeEvent, type HomeSnapshot } from "@appart3d/home";
import { predict, sortByOrder, stepToSpeed } from "./home";

/**
 * Clients of the home bridge (apps/home-bridge). Same contract for the real bridge (HTTP + SSE)
 * and the in-browser mock (`?home=mock`) used for development and demos.
 */
export interface HomeClient {
  readonly kind: "bridge" | "mock";
  /** Where it talks to (shown in the panel footer). */
  readonly label: string;
  /** Base URL of the bridge ("" = same origin): relative URLs it returns (artwork) resolve against it. */
  readonly base: string;
  snapshot(): Promise<HomeSnapshot>;
  /** Live events; `onConnection(true)` after each (re)connection — refetch the snapshot then. */
  subscribe(onEvent: (e: HomeEvent) => void, onConnection: (connected: boolean) => void): () => void;
  action(id: string, action: DeviceAction): Promise<Device>;
  scene(id: string): Promise<HomeSnapshot>;
  /** Shared tile order (device ids) → the re-sorted snapshot. */
  order(ids: string[]): Promise<HomeSnapshot>;
}

export class HomeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ bridge URL */

export const BRIDGE_STORAGE_KEY = "appart3d:bridge:v1";

/**
 * Bridge base URL: "" (same origin, the bridge serves the web app) unless `?bridge=http://host:8787`
 * is given — remembered in localStorage; `?bridge=` (empty) or `?bridge=default` forgets it.
 */
export function resolveBridgeBase(params: URLSearchParams, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = safeStorage()): string {
  const p = params.get("bridge");
  if (p !== null) {
    const v = normalizeBase(p);
    try {
      if (v) storage?.setItem(BRIDGE_STORAGE_KEY, v);
      else storage?.removeItem(BRIDGE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return v;
  }
  try {
    return normalizeBase(storage?.getItem(BRIDGE_STORAGE_KEY) ?? "");
  } catch {
    return "";
  }
}

export function normalizeBase(v: string): string {
  const s = v.trim();
  if (!s || s === "default" || s === "same") return "";
  const withProto = /^https?:\/\//i.test(s) ? s : `http://${s}`;
  return withProto.replace(/\/+$/, "");
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ real bridge */

export function createBridgeClient(base: string): HomeClient {
  const url = (path: string) => `${base}${path}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url(path), {
      credentials: "include",
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      if (type.includes("json")) {
        const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        msg = body?.error ?? body?.message ?? msg;
      }
      throw new HomeHttpError(msg, res.status);
    }
    // A static host answering index.html for every path is not a bridge.
    if (!type.includes("json")) throw new HomeHttpError("Pas de pont maison ici.", 404);
    return (await res.json()) as T;
  }

  return {
    kind: "bridge",
    base,
    label: base ? base.replace(/^https?:\/\//, "") : location.host,
    snapshot: () => request<HomeSnapshot>(HOME_API.snapshot),
    action: (id, action) => request<Device>(HOME_API.action(id), { method: "POST", body: JSON.stringify(action) }),
    scene: (id) => request<HomeSnapshot>(HOME_API.scene(id), { method: "POST" }),
    order: (ids) => request<HomeSnapshot>(HOME_API.order, { method: "PUT", body: JSON.stringify({ order: ids }) }),
    subscribe(onEvent, onConnection) {
      let es: EventSource | null = null;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let delay = 1000;
      let closed = false;
      const handle = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data as string) as HomeEvent;
          if (data && typeof data === "object" && "type" in data) onEvent(data);
        } catch {
          /* keep-alive or garbage: ignore */
        }
      };
      const connect = () => {
        if (closed) return;
        es = new EventSource(url(HOME_API.events), { withCredentials: true });
        es.onopen = () => {
          delay = 1000;
          onConnection(true);
        };
        es.onmessage = handle;
        for (const name of ["snapshot", "device", "error"]) es.addEventListener(name, handle as EventListener);
        es.onerror = () => {
          onConnection(false);
          // The browser retries by itself while CONNECTING; once CLOSED we reconnect with a backoff.
          if (es?.readyState === EventSource.CLOSED) {
            es.close();
            es = null;
            clearTimeout(retry);
            retry = setTimeout(connect, delay);
            delay = Math.min(delay * 2, 15000);
          }
        };
      };
      connect();
      return () => {
        closed = true;
        clearTimeout(retry);
        es?.close();
      };
    },
  };
}

/* ------------------------------------------------------------------ mock */

/** Simulated album cover (SVG data URL: no request, no file). */
export function mockCoverUrl(from = "#ff7a59", to = "#5b2a86"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="186" cy="120" r="70" fill="#fff" fill-opacity=".38"/><path d="M0 220 Q75 190 150 222 T300 214 V300 H0Z" fill="#000" fill-opacity=".22"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MOCK_TV_APPS = [
  { id: "org.droidtv.playtv", label: "TV" },
  { id: "com.google.android.youtube.tv", label: "YouTube" },
  { id: "com.netflix.ninja", label: "Netflix" },
  { id: "com.canal.android.canal", label: "myCANAL" },
  { id: "com.amazon.amazonvideo.livingroom", label: "Prime Video" },
  { id: "com.disney.disneyplus", label: "Disney+" },
  { id: "fr.francetv.pluzz", label: "france.tv" },
  { id: "tv.arte.plus7", label: "ARTE" },
];

export function mockDevices(): Device[] {
  return [
    {
      id: "airplay:homepod",
      name: "HomePod mini",
      kind: "speaker",
      source: "mock",
      room: "Salon",
      itemId: "item_homepod",
      state: {
        on: true,
        reachable: true,
        volume: 35,
        media: {
          state: "playing",
          title: "Lumière d'octobre",
          artist: "Les Voisins du Dessus",
          album: "Rue Oberkampf",
          app: "Musique",
          position: 62,
          duration: 214,
          updatedAt: new Date().toISOString(),
          artworkUrl: mockCoverUrl(),
        },
      },
      capabilities: { media: ["play", "pause", "next", "previous"], volume: true },
    },
    {
      id: "hue:light:lightstrip",
      name: "Bandeau bureau",
      kind: "light",
      source: "mock",
      room: "Salon",
      itemId: "item_10",
      state: { on: true, reachable: true, brightness: 80, color: "#a66bff" },
      capabilities: { brightness: true, color: true, kelvin: true },
    },
    {
      id: "hue:light:ikea-lampe",
      name: "IKEA lampe",
      kind: "light",
      source: "mock",
      room: "Salon",
      itemId: "item_floorlamp",
      state: { on: true, reachable: true, brightness: 70, kelvin: 2700 },
      capabilities: { brightness: true, kelvin: true },
    },
    {
      id: "hue:light:lustre",
      name: "Lustre",
      kind: "light",
      source: "mock",
      room: "Salon",
      state: { on: null, reachable: false, brightness: 100 },
      capabilities: { brightness: true, kelvin: true },
    },
    {
      id: "hue:light:lustre-cuisine",
      name: "Lustre Cuisine",
      kind: "light",
      source: "mock",
      room: "Cuisine",
      itemId: "item_pendant_rattan",
      state: { on: false, reachable: true, brightness: 100, kelvin: 3000 },
      capabilities: { brightness: true, color: true, kelvin: true },
    },
    {
      id: "ha:switch.ikea_donut",
      name: "Lampe VARMBLIXT",
      kind: "plug",
      source: "mock",
      room: "Chambre",
      itemId: "item_varmblixt",
      state: { on: false, reachable: true },
      capabilities: {},
    },
    {
      id: "ha:fan.ventilateur",
      name: "Ventilateur",
      kind: "fan",
      source: "mock",
      room: "Salon",
      itemId: "item_fan",
      state: { on: false, reachable: true, speed: 0, lightOn: false },
      capabilities: { speedSteps: 6, fanLight: true },
    },
    {
      id: "robot:tv",
      name: "Télévision",
      kind: "tv",
      source: "mock",
      room: "Salon",
      itemId: "item_30",
      state: { on: false, reachable: true, volume: 12, ambilight: { on: false, color: "#4d7cff", brightness: 70 } },
      capabilities: {
        volume: true,
        buttons: ["tv_power", "source:HDMI 1", ...MOCK_TV_APPS.map((a) => `app:${a.id}`)],
        ambilight: { color: true, brightness: true, effects: ["FOLLOW_VIDEO: STANDARD", "FOLLOW_VIDEO: NATURAL", "FOLLOW_VIDEO: VIVID", "FOLLOW_AUDIO: VU_METER", "FOLLOW_COLOR: HOT_LAVA"] },
        apps: MOCK_TV_APPS,
      },
    },
  ];
}

type SceneFn = (d: Device) => DeviceAction[];

/** What each default scene does in the mock (the real bridge decides on its side). */
const MOCK_SCENES: Record<string, SceneFn> = {
  bright: (d) =>
    d.kind === "light" ? [{ type: "brightness", value: 100 }, d.capabilities.kelvin ? { type: "kelvin", value: 4000 } : { type: "power", on: true }] : d.kind === "plug" ? [{ type: "power", on: true }] : [],
  cozy: (d) => {
    if (d.id.includes("lightstrip")) return [{ type: "color", hex: "#ff9f43" }, { type: "brightness", value: 45 }];
    if (d.kind === "light") return [{ type: "kelvin", value: 2200 }, { type: "brightness", value: 40 }];
    if (d.kind === "plug") return [{ type: "power", on: true }];
    return [];
  },
  movie: (d) => {
    if (d.kind === "speaker") return d.state.media?.state === "playing" ? [{ type: "media", command: "pause" }] : [];
    if (d.kind === "tv") return [...(d.state.on ? [] : [{ type: "button", name: "tv_power" } as const]), { type: "ambilight", hex: "#4b1fd1", brightness: 25 }];
    if (d.kind === "light" || d.kind === "plug") return [{ type: "power", on: false }];
    return [];
  },
  night: (d) => {
    if (d.id.includes("ikea-lampe")) return [{ type: "kelvin", value: 2200 }, { type: "brightness", value: 10 }];
    if (d.kind === "fan") return [{ type: "fanLight", on: false }];
    if (d.kind === "tv") return d.state.on ? [{ type: "button", name: "tv_power" }] : [];
    if (d.kind === "light" || d.kind === "plug") return [{ type: "power", on: false }];
    return [];
  },
  away: (d) => {
    if (d.kind === "speaker") return d.state.media?.state === "playing" ? [{ type: "media", command: "pause" }] : [];
    if (d.kind === "fan") return [{ type: "speed", value: 0 }, { type: "fanLight", on: false }];
    if (d.kind === "tv") return [...(d.state.ambilight?.on ? [{ type: "ambilight", on: false } as const] : []), ...(d.state.on ? [{ type: "button", name: "tv_power" } as const] : [])];
    return [{ type: "power", on: false }];
  },
};

export interface MockOptions {
  /** Simulated network latency (ms). */
  latency?: number;
  /** 0..1 probability that an action fails (exercise the rollback: `?homeFail=0.3`). */
  failRate?: number;
}

export function createMockClient(opts: MockOptions = {}): HomeClient {
  const latency = opts.latency ?? 180;
  const failRate = opts.failRate ?? 0;
  let devices = mockDevices();
  const listeners = new Set<(e: HomeEvent) => void>();
  const wait = () => new Promise((r) => setTimeout(r, latency * (0.6 + Math.random() * 0.8)));
  const snap = (): HomeSnapshot => ({ home: "Home", devices: structuredClone(devices), scenes: DEFAULT_SCENES, updatedAt: new Date().toISOString() });
  const emit = (e: HomeEvent) => listeners.forEach((l) => l(e));
  const apply = (id: string, action: DeviceAction): Device => {
    const d = devices.find((x) => x.id === id);
    if (!d) throw new HomeHttpError("Appareil inconnu.", 404);
    if (!d.state.reachable) throw new HomeHttpError(`${d.name} est injoignable.`, 503);
    let next = predict(d, action);
    // Fans: a light toggle on the device means "light"; snap speeds to the steps.
    if (d.kind === "fan" && typeof next.state.speed === "number") {
      const steps = d.capabilities.speedSteps ?? 6;
      next = { ...next, state: { ...next.state, speed: stepToSpeed(Math.round((next.state.speed / 100) * steps), steps) } };
    }
    devices = devices.map((x) => (x.id === id ? next : x));
    return next;
  };

  return {
    kind: "mock",
    base: "",
    label: "démo locale",
    async snapshot() {
      await wait();
      return snap();
    },
    subscribe(onEvent, onConnection) {
      listeners.add(onEvent);
      setTimeout(() => onConnection(true), 0);
      return () => listeners.delete(onEvent);
    },
    async action(id, action) {
      await wait();
      if (failRate > 0 && Math.random() < failRate) throw new HomeHttpError("Le pont n'a pas répondu.", 504);
      const d = apply(id, action);
      // Like the real bridge, the change is also pushed to every client.
      setTimeout(() => emit({ type: "device", device: structuredClone(d) }), 30);
      return structuredClone(d);
    },
    async scene(id) {
      await wait();
      const fn = MOCK_SCENES[id];
      if (!fn) throw new HomeHttpError("Scène inconnue.", 404);
      for (const d of devices) {
        if (!d.state.reachable) continue;
        for (const a of fn(d)) apply(d.id, a);
      }
      const s = snap();
      setTimeout(() => emit({ type: "snapshot", snapshot: s }), 30);
      return s;
    },
    async order(ids) {
      await wait();
      devices = sortByOrder(devices, ids);
      const s = snap();
      setTimeout(() => emit({ type: "snapshot", snapshot: s }), 30);
      return s;
    },
  };
}
