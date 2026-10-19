import type { TvContent } from "./home";

/**
 * What the 3D TV screen shows in Maison mode (pure, tested): the real artwork / logo when the bridge
 * has one, otherwise a branded card for known apps / inputs — brand colors and a simple wordmark drawn
 * in canvas by three/TvScreen.ts (no logo files).
 */

export type BrandStyle = "netflix" | "youtube" | "prime" | "disney" | "canal" | "appletv" | "spotify" | "hdmi" | "channel" | "generic";

export interface TvBrand {
  style: BrandStyle;
  /** Label shown in the panel / on the card ("Netflix", "HDMI 2", "France 2"). */
  name: string;
  /** Background gradient (top-left → bottom-right). */
  bg: [string, string];
  /** Wordmark color. */
  fg: string;
  /** Brand accent (also tints the Ambilight halo when it follows the picture). */
  accent: string;
}

export interface TvCardModel {
  brand: TvBrand;
  /** Programme / video title. */
  title?: string;
  /** Second line (channel when the brand is an app, input name…). */
  subtitle?: string;
  /** Relative or absolute artwork URL (bridge). */
  artworkUrl?: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+]+/g, "");

const gen = (bg: [string, string], accent: string, fg = "#ffffff"): Omit<TvBrand, "name"> => ({ style: "generic", bg, fg, accent });

const BRANDS: { test: (n: string) => boolean; brand: Omit<TvBrand, "name">; name: string }[] = [
  { test: (n) => n.includes("youtubemusic"), name: "YouTube Music", brand: gen(["#0f0f0f", "#2a0505"], "#ff0000") },
  { test: (n) => n.includes("youtubekids"), name: "YouTube Kids", brand: gen(["#2a0505", "#0f0f0f"], "#ff0000") },
  { test: (n) => n.includes("googletv") || n === "playfilms", name: "Google TV", brand: gen(["#1f1f1f", "#0b1730"], "#4285f4") },
  { test: (n) => n.includes("netflix"), name: "Netflix", brand: { style: "netflix", bg: ["#000000", "#1a0306"], fg: "#e50914", accent: "#e50914" } },
  { test: (n) => n.includes("youtube"), name: "YouTube", brand: { style: "youtube", bg: ["#0f0f0f", "#212121"], fg: "#ffffff", accent: "#ff0000" } },
  { test: (n) => n.includes("primevideo") || n.includes("amazonprime") || n === "prime" || n.includes("amazonvideo"), name: "Prime Video", brand: { style: "prime", bg: ["#00050d", "#0f2a40"], fg: "#ffffff", accent: "#1399ff" } },
  { test: (n) => n.includes("disney"), name: "Disney+", brand: { style: "disney", bg: ["#0b1a5a", "#040714"], fg: "#ffffff", accent: "#3c7bff" } },
  { test: (n) => n.includes("canal") , name: "Canal+", brand: { style: "canal", bg: ["#000000", "#1c1c1c"], fg: "#ffffff", accent: "#e8e8e8" } },
  { test: (n) => n.includes("appletv") || n === "tvapp" || n.includes("tv+"), name: "Apple TV", brand: { style: "appletv", bg: ["#000000", "#2c2c2e"], fg: "#f5f5f7", accent: "#a1a1a6" } },
  { test: (n) => n.includes("spotify"), name: "Spotify", brand: { style: "spotify", bg: ["#121212", "#0c3b22"], fg: "#ffffff", accent: "#1db954" } },
  { test: (n) => n.includes("francetv"), name: "france.tv", brand: gen(["#0b1d6b", "#050b2e"], "#2f4bff") },
  { test: (n) => n.startsWith("tf1"), name: "TF1+", brand: gen(["#001f6b", "#000a24"], "#0050ff") },
  { test: (n) => n.startsWith("m6"), name: "M6+", brand: gen(["#0a2a4a", "#020c18"], "#00a3e0") },
  { test: (n) => n === "arte" || n.startsWith("arte+") || n.startsWith("artetv"), name: "ARTE", brand: gen(["#1c1c1c", "#0a0a0a"], "#fa481c", "#fa481c") },
  { test: (n) => n.includes("orange"), name: "TV d'Orange", brand: gen(["#1c1c1c", "#000000"], "#ff7900", "#ff7900") },
  { test: (n) => n.includes("molotov"), name: "Molotov", brand: gen(["#2a0f22", "#0d0509"], "#e6007e") },
  { test: (n) => n.includes("twitch"), name: "Twitch", brand: gen(["#1f0f3d", "#0e0e10"], "#9146ff") },
  { test: (n) => n.includes("deezer"), name: "Deezer", brand: gen(["#121216", "#2a0f44"], "#a238ff") },
  { test: (n) => n.includes("plex"), name: "Plex", brand: gen(["#1f1f1f", "#000000"], "#e5a00d", "#e5a00d") },
  { test: (n) => n === "vlc", name: "VLC", brand: gen(["#2a1500", "#0d0700"], "#ff8800", "#ff8800") },
  { test: (n) => n.includes("kodi"), name: "Kodi", brand: gen(["#0d2a3a", "#04121a"], "#17b2e7") },
  { test: (n) => n.includes("playstore"), name: "Play Store", brand: gen(["#0b2a1e", "#04120c"], "#01875f") },
];

