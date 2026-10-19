# 06 — Always-on hardware

The TV home screen itself runs on the TV: dock, Home key and weather work even when the bridge is
down. The 3D, the lights panel, the screensaver's 3D and the apps need the bridge (and Home Assistant
if used) running all the time.

| Option | Notes |
|---|---|
| **Raspberry Pi 5 (8 GB) + SSD** | Recommended. Raspberry Pi OS + Docker: Home Assistant container + the bridge (Node 24) as a systemd service. ~5 W. Use an SSD (NVMe HAT or USB), not an SD card: HA writes a lot. Ethernet if possible. |
| Home Assistant OS box (Pi, Green, Yellow) | Run the bridge on another machine, or as a custom add-on. |
| A Mac that stays awake | Fine to start: `install-launchd.sh`, *Prevent automatic sleeping when the display is off* on power. |
| NAS / mini-PC | Same as the Pi with Docker. |

A microcontroller (ESP32, M5Stack…) cannot run the bridge or Home Assistant.

## Moving the bridge

1. Copy `~/.config/appart3d/` (home.json, ha-token, hue.env) to the new machine — same token, so the
   paired TV/phone/Mac keep working.
2. Install Node 24 + pnpm, clone the repo, `pnpm install`, `pnpm --filter @appart3d/web build`.
3. Run the bridge as a service, e.g. `/etc/systemd/system/home-bridge.service`:

   ```ini
   [Unit]
   Description=3D Home TV OS bridge
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=pi
   WorkingDirectory=/home/pi/3d-home-tv-os/apps/home-bridge
   ExecStart=/usr/bin/node src/main.ts
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

   `sudo systemctl enable --now home-bridge`; logs: `journalctl -u home-bridge -f`.
4. Bonjour (`avahi` on Linux) lets the clients find it at its new address; the TV re-resolves it.
