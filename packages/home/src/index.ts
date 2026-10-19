/**
 * @appart3d/home — contract between the home bridge (apps/home-bridge, runs on the Mac at home)
 * and its clients (the web app's "Maison" mode, the macOS menu bar app, the phone PWA).
 * STABLE CONTRACT: additive changes only.
 */

export type DeviceKind = "light" | "plug" | "fan" | "tv" | "remote" | "speaker";
export type DeviceSource = "hue" | "homeassistant" | "robot" | "mock" | "airplay";

/** Transport commands of a media device (speaker; the bridge only accepts those listed in `capabilities.media`). */
export type MediaCommand = "play" | "pause" | "playPause" | "next" | "previous";

/**
 * What a speaker (AirPlay / HomePod) or a TV is playing.
 * Speaker: title / artist / album / app (« Musique », « Spotify »…), position + duration in seconds.
 * TV: `app` = running app (Netflix…), `channel` = TV channel name, `title` = programme / media title;
 * the input (HDMI 1…) stays in `DeviceState.source`.
 */
export interface MediaInfo {
  state: "playing" | "paused" | "idle";
  title?: string;
  artist?: string;
  album?: string;
  app?: string;
  /** TV channel (Home Assistant `media_channel`). */
  channel?: string;
  /**
   * Cover / app logo, served by the bridge (relative URL `/api/home/media/<id>/artwork?h=<hash>`, same
   * auth as the API; the hash changes with the content, so it can be cached for good).
   */
  artworkUrl?: string;
  /** Seconds into the track at `updatedAt`. While playing, now = position + (now − updatedAt). */
  position?: number;
  /** Track length in seconds. */
  duration?: number;
  /** ISO time `position` was sampled. */
  updatedAt?: string;
}

export interface DeviceState {
  /** null = unknown / unreachable. */
  on: boolean | null;
  reachable: boolean;
  /** 0..100 (lights). */
  brightness?: number;
  /** Hex color the light shows right now (lights with color). */
  color?: string;
  /** Color temperature in kelvin (white-ambiance lights). */
  kelvin?: number;
  /** 0..100 (fans; 0 = off). */
  speed?: number;
  /** Fan's built-in light, if any. */
  lightOn?: boolean;
  /** TV volume 0..100 when known. */
  volume?: number;
  /** TV source / app label when known. */
  source?: string;
  /** Additive: now playing (speakers, TV). Absent when unknown / nothing to show. */
  media?: MediaInfo;
  /**
   * Additive (TV): the Ambilight behind the screen, folded into the TV device (no separate light).
   * Absent when the TV has no Ambilight. `color` / `brightness` are absent while it follows the
   * picture / sound (`effect` then says which mode, e.g. "FOLLOW_VIDEO: STANDARD").
   */
  ambilight?: AmbilightState;
}

export interface AmbilightState {
  on: boolean;
  /** Hex color it shows (fixed color mode only). */
  color?: string;
  /** 0..100. */
  brightness?: number;
  /** Current effect id, one of `capabilities.ambilight.effects` when known (raw Home Assistant name). */
  effect?: string;
}

export interface AmbilightCapabilities {
  color?: boolean;
  brightness?: boolean;
  /**
   * Effects offered (raw ids to send back in the `ambilight` action, e.g. "FOLLOW_VIDEO: STANDARD",
   * "FOLLOW_AUDIO: VU_METER", "FOLLOW_COLOR: HOT_LAVA"). Clients label them (see `ambilightEffectLabel`).
   */
  effects?: string[];
}

/** An app installed on the TV that the bridge can launch: `{ type: "button", name: "app:" + id }`. */
export interface TvApp {
  /** Android package name ("com.netflix.ninja"). */
  id: string;
  /** Label to show ("Netflix"). */
  label: string;
}

/** Button name that launches a TV app. */
export const tvAppButton = (id: string): string => `app:${id}`;

export interface DeviceCapabilities {
  brightness?: boolean;
  color?: boolean;
  kelvin?: boolean;
  /** Discrete fan speed steps (e.g. 6). */
  speedSteps?: number;
  fanLight?: boolean;
  volume?: boolean;
  /** Remote buttons (robot IR) available for this device. */
  buttons?: string[];
  /**
   * Additive: transport controls available right now (they change with what is playing: an idle
   * HomePod has none). `playPause` is accepted whenever `play` or `pause` is listed.
   */
  media?: ("play" | "pause" | "next" | "previous")[];
  /** Additive (TV): its Ambilight can be driven with the `ambilight` action. */
  ambilight?: AmbilightCapabilities;
  /**
   * Additive (TV): launchable apps installed on the TV (read over ADB), in display order. Each one is
   * also listed in `buttons` as `app:<id>`; launching turns the TV on first when it is off.
   */
  apps?: TvApp[];
}

