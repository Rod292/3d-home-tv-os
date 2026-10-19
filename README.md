# 3D Home TV OS

**Scan your home, turn it into a live 3D model, and make it your TV's home screen** — no ads, no
"recommended for you" — with your lights and devices wired in. Flip a lamp from the remote: it turns
on in real life and in the 3D. Same home on your phone and in your Mac's menu bar.

This repo is built to be **vibe coded**: point your AI coding agent at it and let it walk you
through. It contains:

- a **playbook for AI agents** ([`AGENTS.md`](AGENTS.md) → [`playbook/`](playbook/)): an interview to
  fit *your* hardware, phases with explicit "done" checks, and the pitfalls that cost us hours
  ([`playbook/gotchas.md`](playbook/gotchas.md));
- a **working reference implementation** you adapt rather than rewrite.

## Quick start

```sh
git clone https://github.com/Rod292/3d-home-tv-os && cd 3d-home-tv-os
pnpm install                                   # Node >= 24, pnpm 10
pnpm --filter @appart3d/web build
HOME_BRIDGE_MOCK=1 pnpm --filter @appart3d/home-bridge start
open "http://localhost:8787/?view=3d&orbit=full"   # demo apartment with simulated lights
```

Then open your agent in the repo and say something like:

> Read AGENTS.md and help me build this for my home. My TV is a … , my lights are … .

Claude Code, Codex, Cursor, Copilot, Gemini CLI, Jules, Aider and Windsurf all pick up the
instructions (`AGENTS.md`, plus thin `CLAUDE.md` / `GEMINI.md` / `.cursor/rules` /
`.github/copilot-instructions.md` pointers).

## The path

| Phase | You get | Reference code |
|---|---|---|
| [0 · Start](playbook/00-start.md) | A plan for your TV, lights and machines | — |
| [1 · Scan](playbook/01-scan.md) | Your rooms, walls and furniture (iPhone LiDAR, or drawn) | `apps/ios`, `packages/roomplan-import` |
| [2 · 3D model](playbook/02-model.md) | A low-poly "dollhouse" of your home, editable in the browser | `apps/web`, `packages/catalog`, `packages/scene` |
| [3 · Bridge](playbook/03-bridge.md) | Hue, Home Assistant (Tuya, Zigbee, TVs…), HomePod → one live API | `apps/home-bridge`, `packages/home` |
| [4 · TV](playbook/04-tv-launcher.md) | The new home screen: 3D + lights panel + dock + screensaver | `apps/tv-launcher` |
| [5 · Phone & desktop](playbook/05-phone-and-desktop.md) | iPhone app + widgets, macOS menu-bar widget | `apps/ios-home`, `apps/macos` |
| [6 · Always on](playbook/06-always-on.md) | Runs 24/7 (Raspberry Pi or an awake Mac) | — |

[Verification](playbook/verification.md) · [Recovery (undo on the TV)](playbook/recovery.md) ·
[Privacy](playbook/privacy.md)

## What works with what

- **TV:** Google TV and Android TV (e.g. Philips, Sony, TCL, Hisense, Chromecast with Google TV).
  Apple TV, Samsung and LG home screens can't be replaced — add a Google TV dongle.
- **Lights:** Philips Hue directly; anything Home Assistant supports.
- **Scan:** iPhone/iPad Pro with LiDAR for the scanner app; otherwise draw the plan.
- **Always-on host:** macOS (launchd) or Linux (systemd, Raspberry Pi).

## Safety

Everything done on the TV is reversible ([recovery](playbook/recovery.md)), and agents are told to
ask before each TV step and before switching real devices. Your scan is the inside of your home: the
`.gitignore` keeps scans, your scene, tokens and device config out of git
([privacy](playbook/privacy.md)).

## Known limitations

- Tested end to end on **one** setup: a Philips Google TV, Philips Hue, Home Assistant (Tuya fan,
  Philips TV), a HomePod mini, a Mac as host. Other TV brands and hosts should work but are untested.
- The reference UIs are in **French** (Lumières, Tout éteindre…). Ask your agent to translate.
- Furniture is procedural: unusual pieces need a small builder (your agent can write it from a
  photo — see phase 2). The scanner needs an iPhone/iPad Pro with LiDAR and Xcode.
- The Raspberry Pi path is documented, not yet battle-tested.

## Status

A personal project shared as-is: it runs daily on one Philips Google TV with Hue + Home Assistant.
Expect to adapt things to your home — that's what the playbook is for. Issues and PRs welcome.

MIT licensed.
