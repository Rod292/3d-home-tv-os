/**
 * Mock adapter (HOME_BRIDGE_MOCK=1): the real device list with in-memory state, so the web app can
 * be developed without touching real devices. Ids match the real ones (so 3D links apply); source = "mock".
 * Lights go through the real Hue mapping code.
 */
import type { AmbilightState, Device, DeviceAction, MediaInfo } from "@appart3d/home";
import { tvAppButton } from "@appart3d/home";
import { createHash } from "node:crypto";
import { hueActionsToBody, hueLightToDevice, type HueLight } from "./hue.ts";
import { clamp } from "./color.ts";
import { mockCover } from "./cover.ts";
import { HOMEPOD_ID, homepodDevice, planHomePodAction, type HelperState } from "./homepod.ts";
import { installedApps } from "./tvApp.ts";
import { HttpError, type Adapter, type Artwork } from "./types.ts";

const ct = { min: 153, max: 500 };
const ikeaCt = { min: 250, max: 454 };

function mockLights(): Record<string, { light: HueLight; room: string }> {
  return {
    "12": {
      room: "Living room",
      light: { name: "lightstrip", type: "Extended color light", state: { on: true, bri: 120, xy: [0.4363, 0.4087], ct: 332, colormode: "xy", reachable: true }, capabilities: { control: { ct } } },
    },
    "18": {
      room: "Living room",
      light: { name: "IKEA lampe", type: "Extended color light", state: { on: false, bri: 254, xy: [0.4364, 0.4087], ct: 337, colormode: "ct", reachable: true }, capabilities: { control: { ct: ikeaCt } } },
    },
    "9": {
      room: "Living room",
      light: { name: "Lustre", type: "Extended color light", state: { on: false, bri: 254, xy: [0.4481, 0.4124], ct: 233, colormode: "xy", reachable: false }, capabilities: { control: { ct } } },
    },
    "17": {
      room: "Kitchen",
      light: { name: "Lustre Cuisine", type: "Extended color light", state: { on: false, bri: 254, xy: [0.458, 0.41], ct: 370, colormode: "ct", reachable: true }, capabilities: { control: { ct: ikeaCt } } },
    },
    "8": { room: "Bedroom", light: { name: "IKEA donut", type: "On/Off plug-in unit", state: { on: false, reachable: true } } },
  };
}

const TV_BUTTONS = ["tv_power", "volume_up", "volume_down", "mute", "channel_up", "channel_down", "home", "back", "ok", "up", "down", "left", "right"];
const TV_SOURCES = ["Watch TV", "HDMI 1", "HDMI 2", "Netflix", "YouTube", "Disney+"];

/** Apps installed on the simulated TV (the real TV's list). */
const TV_APPS = installedApps([
  "org.droidtv.playtv",
  "com.google.android.youtube.tv",
  "com.netflix.ninja",
  "com.canal.android.canal",
  "com.amazon.amazonvideo.livingroom",
  "com.disney.disneyplus",
  "fr.francetv.pluzz",
  "fr.tf1.mytf1",
  "fr.m6.m6replay",
  "tv.arte.plus7",
  "com.orange.owtv.tv",
  "com.google.android.videos",
  "tv.twitch.android.app",
  "deezer.android.app",
  "com.google.android.youtube.tvmusic",
  "com.android.vending",
]);

/** Ambilight effects of the simulated TV (subset of the real philips_js list, filtered like the real bridge). */
const AMBILIGHT_EFFECTS = [
  "FOLLOW_AUDIO: ENERGY_ADAPTIVE_BRIGHTNESS",
  "FOLLOW_AUDIO: RANDOM_PIXEL_FLASH",
  "FOLLOW_AUDIO: VU_METER",
  "FOLLOW_COLOR: DEEP_WATER",
  "FOLLOW_COLOR: FRESH_NATURE",
  "FOLLOW_COLOR: HOT_LAVA",
  "FOLLOW_COLOR: ISF",
  "FOLLOW_VIDEO: GAME",
  "FOLLOW_VIDEO: IMMERSIVE",
  "FOLLOW_VIDEO: NATURAL",
  "FOLLOW_VIDEO: STANDARD",
  "FOLLOW_VIDEO: VIVID",
];

/** Simulated TV content per source (made-up titles). */
const TV_SHOWS: Record<string, Omit<MediaInfo, "state">> = {
  Netflix: { app: "Netflix", title: "Les Ombres du Lac" },
  YouTube: { app: "YouTube", title: "Balade à vélo en Bretagne" },
  "Disney+": { app: "Disney+", title: "Le Grand Voyage" },
  "Watch TV": { channel: "France 2", title: "Journal de 20 h" },
};