export interface Device {
  /** Stable id, prefixed by source: "hue:light:12", "ha:fan.windcalm", "robot:tv". */
  id: string;
  name: string;
  kind: DeviceKind;
  source: DeviceSource;
  /** Room label as configured in the bridge (Salon, Cuisine, Chambre…). */
  room: string;
  /** Id of the 3D item this device is linked to (Scene item id), if mapped. */
  itemId?: string;
  state: DeviceState;
  capabilities: DeviceCapabilities;
}

export type DeviceAction =
  | { type: "toggle" }
  | { type: "power"; on: boolean }
  | { type: "brightness"; value: number }
  | { type: "color"; hex: string }
  | { type: "kelvin"; value: number }
  | { type: "speed"; value: number }
  | { type: "fanLight"; on: boolean }
  | { type: "volume"; value: number }
  | { type: "volumeStep"; delta: 1 | -1 }
  | { type: "button"; name: string }
  /** Speakers (and TVs when supported): transport control. */
  | { type: "media"; command: MediaCommand }
  /**
   * TV with `capabilities.ambilight`: drive its Ambilight. `on: false` turns it off (other fields
   * ignored); otherwise it is turned on with whatever is given (`hex` = fixed color, `brightness`
   * 1..100, `effect` = one of `capabilities.ambilight.effects`).
   */
  | { type: "ambilight"; on?: boolean; hex?: string; brightness?: number; effect?: string };

export interface HomeScene {
  id: string;
  /** French label: Lumineux, Cosy, Film, Nuit, Absent. */
  name: string;
  icon: "sun" | "sofa" | "film" | "moon" | "door";
}

export interface HomeSnapshot {
  home: string;
  devices: Device[];
  scenes: HomeScene[];
  /** ISO time of the last refresh. */
  updatedAt: string;
  /**
   * Additive: where the sun is for the home right now (Home Assistant's `sun.sun`, else computed by the
   * bridge from its clock and configured latitude / longitude). The bridge pushes a fresh `snapshot`
   * event when the elevation moves by ≥ 0.5° or day/night flips. Clients use it to light the 3D view
   * like outside (day above +6°, night below −6°, dusk in between).
   */
  sun?: SunInfo;
}

export interface SunInfo {
  /** Solar elevation in degrees above the horizon (negative below). */
  elevation: number;
  /** Sun above the horizon. */
  isDay: boolean;
  /** ISO time of the next sunrise, when known. */
  nextRising?: string;
  /** ISO time of the next sunset, when known. */
  nextSetting?: string;
}

/** 3D lighting of the native / embedded views: follow the sun (`auto`) or force day / night. */
export type DaylightMode = "auto" | "day" | "night";
/** Default camera framing of the embedded view: the living room (room of the TV) or the whole apartment. */
export type FrameTarget = "living" | "all";

/** Server-sent event payloads on GET /api/home/events. */
export type HomeEvent =
  | { type: "snapshot"; snapshot: HomeSnapshot }
  | { type: "device"; device: Device }
  | { type: "error"; message: string };

/**
 * HTTP API served by the bridge (same origin as the web app it serves; JSON; auth by
 * `Authorization: Bearer <token>` or the `appart3d_home` cookie set by GET /pair?code=XXXXXX):
 *   GET  /api/home                      → HomeSnapshot
 *   GET  /api/home/events               → text/event-stream of HomeEvent
 *   POST /api/home/devices/:id/action   body DeviceAction → Device
 *   POST /api/home/scenes/:id           → HomeSnapshot
 *   PUT  /api/home/devices/:id/link     body { itemId: string | null } → Device
 *   PUT  /api/home/order                body { order: string[] } (device ids) → HomeSnapshot (also pushed as a
 *                                       `snapshot` event). Shared tile order: `HomeSnapshot.devices` comes sorted
 *                                       by it (ids not listed follow, in the bridge's usual order).
 *   GET  /api/home/media/:id/artwork    → image (cover of what a speaker / TV plays; 404 when none)
 *   POST /api/pair                      body PairRequest → PairResponse (no auth; rate-limited; for native apps)
 *
 * The bridge also advertises itself on the LAN with Bonjour as `_appart3d._tcp` (TXT: home=<name>).
 */
