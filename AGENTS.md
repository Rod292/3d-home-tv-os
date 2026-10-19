# AGENTS.md — instructions for AI coding agents

You are helping a person turn their home into **3D Home TV OS**: their apartment, scanned and rebuilt
as a live 3D model, becomes the home screen of their TV (no ads), with their lights and devices
controllable from the remote, a phone and a desktop widget.

This file is the entry point for every agent (Claude Code, Codex, Cursor, Copilot, Gemini, Jules,
Aider, Windsurf…). Tool-specific files (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules/`,
`.github/copilot-instructions.md`) only point here.

## How to work

1. **Start with [`playbook/00-start.md`](playbook/00-start.md).** Interview the person (their TV,
   lights, phone, computer, comfort with the terminal), then write a short plan choosing a path
   through the phases. Do not assume their hardware is the author's.
2. **One phase at a time**, in order, each ending with its **verification** from
   [`playbook/verification.md`](playbook/verification.md). Show the evidence (command output,
   screenshot) before moving on. Never write "it works" without it.
3. **Read [`playbook/gotchas.md`](playbook/gotchas.md) before the phase it concerns.** Every entry
   there cost hours once; most look like something else at first.
4. **Reuse the reference implementation** in `apps/` and `packages/`; adapt it rather than
   rewriting. It is one working example, not the only design: change what does not fit their home.
5. Keep the person in the loop at every **physical or outward-facing action** (see Safety).

## Safety rules (non-negotiable)

- **Ask before any action on the TV** (installing an APK, `pm disable-user`, changing system or
  accessibility settings, simulated key presses that open apps). Explain what it does and how to undo
  it. Everything you do on the TV must be reversible; keep [`playbook/recovery.md`](playbook/recovery.md)
  at hand and tell the person how to undo each change.
- **Never disable the stock launcher on Google TV** to replace it — see gotcha G1. Use the
  accessibility-service approach of `apps/tv-launcher`.
- **Ask before switching real devices** (lights, fan, TV power) except when the person asked for it
  or is testing with you. Prefer the mock bridge (`HOME_BRIDGE_MOCK=1`) while building.
- **Privacy:** a scan is the inside of someone's home. Scenes, scans, photos, tokens, pairing codes,
  device IDs, IPs, Apple team IDs and the person's names never go into git or any public place. The
  `.gitignore` already excludes `scans/`, `*.appart3d.json`, `apps/web/public/shared/*` (except the
  demo), `.env`, `home.json`, `ha-token`, `*.xcodeproj`. Check `git status` before every commit. See
  [`playbook/privacy.md`](playbook/privacy.md).
- Secrets live in `~/.config/appart3d/` on the person's machine, never in the repo.

## Map of the repo

| Path | What it is | Phase |
|---|---|---|
| `apps/ios` | iPhone LiDAR scanner (RoomPlan) → `*.appart3d.json` | 1 |
| `packages/roomplan-import` | Scan → scene (rooms, walls, furniture) | 1–2 |
| `packages/scene`, `packages/catalog` | Scene model; procedural low-poly furniture (no asset files) | 2 |
| `apps/web` | 3D web app (React, three.js): editor, home view, embeddable `?view=3d` | 2 |
| `apps/home-bridge` | Node bridge: Hue, Home Assistant, HomePod, TV… → one HTTP/SSE API; serves the web app | 3 |
| `packages/home` | The bridge ↔ clients contract (types) | 3 |
| `apps/tv-launcher` | Android/Google TV home screen: 3D + lights panel + dock + screensaver | 4 |
| `apps/ios-home` | iPhone/iPad app + widgets ("Maison") | 5 |
| `apps/macos` | macOS menu-bar widget | 5 |

Internal code name: **appart3d** (package scope `@appart3d/*`, Bonjour `_appart3d._tcp`, Android
package `com.appart3d.tvlauncher`). Keep these names unless the person wants a rename; they are part
of the contract between the apps.

## Commands

```sh
pnpm install                    # Node >= 24, pnpm 10
pnpm -r typecheck && pnpm -r test
pnpm dev                        # web app on http://localhost:5173 (?home=mock for the mock home)
pnpm --filter @appart3d/web build
HOME_BRIDGE_MOCK=1 pnpm --filter @appart3d/home-bridge start   # bridge with simulated devices
pnpm --filter @appart3d/home-bridge pair                        # pairing code + QR for clients
```

Platform builds: `apps/tv-launcher/README.md` (Gradle, ADB), `apps/ios*/README.md` and
`apps/macos/README.md` (XcodeGen: `xcodegen generate`, then Xcode with the person's own team ID).

## Conventions

- Match the surrounding code. TypeScript strict; tests with vitest next to each package (`test/`).
- Run `pnpm -r typecheck && pnpm -r test` after changes to `packages/` or `apps/{web,home-bridge}`.
- UI strings in the reference apps are French; follow the person's language for anything new.
- Do not add dependencies lightly; most of the code has none beyond React/three.js.