/** Simulated playlist of the HomePod (made-up tracks). */
const TRACKS = [
  { title: "Lumière d'octobre", artist: "Les Voisins du Dessus", album: "Rue Oberkampf", duration: 214, colors: ["#ff7a59", "#5b2a86"] },
  { title: "Vélo sous la pluie", artist: "Sam & les Nuages", album: "Bretagne", duration: 187, colors: ["#3fc9e8", "#1d3c78"] },
  { title: "Café du matin", artist: "Trio Lelit", album: "Espresso", duration: 245, colors: ["#e8b04a", "#6b3a1f"] },
] as const;
export class MockAdapter implements Adapter {
  readonly name = "mock";
  private lights = mockLights();
  private fan = { on: false, speed: 0, lightOn: false };
  private tv: { on: boolean; volume: number; source: string; app?: string } = { on: true, volume: 18, source: "Netflix" };
  private ambilight: { on: boolean; brightness: number; color: string; effect: string | null } = { on: true, brightness: 70, color: "#d1263a", effect: "FOLLOW_VIDEO: STANDARD" };
  private speaker = { playing: true, track: 0, position: 62, at: Date.now(), volume: 35 };
  private onChange: () => void = () => {};
  private delayMs: number;

  constructor(delayMs = 120) {
    this.delayMs = delayMs;
  }

  private trackTimer: NodeJS.Timeout | null = null;

  async start(onChange: () => void): Promise<void> {
    this.onChange = onChange;
    // The simulated song ends and the next one starts, like on the real HomePod.
    this.trackTimer = setInterval(() => {
      const before = this.speaker.track;
      this.tickSpeaker();
      if (this.speaker.track !== before) this.onChange();
    }, 2000);
    this.trackTimer.unref?.();
  }

  stop(): void {
    if (this.trackTimer) clearInterval(this.trackTimer);
  }

  warnings(): string[] {
    return ["mode simulation (HOME_BRIDGE_MOCK=1) : aucun appareil réel n'est piloté"];
  }

  devices(): Device[] {
    const lights = Object.entries(this.lights).map(([id, { light, room }]) => ({
      ...hueLightToDevice(id, light, room),
      source: "mock" as const,
    }));
    const fan: Device = {
      id: "ha:fan.create_windcalm",
      name: "Ventilateur",
      kind: "fan",
      source: "mock",
      room: "Bedroom",
      state: { on: this.fan.on, reachable: true, speed: this.fan.on ? this.fan.speed : 0, lightOn: this.fan.lightOn },
      capabilities: { speedSteps: 6, fanLight: true },
    };
    const a = this.ambilight;
    // Following the picture / sound: no fixed color nor level (like philips_js).
    const ambilight: AmbilightState = !this.tv.on || !a.on ? { on: false } : a.effect ? { on: true, effect: a.effect } : { on: true, color: a.color, brightness: a.brightness };
    const show = this.tv.app ? { app: this.tv.app } : TV_SHOWS[this.tv.source];
    const tv: Device = {
      id: "ha:media_player.philips_tv",
      name: "TV Philips",
      kind: "tv",
      source: "mock",
      room: "Living room",
      state: this.tv.on
        ? { on: true, reachable: true, volume: this.tv.volume, source: this.tv.source, ...(show ? { media: { state: "playing", ...show } } : {}), ambilight }
        : { on: false, reachable: true, ambilight },
      capabilities: {
        volume: true,
        buttons: [...TV_BUTTONS, ...TV_SOURCES.map((s) => `source:${s}`), ...TV_APPS.map((x) => tvAppButton(x.id))],
        ambilight: { color: true, brightness: true, effects: AMBILIGHT_EFFECTS },
        apps: TV_APPS,
      },
    };
    const speaker: Device = { ...homepodDevice({ connected: true, state: this.speakerState(), stateAt: new Date(this.speaker.at) }, { name: "HomePod mini", room: "Salon" }), source: "mock" };
    return [...lights, fan, tv, speaker];
  }

  /** The simulated HomePod as the pyatv helper would report it. */
  private speakerState(): HelperState {
    const t = TRACKS[this.speaker.track]!;
    return {
      type: "state",
      playing: { device_state: this.speaker.playing ? "playing" : "paused", media_type: "music", title: t.title, artist: t.artist, album: t.album, position: this.speaker.position, total_time: t.duration, hash: `mock-${this.speaker.track}` },
      features: { play: true, pause: true, playPause: true, next: true, previous: true, setVolume: true, volume: true, artwork: true, app: true },
      volume: this.speaker.volume,
      artworkId: `mock-${this.speaker.track}`,
      app: { name: "Musique", id: "com.apple.Music" },
    };
  }

  /** Current position (the simulated track keeps playing; next track at its end). */
  private tickSpeaker(): void {
    const s = this.speaker;
    const now = Date.now();
    if (s.playing) {
      s.position += (now - s.at) / 1000;
      while (s.position >= TRACKS[s.track]!.duration) {
        s.position -= TRACKS[s.track]!.duration;
        s.track = (s.track + 1) % TRACKS.length;
      }
    }
    s.at = now;
  }

