# Recovery — undo anything on the TV

Every change made by this project on a TV is reversible. Keep this page open during phase 4.

## Back to the stock Google TV home

```sh
adb shell settings delete secure enabled_accessibility_services   # or remove only our entry
adb shell settings put secure accessibility_enabled 0
```

Without a computer: Settings › Accessibility › "Maison : bouton Accueil" › off. The app turns it
back on when its home screen is shown again: to stop for good, **uninstall** it
(`adb uninstall com.appart3d.tvlauncher`, or Settings › Apps).

## If the stock launcher was disabled (do not do this — gotcha G1)

```sh
adb shell pm enable --user 0 com.google.android.apps.tv.launcherx
adb shell pm enable --user 0 com.google.android.tungsten.setupwraith
```

Symptom that it was: Home does nothing or loops; logcat shows
`SetupWraith|RecoveryActivity: Reenabling disabled home activity` many times per second.

## Screensaver

```sh
adb shell settings get secure screensaver_components        # note the original first
adb shell settings put secure screensaver_components com.google.android.apps.tv.dreamx/.service.Backdrop
```

## Inactivity delay changed for a test

```sh
adb shell settings put system screen_off_timeout <original ms>
```

## ADB authorization

Settings › Developer options › Revoke USB debugging authorizations; then turn USB debugging off.

## Last resort

Factory reset (Settings › System › Reset). Re-enable `setupwraith` **before** a factory reset if it
was disabled, or the setup wizard may not run.
