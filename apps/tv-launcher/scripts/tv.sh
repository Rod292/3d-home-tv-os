#!/bin/sh
# adb on the TV, run in a one-shot container on Colima (macOS blocks Homebrew's adb from the LAN).
#   scripts/tv.sh shell <cmd>      scripts/tv.sh install      (build + install the launcher)
# TV_HOST is your TV's IP (required); the adb key lives in ~/.config/appart3d/adb (authorized once on the TV).
set -e
TV_HOST="${TV_HOST:?set TV_HOST to your TV IP, e.g. TV_HOST=192.168.1.30}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
docker image inspect tv-adb >/dev/null 2>&1 || printf 'FROM alpine:3.22\nRUN apk add --no-cache android-tools\n' | docker build -q -t tv-adb - >/dev/null
mkdir -p "$HOME/.config/appart3d/adb"
adb() {
  docker run --rm -i -v "$HOME/.config/appart3d/adb:/root/.android" -v "$DIR/app/build/outputs/apk/release:/apk:ro" tv-adb \
    sh -c 'adb connect "$0:5555" >/dev/null 2>&1; sleep 1; adb -s "$0:5555" "$@"' "$TV_HOST" "$@"
}
if [ "$1" = install ]; then
  (cd "$DIR" && JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}" ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}" ./gradlew -q assembleRelease)
  adb install -r /apk/app-release.apk
  # Lets the app re-enable its Home key service by itself (the TV drops it now and then).
  adb shell pm grant com.appart3d.tvlauncher android.permission.WRITE_SECURE_SETTINGS
  adb shell am start -n com.appart3d.tvlauncher/.MainActivity >/dev/null
else
  adb "$@"
fi
