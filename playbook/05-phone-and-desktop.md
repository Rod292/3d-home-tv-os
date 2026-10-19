# 05 — Phone app and desktop widget (optional)

Both are native shells around the same embedded 3D (`?view=3d` / `?widget=1`) plus native controls,
talking to the bridge with the token from pairing. Both need Xcode and **the person's own** Apple
developer team.

## iPhone / iPad — `apps/ios-home` ("Maison")

- Native list of devices (toggle, brightness, fan speed, TV remote, scenes), the live 3D, Home-screen
  and Lock-screen widgets, Bonjour discovery, QR / code pairing.
- `brew install xcodegen && cd apps/ios-home && xcodegen generate`, set `DEVELOPMENT_TEAM` and unique
  bundle ids / App Group in `project.yml` (`com.example.*` placeholders), build on the device.
- Mock mode for screenshots without a bridge: launch argument `-mock`.

## macOS menu bar — `apps/macos`

- A house icon with the number of lights on; one click opens the 3D apartment and its controls.
- Same XcodeGen steps; *Réglages…* holds the bridge URL and the scene path. *Lancer au démarrage*
  uses `SMAppService`.

## Other platforms

The bridge API is plain HTTP + SSE (`packages/home/src/index.ts` documents it): an Android phone, a
Windows tray app or a Stream Deck plugin are thin clients — pair with `POST /api/pair`, read
`/api/home/events`, post actions.

**Done when** a change made on one screen (TV, phone, Mac) shows on the others within a second.
