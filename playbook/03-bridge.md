# 03 — The home bridge: devices → one API

`apps/home-bridge` (Node ≥ 24, no build step) talks to the devices and exposes one API for every
screen: `GET /api/home` (snapshot), `GET /api/home/events` (SSE), `POST /api/home/devices/:id/action`,
`POST /api/home/scenes/:id`. It also serves the web app and the scene, and announces itself on the
LAN with Bonjour (`_appart3d._tcp`). Contract: `packages/home/src/index.ts`.

## 0. Start with the mock

```sh
pnpm --filter @appart3d/web build
HOME_BRIDGE_MOCK=1 pnpm --filter @appart3d/home-bridge start
# → http://localhost:8787/?view=3d  (demo apartment, simulated lights/fan/TV)
```

Everything downstream (TV launcher, apps) can be built against this before any real device.

## 1. Configuration

First start creates `~/.config/appart3d/home.json` (mode 600) with a random access token and a
6-digit pair code. Edit it, never commit it. Main keys:

```jsonc
{
  "homeName": "Chez Alex",
  "defaultScene": "/shared/my-home.json",
  "rooms": { "Living room": "Salon" },                 // integration room names → display names
  "deviceNames": { "hue:light:3": "Floor lamp" },
  "links": { "hue:light:3": "item_floorlamp",          // device id → 3D item id (from the scene JSON)
             "kind:tv": "item_tv", "kind:fan": "item_fan" },
  "location": { "latitude": 48.85, "longitude": 2.35 },// sun → day/night in the 3D
  "hue": { "enabled": true },
  "homeAssistant": { "enabled": true, "url": "http://localhost:8123" }
}
```

List device ids: `curl -s localhost:8787/api/home | jq '.devices[] | {id,name,kind,itemId}'`
(loopback needs no token). Link without editing the file:
`curl -X PUT localhost:8787/api/home/devices/hue%3Alight%3A3/link -d '{"itemId":"item_floorlamp"}'`.

## 2. Philips Hue

Create `~/.config/appart3d/hue.env`:

```sh
HUE_BRIDGE_IP=192.168.1.x
HUE_USERNAME=…
```

To get a username: press the bridge's link button, then within 30 s
`curl -sk -X POST https://<ip>/api -d '{"devicetype":"3d-home-tv-os#bridge"}'` → copy `username`.

## 3. Home Assistant (Tuya, Zigbee, TV, everything else)

Run HA however they like (HA OS on a Pi, or Docker:
`docker run -d --name homeassistant --restart unless-stopped -p 8123:8123 -v ~/homeassistant:/config ghcr.io/home-assistant/home-assistant:stable`).
Add integrations in HA (Tuya, Android TV / Philips TV, …). Create a long-lived token (HA profile ›
Security) and save it to `~/.config/appart3d/ha-token`. The bridge maps HA lights, fans (with their
light), switches, media players and TV apps.

Before trusting a device's state, read gotchas **G6** (Tuya fan switch vs speed) and **G7** (HA in
Docker on macOS after a reboot).

## 4. Pairing clients

`pnpm --filter @appart3d/home-bridge pair` prints the LAN URL, the code and a QR. Native apps call
`POST /api/pair {code}` → token; the TV launcher can be provisioned over ADB (phase 4).

## 5. Keep it running

- macOS: `apps/home-bridge/scripts/install-launchd.sh` (starts at login, restarts on crash; logs in
  `~/Library/Logs/appart3d-home-bridge.log`). The Mac must not sleep — or move to always-on hardware
  ([`06-always-on.md`](06-always-on.md)).

**Done when** `GET /api/home` lists their real devices with the right names, rooms and `itemId`, and
an action from `curl` switches a real light and the 3D follows within a second.
