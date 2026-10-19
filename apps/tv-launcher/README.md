# TV launcher — the 3D home screen for Google TV / Android TV

An Android app (Kotlin, framework views, no AndroidX) that replaces the TV home screen:

- the live 3D apartment on top (the bridge's `?view=3d&lite=1&orbit=full&tilt=64&maxDpr=1.5`),
- a glass **Lumières** panel: OK toggles a lamp, ← / → dims it (or sets the ceiling fan speed 0–6),
  scene pills (Tout éteindre, Lumineux, Cosy, Film, Nuit) — live state over SSE,
- a dock with only the chosen apps, clock + weather (Open-Meteo, no key), a background that follows
  the sun, and a screensaver (`MaisonDream`).

**Full procedure, safety notes and pitfalls: [`playbook/04-tv-launcher.md`](../../playbook/04-tv-launcher.md),
[`playbook/gotchas.md`](../../playbook/gotchas.md), [`playbook/recovery.md`](../../playbook/recovery.md).**

## Quick reference

```sh
export TV_HOST=192.168.1.30                    # your TV's IP
scripts/tv.sh install                          # build + install + grant WRITE_SECURE_SETTINGS + open
scripts/tv.sh shell am start -n com.appart3d.tvlauncher/.MainActivity \
  --es bridge http://<bridge-ip>:8787 --es pairCode <code> \
  --ef lat 48.85 --ef lon 2.35 --es dock "YouTube,Netflix,Prime Video"
scripts/tv.sh shell settings put secure enabled_accessibility_services com.appart3d.tvlauncher/.HomeButtonService
scripts/tv.sh shell settings put secure accessibility_enabled 1
scripts/tv.sh shell settings put secure screensaver_components com.appart3d.tvlauncher/.MaisonDream
```

`scripts/tv.sh` runs `adb` in a one-shot Docker container (macOS blocks Homebrew's adb on the LAN —
gotcha G4); with a working local `adb`, the same commands work with `adb -s $TV_HOST:5555`.

Build prerequisites: JDK 17, Android SDK platform 35 + build-tools 35, `local.properties` with
`sdk.dir=…`, and the Gradle **wrapper** (`./gradlew`, not a system Gradle ≥ 9.6 — gotcha G5).

## Files

| File | Role |
|---|---|
| `MainActivity.kt` | Home screen: 3D WebView, panel, dock, pairing, provisioning extras |
| `LightsPanel.kt`, `Glass.kt`, `Ambient.kt` | The glass panel, the glass drawable, the sun-colored background |
| `Home.kt`, `Bridge.kt` | Bridge client (SSE feed, actions, scenes), Bonjour discovery, pairing |
| `Apps.kt` | Dock (labels set over ADB, aliases per region) |
| `Weather.kt` | Open-Meteo + colored glyphs |
| `HomeButtonService.kt`, `HomeButtonGuard.kt` | Home key takeover + self-re-enable (gotchas G1, G2) |
| `MaisonDream.kt` | Screensaver |