  async artwork(id: string): Promise<Artwork | null> {
    if (id !== HOMEPOD_ID) return null;
    const t = TRACKS[this.speaker.track]!;
    const key = createHash("sha1").update(`mock-${this.speaker.track}`).digest("hex").slice(0, 16);
    return { mime: "image/png", data: mockCover(t.colors[0], t.colors[1]), key };
  }

  async act(id: string, actions: DeviceAction[]): Promise<void> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    const hueId = /^hue:light:(\d+)$/.exec(id)?.[1];
    if (hueId) {
      const entry = this.lights[hueId];
      if (!entry) throw new HttpError(404, `lampe inconnue ${id}`);
      const s = entry.light.state;
      if (!s.reachable) return; // like the real bridge: accepted, nothing happens
      const body = hueActionsToBody(actions, entry.light);
      if (typeof body.on === "boolean") s.on = body.on;
      if (typeof body.bri === "number") s.bri = body.bri;
      if (Array.isArray(body.xy)) {
        s.xy = body.xy as [number, number];
        s.colormode = "xy";
      }
      if (typeof body.ct === "number") {
        s.ct = body.ct;
        s.colormode = "ct";
      }
    } else if (id === "ha:fan.create_windcalm") {
      for (const a of actions) {
        if (a.type === "toggle") this.fan.on = !this.fan.on;
        else if (a.type === "power") this.fan.on = a.on;
        else if (a.type === "speed") {
          this.fan.speed = clamp(Math.round(a.value), 0, 100);
          this.fan.on = this.fan.speed > 0;
        } else if (a.type === "fanLight") this.fan.lightOn = a.on;
        else throw new HttpError(400, `action ${a.type} non supportée par un ventilateur`);
        if (this.fan.on && this.fan.speed === 0) this.fan.speed = 50;
      }
    } else if (id === HOMEPOD_ID) {
      this.tickSpeaker();
      const s = this.speaker;
      for (const a of actions) {
        for (const c of planHomePodAction(this.speakerState(), a)) {
          if (c.cmd === "play") s.playing = true;
          else if (c.cmd === "pause") s.playing = false;
          else if (c.cmd === "play_pause") s.playing = !s.playing;
          else if (c.cmd === "next" || c.cmd === "previous") {
            s.track = (s.track + (c.cmd === "next" ? 1 : TRACKS.length - 1)) % TRACKS.length;
            s.position = 0;
          } else if (c.cmd === "set_volume") s.volume = c.value;
        }
      }
    } else if (id === "ha:media_player.philips_tv") {
      for (const a of actions) {
        if (a.type === "toggle") this.tv.on = !this.tv.on;
        else if (a.type === "power") this.tv.on = a.on;
        else if (a.type === "volume") this.tv.volume = clamp(Math.round(a.value), 0, 100);
        else if (a.type === "volumeStep") this.tv.volume = clamp(this.tv.volume + a.delta, 0, 100);
        else if (a.type === "ambilight") {
          const amb = this.ambilight;
          if (a.on === false) amb.on = false;
          else {
            if (!this.tv.on) throw new HttpError(409, "la TV est éteinte");
            amb.on = true;
            if (a.hex) {
              amb.color = a.hex.toLowerCase();
              amb.effect = null;
            }
            if (a.brightness !== undefined) {
              amb.brightness = clamp(Math.round(a.brightness), 1, 100);
              if (!a.effect && !a.hex) amb.effect = null;
            }
            if (a.effect) {
              if (!AMBILIGHT_EFFECTS.includes(a.effect)) throw new HttpError(400, `effet inconnu: ${a.effect}`);
              amb.effect = a.effect;
            }
          }
        } else if (a.type === "button") {
          if (a.name === "tv_power") this.tv.on = !this.tv.on;
          else if (a.name.startsWith("app:")) {
            const app = TV_APPS.find((x) => x.id === a.name.slice(4));
            if (!app) throw new HttpError(400, `appli inconnue: ${a.name}`);
            // Like the real bridge: switches the TV on first.
            this.tv.on = true;
            this.tv.app = app.label;
          } else if (a.name.startsWith("source:")) {
            this.tv.source = a.name.slice(7);
            delete this.tv.app;
          }
          else if (a.name === "volume_up") this.tv.volume = clamp(this.tv.volume + 1, 0, 100);
          else if (a.name === "volume_down") this.tv.volume = clamp(this.tv.volume - 1, 0, 100);
          else if (!TV_BUTTONS.includes(a.name)) throw new HttpError(400, `bouton inconnu: ${a.name}`);
        } else throw new HttpError(400, `action ${a.type} non supportée par la TV`);
      }
    } else throw new HttpError(404, `appareil inconnu ${id}`);
    this.onChange();
  }
}
