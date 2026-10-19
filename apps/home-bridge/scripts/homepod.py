"""HomePod / AirPlay helper for the home bridge (apps/home-bridge/src/homepod.ts).

Runs with the pyatv venv (~/.config/appart3d/pyatv-venv/bin/python -I homepod.py --ip … --host …).
One long-lived connection (AirPlay, no pairing needed for metadata on a HomePod with acl=0):

stdout — one JSON object per line:
  {"type": "connected", "ip": "...", "name": "...", "model": "..."}
  {"type": "state", "playing": {...}, "features": {...}, "volume": 49.0, "artworkId": "..."}
  {"type": "reply", "id": 3, "ok": true, ...}          (answer to a stdin command)
  {"type": "error", "message": "..."}                   (then exits: the bridge restarts it with a backoff)

stdin — one JSON command per line: {"id": 3, "cmd": "artwork" | "play" | "pause" | "play_pause" | "next"
  | "previous" | "set_volume", "value": 40}. Transport commands are refused unless pyatv reports the
  feature as available right now.
"""
import argparse
import asyncio
import base64
import json
import socket
import sys

import pyatv
from pyatv.const import FeatureName, FeatureState
from pyatv.interface import AudioListener, DeviceListener, PushListener

FEATURES = {
    "play": FeatureName.Play,
    "pause": FeatureName.Pause,
    "playPause": FeatureName.PlayPause,
    "next": FeatureName.Next,
    "previous": FeatureName.Previous,
    "setVolume": FeatureName.SetVolume,
    "volume": FeatureName.Volume,
    "artwork": FeatureName.Artwork,
    "app": FeatureName.App,
}

COMMANDS = {
    "play": ("play", FeatureName.Play),
    "pause": ("pause", FeatureName.Pause),
    "play_pause": ("play_pause", FeatureName.PlayPause),
    "next": ("next", FeatureName.Next),
    "previous": ("previous", FeatureName.Previous),
}


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def enum_name(v):
    return v.name.lower() if v is not None and hasattr(v, "name") else None


def playing_dict(p):
    return {
        "device_state": enum_name(p.device_state),
        "media_type": enum_name(p.media_type),
        "title": p.title,
        "artist": p.artist,
        "album": p.album,
        "genre": p.genre,
        "position": p.position,
        "total_time": p.total_time,
        "hash": p.hash,
    }


async def find(loop, ip, host, identifier, timeout):
    """Unicast scan of the known IP, then of the Bonjour host (IP changed), then multicast by identifier."""
    tried = []
    for candidate in [ip, host]:
        if not candidate:
            continue
        addr = candidate
        if candidate == host:
            try:
                infos = await loop.getaddrinfo(host, None, family=socket.AF_INET)
                addr = infos[0][4][0] if infos else None
            except OSError:
                addr = None
        if not addr or addr in tried:
            continue
        tried.append(addr)
        confs = await pyatv.scan(loop, hosts=[addr], timeout=timeout)
        if confs:
            return confs[0]
    if identifier:
        confs = await pyatv.scan(loop, identifier=identifier, timeout=timeout)
        if confs:
            return confs[0]
    return None