const TV_INPUTS = new Set(["watchtv", "tv", "livetv", "television", "tnt", "antenne", "dvbt", "dvbc", "satellite"]);

/** Brand of an app / source label (null: unknown). */
export function brandOf(label: string | undefined): TvBrand | null {
  if (!label) return null;
  const n = norm(label);
  if (!n) return null;
  for (const b of BRANDS) if (b.test(n)) return { ...b.brand, name: b.name };
  const hdmi = /^hdmi(\d)?/.exec(n);
  if (hdmi) return { style: "hdmi", name: hdmi[1] ? `HDMI ${hdmi[1]}` : "HDMI", bg: ["#1d2b40", "#0a111d"], fg: "#e8eef8", accent: "#7aa7ff" };
  if (TV_INPUTS.has(n)) return channelBrand("TV");
  return null;
}

function channelBrand(name: string): TvBrand {
  return { style: "channel", name, bg: ["#12305a", "#08142a"], fg: "#ffffff", accent: "#4da3ff" };
}

/** Stable hue from a name (unknown apps get their own color). */
function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function genericBrand(name: string): TvBrand {
  const h = hueOf(name);
  return { style: "generic", name, bg: [`hsl(${h}, 45%, 22%)`, `hsl(${(h + 40) % 360}, 50%, 9%)`], fg: "#ffffff", accent: `hsl(${h}, 80%, 62%)` };
}

/** Brand of a TV app tile (known brand, else a stable color of its own). */
export function appBrand(label: string): TvBrand {
  return brandOf(label) ?? genericBrand(label);
}

/** The TV is on but tells nothing about what it shows. */
const ON_CARD: TvCardModel = {
  brand: { style: "generic", name: "TV allumée", bg: ["#22345c", "#070b18"], fg: "#ffffff", accent: "#8fb0ff" },
};

/** Card for the TV screen; null only without content (TV off: black screen). */
export function tvCardModel(c: TvContent | undefined): TvCardModel | null {
  if (!c) return null;
  const brand = brandOf(c.app) ?? (c.channel ? channelBrand(c.channel) : null) ?? brandOf(c.source) ?? (c.app ? genericBrand(c.app) : c.source ? genericBrand(c.source) : null);
  if (!brand)
    return c.title || c.artworkUrl
      ? { brand: genericBrand(c.title ?? "TV"), ...(c.title ? { title: c.title } : {}), ...(c.artworkUrl ? { artworkUrl: c.artworkUrl } : {}) }
      : ON_CARD;
  const model: TvCardModel = { brand };
  if (c.title) model.title = c.title;
  if (c.channel && brand.style !== "channel") model.subtitle = c.channel;
  else if (brand.style === "channel" && c.channel && brand.name !== c.channel) model.subtitle = c.channel;
  if (c.artworkUrl) model.artworkUrl = c.artworkUrl;
  return model;
}

/** Content key: redraw the canvas only when this changes. */
export function tvCardKey(m: TvCardModel | null): string {
  return m ? JSON.stringify([m.brand.style, m.brand.name, m.title, m.subtitle, m.artworkUrl]) : "";
}
