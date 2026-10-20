# Verification — what "done" means, phase by phase

Agents: show the evidence for each line (command output, screenshot path) before saying a phase is
done. When something can only be checked by the person (pressing the remote, listening, looking at
the real lamp), say so explicitly and ask them.

## Repo health (any phase)
- [ ] `pnpm -r typecheck && pnpm -r test` green.
- [ ] `git status` shows no scan, scene, photo, token or config file (see `privacy.md`).

## 1 — Scan
- [ ] Every room present, named; walls closed; doors/windows where they are.
- [ ] Main furniture detected or added (sofa, bed, table, TV, storage).

## 2 — 3D model
- [ ] `my-home.json` loads at `http://localhost:8787/?view=3d` (bridge) — screenshot.
- [ ] Each device to show has an item; its id is in `links`.
- [ ] On the target TV: `?stats=1` ≥ 45 fps.

## 3 — Bridge
- [ ] `curl localhost:8787/api/home` lists the real devices, names, rooms, `itemId`.
- [ ] `POST …/action {"type":"toggle"}` switches a real light **and** the 3D within ~1 s (SSE).
- [ ] State matches reality for tricky devices (fans — gotcha G6).
- [ ] Survives a restart (launchd/systemd) and a Wi-Fi drop.

## 4 — TV
- [ ] Launcher installed; `--es bridge … --es pairCode …` paired (bridge log: `appairé : TV …`).
- [ ] 3D visible, sharp, smooth (screenshot + `stats`).
- [ ] Lights panel: OK toggles, ← / → dims, scenes run (with the person's agreement).
- [ ] Home from inside an app returns to the launcher — **with the physical remote**.
- [ ] Accessibility service still enabled after reinstalling the APK (G2).
- [ ] Screensaver shows the 3D (G10); inactivity delay restored to its original value.
- [ ] Selecting a lamp in the panel outlines it in the 3D, seen without a wall in front.
- [ ] Crash tests: `--ez crash3d true` → the 3D comes back, same PID; `--ez crashApp true` ×3 → Home
      opens the stock home, then ours again after 2 minutes (gotchas G15, G16).
- [ ] The person knows how to undo (`recovery.md`).

## 5 — Phone / desktop
- [ ] Pairing by Bonjour or QR; a change on one screen shows on the others.

## Before publishing anything (fork, video, screenshots)
- [ ] No address, name, IP, token or pair code visible; the home layout is OK to show.