export const HOME_API = {
  snapshot: "/api/home",
  events: "/api/home/events",
  action: (id: string) => `/api/home/devices/${encodeURIComponent(id)}/action`,
  scene: (id: string) => `/api/home/scenes/${encodeURIComponent(id)}`,
  link: (id: string) => `/api/home/devices/${encodeURIComponent(id)}/link`,
  artwork: (id: string) => `/api/home/media/${encodeURIComponent(id)}/artwork`,
  order: "/api/home/order",
  pair: "/api/pair",
} as const;

/** Native app pairing: exchange the 6-digit pair code (shown by `pnpm pair`, also in its QR URL) for the token. */
export interface PairRequest {
  code: string;
  /** e.g. "iPhone d'Alex" — for the bridge log only. */
  deviceName?: string;
}

export interface PairResponse {
  /** Bearer token for every /api/* call (also valid as the appart3d_home cookie). */
  token: string;
  home: string;
}

/** Bonjour service type advertised by the bridge. */
export const BONJOUR_SERVICE = "_appart3d._tcp";

/**
 * Embedded 3D view (native apps load `<bridge>/?view=3d&scene=…` in a web view).
 * URL options: `&daylight=auto|day|night` (default auto: follows `HomeSnapshot.sun`; `&night=1|0` forces),
 * `&frame=living|all` (default living), `&autoRotate=0`, `&flyToChanges=0` (no camera flight toward a
 * device whose on/off state changed).
 * Native → web: `window.appart3dEmbed.post(EmbedCommand)`.
 * Web → native: `window.webkit.messageHandlers.appart3d.postMessage(EmbedEvent)` (iOS/macOS WKWebView).
 */
export type EmbedCommand =
  | { type: "focusItem"; itemId: string | null }
  | { type: "highlightDevice"; deviceId: string | null }
  | { type: "setNight"; night: boolean }
  /** Follow the sun (auto) or force day / night (setNight still works = day / night). */
  | { type: "setDaylight"; mode: DaylightMode }
  /** Whole apartment, now (the idle sway continues around it until `frame`). */
  | { type: "overview" }
  /** Default framing to return to (after a focus, a flight, an idle period): living room or all. */
  | { type: "frame"; target: FrameTarget }
  | { type: "autoRotate"; enabled: boolean };

export type EmbedEvent =
  | { type: "ready" }
  /** The user tapped a 3D item linked to these devices (empty: unlinked item). */
  | { type: "itemTapped"; itemId: string; deviceIds: string[] }
  | { type: "error"; message: string };

/** French label of a Philips Ambilight effect id ("FOLLOW_VIDEO: STANDARD" → "Vidéo · Standard"). */
export function ambilightEffectLabel(effect: string): string {
  const [group = "", name = "", expert] = effect.split(":").map((p) => p.trim());
  const groups: Record<string, string> = { FOLLOW_VIDEO: "Vidéo", FOLLOW_AUDIO: "Son", FOLLOW_COLOR: "Couleur", Mode: "Mode" };
  const names: Record<string, string> = {
    STANDARD: "Standard",
    NATURAL: "Naturel",
    VIVID: "Vif",
    GAME: "Jeu",
    IMMERSIVE: "Immersif",
    ENERGY_ADAPTIVE_BRIGHTNESS: "Énergie",
    ENERGY_ADAPTIVE_COLORS: "Couleurs énergie",
    RANDOM_PIXEL_FLASH: "Flash",
    VU_METER: "VU-mètre",
    SPECTRUM_ANALYZER: "Spectre",
    KNIGHT_RIDER_ALTERNATING: "K2000",
    KNIGHT_RIDER_CLOCKWISE: "K2000 rotatif",
    PARTY: "Fête",
    STROBO: "Strobo",
    CUSTOM_COLOR: "Personnalisée",
    DEEP_WATER: "Eau profonde",
    FRESH_NATURE: "Nature",
    HOT_LAVA: "Lave",
    ISF: "Blanc chaud",
    AUTOMATIC_HUE: "Teinte auto",
    MANUAL_HUE: "Teinte manuelle",
    expert: "Expert",
    internal: "Interne",
    lounge: "Lounge",
    manual: "Manuel",
  };
  const g = groups[group];
  if (!g) return effect;
  const n = names[name] ?? name.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return `${g} · ${n}${expert ? " (expert)" : ""}`;
}

export const DEFAULT_SCENES: HomeScene[] = [
  { id: "bright", name: "Lumineux", icon: "sun" },
  { id: "cozy", name: "Cosy", icon: "sofa" },
  { id: "movie", name: "Film", icon: "film" },
  { id: "night", name: "Nuit", icon: "moon" },
  { id: "away", name: "Absent", icon: "door" },
];
