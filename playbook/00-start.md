# 00 — Start: interview, then a plan

Goal: understand the person's home and gear, pick a path through the phases, and agree on it
before touching anything. Ask these in a few short messages, not a form.

## 1. Questions to ask

**TV**
- Brand/model, and which OS: Google TV, Android TV, Fire TV, Apple TV, Samsung (Tizen), LG (webOS)?
  → See the compatibility table below; this decides phase 4.
- Are they OK enabling developer options on it?

**Scan**
- Do they have an iPhone/iPad **Pro** (LiDAR: iPhone 12 Pro and later Pro models, iPad Pro 2020+)?
- A Mac with Xcode to build the scanner app? (Otherwise: Polycam/3D Scanner App export, or draw the
  plan — see phase 1.)

**Devices**
- Lights: Philips Hue? IKEA/Tuya/Zigbee/other? Do they already run **Home Assistant**?
- Other things worth showing in 3D: ceiling fan, TV itself, speakers (HomePod, Sonos), plugs.

**Always-on machine**
- What will run the bridge 24/7: a Mac that stays awake, a Raspberry Pi, a NAS, a mini-PC?
  The TV home screen works without it, but the 3D and the lights panel need it.

**Phone / desktop (optional, phase 5)**
- iPhone app and widgets? macOS menu-bar widget? (They need Xcode and an Apple developer team.)

**Taste**
- Which apps should the TV dock show (only those)? Language of the UI? City for the weather?

## 2. TV compatibility (phase 4)

| TV platform | Can its home screen be replaced? | Path |
|---|---|---|
| **Google TV** (Philips, Sony, TCL, Hisense, Chromecast with Google TV) | Yes, via an accessibility service that takes the Home key (stock launcher stays installed) | `apps/tv-launcher` as is — read gotchas G1–G4 |
| **Android TV** (older, no Google TV UI) | Yes; often simpler (the default-home setting may be respected) | `apps/tv-launcher`; try the preferred-home route first |
| **Fire TV** | Partly: Amazon re-asserts its launcher; same accessibility approach usually needed | `apps/tv-launcher`, test carefully |
| **Apple TV (tvOS)** | **No** — the home screen cannot be replaced | Build a tvOS app showing the 3D instead (not included); or use a cheap Google TV dongle on an HDMI input |
| **Samsung Tizen / LG webOS** | No (closed launchers) | A Google TV / Chromecast dongle on HDMI is the practical route |

A **Chromecast with Google TV or Google TV Streamer** (~€40–100) makes any TV compatible.

## 3. Choose the path

Write the plan back to the person in this shape, adapted:

```
Phase 1 — Scan:        iPhone 15 Pro + apps/ios scanner        (or: Polycam / drawn plan)
Phase 2 — 3D model:    import scan → arrange in the web editor → export scene
Phase 3 — Bridge:      Hue + Home Assistant (Tuya fan, TV) on a Mac for now, Pi later
Phase 4 — TV:          Philips Google TV → apps/tv-launcher, dock = YouTube, Netflix, …
Phase 5 — Extras:      iPhone app, macOS widget, screensaver
```

Then start phase 1. Each phase file ends with what "done" means; the full checklist is in
[`verification.md`](verification.md).

## 4. Set expectations honestly

- Phases 1–3 are an evening for someone comfortable with a terminal (with the agent doing the work).
- Phase 4 depends on the TV; Google TV needs a few ADB steps and one on-screen authorization.
- The reference 3D style is procedural low-poly ("dollhouse"); furniture comes from a catalog of
  builders, not from the scan's meshes. Their own special pieces (a specific lamp, a shelf) can be
  modeled by adding a builder — see phase 2.
