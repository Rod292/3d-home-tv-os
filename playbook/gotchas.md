# Gotchas — read before the phase they concern

Each one cost hours on the reference install. Format: **symptom → cause → fix → how to verify**.

## TV (phase 4)

### G1 — Google TV: never disable the stock launcher
- **Symptom:** after `pm disable-user com.google.android.apps.tv.launcherx`, Home does nothing or the
  TV loops; logcat: `SetupWraith|RecoveryActivity: Reenabling disabled home activity` several times a
  second. Disabling `setupwraith` too makes the system restart its UI and re-enable it.
  `cmd package set-home-activity` is ignored while launcherx is enabled.
- **Cause:** Google TV's setup wizard (`com.google.android.tungsten.setupwraith`) owns HOME as a
  fallback and insists on launcherx.
- **Fix:** keep launcherx enabled; take the Home key with an **accessibility service**
  (`HomeButtonService`: `onKeyEvent(KEYCODE_HOME)` → open our home; plus `TYPE_WINDOW_STATE_CHANGED`
  from launcherx → replace it at once). This is also how known third-party launchers do it.
- **Verify:** from Netflix, Home → `dumpsys activity activities | grep topResumedActivity` shows
  `com.appart3d.tvlauncher/.MainActivity`; then the person presses the **physical** Home key.
- **Undo:** [`recovery.md`](recovery.md).

### G2 — The TV silently drops the accessibility service
- **Symptom:** days later, Home opens Google TV again; `settings get secure enabled_accessibility_services` is `null`.
- **Cause:** app updates and firmware housekeeping clear the list.
- **Fix:** the app holds `WRITE_SECURE_SETTINGS` (`pm grant com.appart3d.tvlauncher android.permission.WRITE_SECURE_SETTINGS`,
  done by `tv.sh install`) and re-adds itself on boot, on update and each time its home is shown
  (`HomeButtonGuard`).
- **Verify:** clear the setting, open the app, read it again.

### G3 — Simulated keys are not the remote
- `input keyevent KEYCODE_HOME` may take a different path than the physical button on some brands
  (Philips ships its own `org.droidtv.homeintentresolver`). Always finish with the person pressing the
  real button.

### G4 — macOS blocks Homebrew `adb` on the LAN
- **Symptom:** `adb connect` → `No route to host`, while `ping` (a system binary) works.
- **Cause:** macOS Local Network privacy for unsigned CLI tools.
- **Fix:** run adb in a one-shot container (`apps/tv-launcher/scripts/tv.sh`), or grant Local
  Network to the terminal app in System Settings › Privacy.
- **Note:** inside a Colima/Docker VM, **ICMP ping to the LAN may fail while TCP works** — test with
  TCP (`bash -c "</dev/tcp/<ip>/<port>"`) before concluding the network is down.

### G5 — Gradle too new for the Android plugin
- **Symptom:** `relies on 'org.gradle.api.problems.internal.InternalProblems', a Gradle internal API that was removed in Gradle 9.6.0`.
- **Fix:** use the committed wrapper (`./gradlew`, Gradle 8.14.3). To regenerate it, run
  `gradle wrapper --gradle-version 8.14.3` in an **empty** directory and copy `gradlew` + `gradle/`.

### G10 — WebView timers are per process
- **Symptom:** the screensaver shows the clock but the 3D never appears.
- **Cause:** the home activity calls `WebView.pauseTimers()` in `onPause` — it pauses **every** WebView
  of the app, including the screensaver's.
- **Fix:** `web.resumeTimers()` in `DreamService.onDreamingStarted()`.

### G11 — WebView console is not in logcat on release TVs
- Relay what you need through `WebChromeClient.onConsoleMessage` → `Log.i("Maison", …)`.

### G12 — Don't trust `.local` in Android WebViews
- Find the bridge with `NsdManager` (`_appart3d._tcp`) and use its IPv4; keep the last URL.

## Devices (phase 3)

### G6 — Tuya fans: motor switch ≠ speed
- **Symptom:** the 3D fan spins while the real one is off (or the opposite); HA says `on 41 %` forever.
- **Cause:** Tuya exposes `fan_switch` and `fan_speed` separately; `fan.set_percentage` changes the
  speed (and may start the motor) without touching `fan_switch`, which is what HA reports as on/off.
  An RF remote changes the motor without telling the cloud.
- **Fix:** send `fan.turn_on` **with** `percentage` (the bridge does); offer an explicit stop
  (speed 0 → `turn_off`). To resync, switch it once from the app. HA's Tuya diagnostics
  (`/api/diagnostics/config_entry/<id>`) show the raw `status`.

### G7 — Home Assistant in Docker on macOS after a reboot
- **Symptom:** after the Mac restarts, the TV is "unavailable" in HA and the bridge sees fewer devices.
- **Fix:** restart the VM/container (`colima restart` or `docker restart homeassistant`), then check
  `GET /api/home` again. Long term: always-on hardware ([`06-always-on.md`](06-always-on.md)).

### G13 — The bridge reloads its config from disk
- Changes made only in memory (tests, scripts) are lost after a `PUT …/link` or `/order`, which save
  and reload `home.json`. Write config with `updateConfig()`.

## 3D (phase 2)

### G8 — On a TV, draw calls are the bottleneck, not pixels
- **Symptom:** 30–35 fps whatever the resolution (1x ≈ 2x).
- **Cause:** ~1000 draw calls (one mesh per furniture part) saturate the TV's CPU.
- **Fix:** parts merged per material (`packages/catalog/src/merge.ts`): ~480 calls, 34 → 57 fps at
  `maxDpr=1.5`. Measure with `?stats=1` on the device; tune `maxDpr`/`aa` last.

### G9 — The `glass` role is 32 % opaque
- A smoked-glass shade drawn with `glass` disappears and only the inner `glow` bulb shows. Draw the
  shade opaque (`toon`) and let a `glow` part peek out where the light really shows.

### G14 — Camera orbit around the wrong point
- A framing target computed for one viewing angle drifts across the screen in a full turn. For
  `orbit=full`, orbit around the room's centroid at furniture height (`ORBIT_TARGET_Y`).

## UI polish (TV)

- Text shadows with a large blur are clipped square at the TextView bounds → small radius + padding.
- A radial gradient larger than its view shows a hard edge → radius well inside the view.
- `GradientDrawable` scrims, `clipChildren=false` on a parent also stops a ScrollView from clipping
  its content (rows drawn over the title).
- The screen saver of some TVs (e.g. "Ambilight" on Philips) starts after inactivity during long
  agent sessions — wake the TV before screenshots, and expect ADB to go offline when it sleeps.
