/**
 * Foreground app of the Philips Android TV, read over ADB (Home Assistant's androidtv integration,
 * service androidtv.adb_command → attribute adb_response). jointSPACE answers "NA" on these TVs.
 */

/** ADB query: the focused window names the foreground app's package. */
export const FOCUS_COMMAND = "dumpsys window | grep -E mCurrentFocus";

/** ADB query: every installed package (system ones too: Netflix / Prime Video / YouTube come preinstalled). */
export const PACKAGES_COMMAND = "pm list packages";

/**
 * Streaming apps the TV can open, in display order (package → label). Only these are offered as
 * launch buttons, when installed.
 */
export const LAUNCHABLE_APPS: readonly (readonly [string, string])[] = [
  ["org.droidtv.playtv", "TV"],
  ["com.google.android.youtube.tv", "YouTube"],
  ["com.netflix.ninja", "Netflix"],
  ["com.canal.android.canal", "myCANAL"],
  ["com.amazon.amazonvideo.livingroom", "Prime Video"],
  ["com.disney.disneyplus", "Disney+"],
  ["com.apple.atve.androidtv.appletv", "Apple TV"],
  ["fr.francetv.pluzz", "france.tv"],
  ["fr.tf1.mytf1", "TF1+"],
  ["fr.m6.m6replay", "M6+"],
  ["tv.arte.plus7", "ARTE"],
  ["com.molotov.tv", "Molotov"],
  ["com.orange.owtv.tv", "TV d'Orange"],
  ["com.google.android.videos", "Google TV"],
  ["tv.twitch.android.app", "Twitch"],
  ["com.spotify.tv.android", "Spotify"],
  ["deezer.android.app", "Deezer"],
  ["com.google.android.youtube.tvmusic", "YouTube Music"],
  ["com.google.android.youtube.tvkids", "YouTube Kids"],
  ["com.plexapp.android", "Plex"],
  ["org.videolan.vlc", "VLC"],
  ["org.xbmc.kodi", "Kodi"],
  ["com.android.vending", "Play Store"],
];

/** Package → label shown in the apps (unknown packages fall back to a cleaned-up name). */
const APP_LABELS: Record<string, string> = {
  ...Object.fromEntries(LAUNCHABLE_APPS),
  "com.google.android.tvlauncher": "Accueil",
  "com.google.android.apps.tv.launcherx": "Accueil",
  "com.android.tv.settings": "Paramètres",
  "org.droidtv.channels": "Guide TV",
};

/** Package name from a `mCurrentFocus=Window{… u0 com.pkg/com.pkg.Activity}` line, or null. */
export function parseFocus(response: string | undefined | null): string | null {
  if (!response) return null;
  const m = /mCurrentFocus=Window\{[^}]*?\s([a-zA-Z][\w.]*)\/[\w.$]+\}/.exec(response);
  return m ? m[1]! : null;
}

/** Human label for a package (HDMI inputs and live TV included). */
export function appLabel(pkg: string): string {
  if (APP_LABELS[pkg]) return APP_LABELS[pkg]!;
  if (/^org\.droidtv\.(hdmi|tvinput|eu\.hdmi)/i.test(pkg)) return "HDMI";
  const last = pkg.split(".").filter((p) => !["com", "android", "tv", "app", "org", "fr", "androidtv"].includes(p)).pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** HA entity of the ADB connection (media_player.android_tv_<ip> by default). */
export function isAdbEntity(entityId: string): boolean {
  return /^media_player\.android_tv_/.test(entityId);
}

/** Packages listed by `pm list packages` ("package:com.x.y" lines). */
export function parsePackages(response: string | undefined | null): string[] {
  if (!response) return [];
  return [...response.matchAll(/^package:([a-zA-Z][\w.]*)\s*$/gm)].map((m) => m[1]!);
}

/** Installed launchable apps, in display order. */
export function installedApps(packages: readonly string[]): { id: string; label: string }[] {
  const have = new Set(packages);
  return LAUNCHABLE_APPS.filter(([pkg]) => have.has(pkg)).map(([id, label]) => ({ id, label }));
}

/** A safe Android package name (it goes into a shell command on the TV). */
export function isPackageName(s: string): boolean {
  return /^[a-zA-Z][\w]*(\.[a-zA-Z_][\w]*)+$/.test(s) && s.length <= 128;
}

/** ADB commands that open an app: the TV launcher entry first, the phone-style one as fallback. */
export function launchCommands(pkg: string): string[] {
  if (!isPackageName(pkg)) throw new Error(`paquet invalide: ${pkg}`);
  return [
    `monkey -p ${pkg} -c android.intent.category.LEANBACK_LAUNCHER 1`,
    `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`,
  ];
}

/** monkey found no activity for that category ("No activities found to run, monkey aborted."). */
export function launchFailed(response: string | undefined | null): boolean {
  return !!response && /no activities found|monkey aborted/i.test(response);
}