class Helper(PushListener, AudioListener, DeviceListener):
    def __init__(self, atv, loop):
        self.atv = atv
        self.loop = loop
        self.playing = None
        self.closed = asyncio.Event()
        self.last_state = None

    # --- pyatv listeners
    def playstatus_update(self, updater, playstatus):
        self.playing = playstatus
        self.send_state()

    def playstatus_error(self, updater, exception):
        emit({"type": "log", "message": f"push: {exception}"})

    def volume_update(self, old_level, new_level):
        self.send_state()

    def volume_device_update(self, output_device, old_level, new_level):
        pass

    def outputdevices_update(self, old_devices, new_devices):
        pass

    def connection_lost(self, exception):
        emit({"type": "error", "message": f"connexion perdue: {exception}"})
        self.closed.set()

    def connection_closed(self):
        emit({"type": "error", "message": "connexion fermée"})
        self.closed.set()

    # --- state
    def available(self, feature):
        try:
            return self.atv.features.in_state(FeatureState.Available, feature)
        except Exception:
            return False

    def send_state(self, force=False):
        feats = {k: self.available(f) for k, f in FEATURES.items()}
        volume = None
        if feats["volume"]:
            try:
                volume = self.atv.audio.volume
            except Exception:
                volume = None
        artwork_id = None
        try:
            artwork_id = self.atv.metadata.artwork_id
        except Exception:
            pass
        app = None
        if feats["app"]:
            try:
                a = self.atv.metadata.app
                app = {"name": a.name, "id": a.identifier} if a else None
            except Exception:
                app = None
        state = {
            "type": "state",
            "app": app,
            "playing": playing_dict(self.playing) if self.playing else None,
            "features": feats,
            "volume": volume,
            "artworkId": artwork_id,
        }
        key = json.dumps(state, sort_keys=True)
        if force or key != self.last_state:
            self.last_state = key
            emit(state)

    async def refresh(self):
        self.playing = await self.atv.metadata.playing()
        self.send_state(force=True)

    # --- commands
    async def handle(self, msg):
        rid = msg.get("id")
        cmd = msg.get("cmd")
        try:
            if cmd == "artwork":
                if not self.available(FeatureName.Artwork):
                    return emit({"type": "reply", "id": rid, "ok": False, "error": "unavailable"})
                art = await self.atv.metadata.artwork(width=int(msg.get("width") or 512))
                if not art or not art.bytes:
                    return emit({"type": "reply", "id": rid, "ok": False, "error": "none"})
                return emit({
                    "type": "reply", "id": rid, "ok": True, "mime": art.mimetype or "image/jpeg",
                    "data": base64.b64encode(art.bytes).decode("ascii"),
                })
            if cmd in COMMANDS:
                method, feature = COMMANDS[cmd]
                if not self.available(feature):
                    return emit({"type": "reply", "id": rid, "ok": False, "error": "unsupported"})
                await getattr(self.atv.remote_control, method)()
                return emit({"type": "reply", "id": rid, "ok": True})
            if cmd == "set_volume":
                if not self.available(FeatureName.SetVolume):
                    return emit({"type": "reply", "id": rid, "ok": False, "error": "unsupported"})
                value = max(0.0, min(100.0, float(msg.get("value"))))
                await self.atv.audio.set_volume(value)
                return emit({"type": "reply", "id": rid, "ok": True})
            if cmd == "refresh":
                await self.refresh()
                return emit({"type": "reply", "id": rid, "ok": True})
            emit({"type": "reply", "id": rid, "ok": False, "error": f"unknown command {cmd}"})
        except Exception as e:  # noqa: BLE001 — reported to the bridge
            emit({"type": "reply", "id": rid, "ok": False, "error": str(e) or type(e).__name__})


async def read_stdin(loop, helper):
    reader = asyncio.StreamReader()
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin)
    while not helper.closed.is_set():
        line = await reader.readline()
        if not line:  # the bridge went away
            helper.closed.set()
            return
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if isinstance(msg, dict):
            asyncio.ensure_future(helper.handle(msg))


async def heartbeat(helper, every):
    """Periodic poll: catches missed pushes and a silently dead connection."""
    while not helper.closed.is_set():
        try:
            await asyncio.wait_for(helper.closed.wait(), timeout=every)
            return
        except asyncio.TimeoutError:
            pass
        try:
            await asyncio.wait_for(helper.refresh(), timeout=15)
        except Exception as e:  # noqa: BLE001
            emit({"type": "error", "message": f"heartbeat: {e}"})
            helper.closed.set()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ip")
    ap.add_argument("--host")
    ap.add_argument("--id")
    ap.add_argument("--scan-timeout", type=float, default=5)
    ap.add_argument("--heartbeat", type=float, default=60)
    args = ap.parse_args()
    loop = asyncio.get_running_loop()

    conf = await find(loop, args.ip, args.host, args.id, args.scan_timeout)
    if conf is None:
        emit({"type": "error", "message": "HomePod introuvable sur le réseau"})
        return 2
    atv = await pyatv.connect(conf, loop)
    helper = Helper(atv, loop)
    try:
        info = conf.device_info
        emit({"type": "connected", "ip": str(conf.address), "name": conf.name, "model": str(info.model_str) if info else None,
              "identifier": conf.identifier})
        atv.listener = helper
        atv.audio.listener = helper
        atv.push_updater.listener = helper
        atv.push_updater.start()
        await helper.refresh()
        await asyncio.gather(read_stdin(loop, helper), heartbeat(helper, args.heartbeat))
    finally:
        atv.close()
    return 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        sys.exit(0)
