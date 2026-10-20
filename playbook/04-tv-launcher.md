# 04 — The TV: replace the home screen (Google TV / Android TV)

`apps/tv-launcher` is a small Android app (Kotlin, no AndroidX): the live 3D on top (the bridge's
`?view=3d`), a glass lights panel (selecting a lamp outlines it in the 3D and flies the camera there;
OK toggles, ← / → dims or sets the fan speed; scene pills), a dock of chosen apps, clock + weather,
and a screensaver. Its UI follows the TV's language (English by default, French included — add a
`res/values-<lang>/strings.xml` for more). Read gotchas **G1–G5** first.

**Ask the person before each TV step below**, say what it changes and how to undo it
([`recovery.md`](recovery.md)).

## 1. Prepare the TV

1. Settings › System › About › tap **Build** 7 times → Developer options.
2. Developer options › **USB debugging** on (on Google TV this also enables network ADB on port 5555 on
   most models; if not, use **Wireless debugging** and `adb pair <ip>:<port>`).
3. Note the TV's IP (Settings › Network). Give it a DHCP reservation in the router if possible.

## 2. Reach it with ADB

```sh
adb connect <tv-ip>:5555     # then accept "Allow USB debugging?" ON THE TV, tick "Always allow"
adb devices -l
```

On **macOS 15+**, Homebrew's `adb` may get `No route to host` while `ping` works: macOS's Local
Network privacy blocks it (gotcha G4). `apps/tv-launcher/scripts/tv.sh` runs adb in a throw-away
Docker container instead (`TV_HOST=<tv-ip> apps/tv-launcher/scripts/tv.sh devices`); the key is kept
in `~/.config/appart3d/adb` so the TV asks only once.

## 3. Build and install

Prerequisites: JDK 17 (`brew install openjdk@17`), Android command-line tools
(`brew install android-commandlinetools`, then `sdkmanager "platforms;android-35" "build-tools;35.0.0"`),
and `apps/tv-launcher/local.properties` with `sdk.dir=…`. Always use the Gradle **wrapper**
(`./gradlew`), not a system Gradle ≥ 9.6 (gotcha G5).

```sh
TV_HOST=<tv-ip> apps/tv-launcher/scripts/tv.sh install   # build, install, grant WRITE_SECURE_SETTINGS, open it
```

## 4. Provision (once)

```sh
TV_HOST=<tv-ip> apps/tv-launcher/scripts/tv.sh shell am start -n com.appart3d.tvlauncher/.MainActivity \
  --es bridge http://<bridge-ip>:8787 --es pairCode <6 digits> \
  --ef lat 48.85 --ef lon 2.35 \
  --es dock "YouTube,Netflix,Prime Video,Disney+,Spotify"
```

Without `bridge`, the TV finds the bridge by Bonjour and shows a pairing screen. Without `lat/lon`
there is no weather. Dock labels are the names the TV shows under each app.

## 5. Make it the home screen — the safe way

Do **not** disable `com.google.android.apps.tv.launcherx` (gotcha G1). Enable the app's accessibility
service: it takes the Home key, and replaces the Google TV home if it still shows up (boot).

```sh
TV_HOST=<tv-ip> apps/tv-launcher/scripts/tv.sh shell settings put secure enabled_accessibility_services com.appart3d.tvlauncher/.HomeButtonService
TV_HOST=<tv-ip> apps/tv-launcher/scripts/tv.sh shell settings put secure accessibility_enabled 1
```

Check what is already in `enabled_accessibility_services` first and append rather than overwrite.
The TV may drop the service later (updates, firmware housekeeping): the app re-enables it itself
thanks to `WRITE_SECURE_SETTINGS` (granted by `tv.sh install`) — gotcha G2.

## 6. Screensaver (optional)

```sh
TV_HOST=<tv-ip> apps/tv-launcher/scripts/tv.sh shell settings put secure screensaver_components com.appart3d.tvlauncher/.MaisonDream
```

It starts after the TV's inactivity delay (`settings get system screen_off_timeout`, ms). To test
quickly, lower it to 15000, check, then **restore the original value**.

## 7. Robustness — keep basic TV controls no matter what

- The 3D runs in a WebView; if its renderer dies, the WebView is replaced and the 3D reloads while the
  dock, the lights panel and the Home key keep working (gotcha G15).
- If the app itself crash-loops, the Home key goes back to the stock Google TV home until things calm
  down (gotcha G16). The stock launcher is never disabled, so it is always there.
- When you add a feature to the launcher, run both crash tests again (`--ez crash3d true`,
  `--ez crashApp true` ×3) before calling it done.

## 8. Verify on the real TV

- Screenshot: `tv.sh shell screencap -p /data/local/tmp/s.png && tv.sh shell cat /data/local/tmp/s.png > s.png`.
- Home from inside an app returns to the launcher: `tv.sh shell dumpsys activity activities | grep topResumedActivity`.
- 3D fps on the TV: provision `--es heroExtra "&stats=1"`, then `tv.sh shell logcat -d -s Maison`.
- Then ask the person to try **with the physical remote** — simulated key events are not proof.

**Done when** the physical Home key opens the new home screen from any app, the 3D runs smoothly,
and toggling a lamp in the panel switches the real lamp and the 3D.
