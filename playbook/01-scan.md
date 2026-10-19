# 01 — Scan the home

Output of this phase: a scan file (`*.appart3d.json`, RoomPlan envelope) or a scene JSON drawn by
hand, stored **outside git** (`scans/` is ignored).

## Path A — iPhone/iPad with LiDAR (recommended)

`apps/ios` is a SwiftUI app around Apple's **RoomPlan**: room by room capture, merged into one
structure, exported as `name.appart3d.json`.

1. Install XcodeGen (`brew install xcodegen`), then in `apps/ios`: `xcodegen generate`.
2. Open `Appart3DScan.xcodeproj`, set **their** team in Signing (or `DEVELOPMENT_TEAM` in
   `project.yml`) and a unique bundle id (`com.<them>.appart3d.scan`), run on the device.
3. Scanning tips to pass on: daylight, doors open, walk slowly along walls, one room per capture,
   close each room's loop; big furniture is detected (sofa, bed, table, storage, TV…), small objects
   are not.
4. Export with the share sheet (AirDrop to the Mac) into `scans/`.

## Path B — No LiDAR

- **Polycam / 3D Scanner App / Canvas**: if they can export RoomPlan-like JSON, try
  `packages/roomplan-import` (see `FORMAT.md`); otherwise use their floor plan as a reference.
- **Draw it**: write a scene JSON directly (rooms = floor polygons in meters, walls = segments,
  openings, items). Start from `apps/web/public/shared/demo-apartment.json`; a rectangle per room and
  measured wall lengths are enough. The web editor fixes the rest visually.

## Path C — Try without their home first

The demo apartment (`apps/web/public/shared/demo-apartment.json`) works end to end with the mock
bridge. Good for validating the TV part before scanning.

## Import

```sh
pnpm --filter @appart3d/roomplan-import import-scan ../../scans/home.appart3d.json ../../apps/web/public/shared/my-home.json
```

(paths relative to `packages/roomplan-import`). It prints rooms, walls and detected furniture with
their confidence. Or drop the scan file into the web editor (`pnpm dev` → *Fichier › Importer un scan…*, or drag the file onto the page).

**Done when** the scene loads in the web editor with every room, the walls closed and the main
furniture present (see `verification.md`, phase 1).
