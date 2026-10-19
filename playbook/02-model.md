# 02 — Make the 3D model theirs

Output: `apps/web/public/shared/my-home.json` (git-ignored), a scene that looks like their home and
has one 3D item for each device they want to see light up.

## Arrange in the web editor

`pnpm dev` → http://localhost:5173. The scene is saved in the browser as you edit.

- **Arrange** mode: click a piece, drag it, rotate, change its variant/color in the side panel; add
  pieces from the catalog. Fix what the scan got wrong (detected boxes become a sofa, a bed, a TV…).
- **Rooms** mode: rename rooms, floors and wall colors.
- *Fichier › Exporter la scène* downloads the JSON → save it as `apps/web/public/shared/my-home.json`.

Point the bridge at it in `~/.config/appart3d/home.json`: `"defaultScene": "/shared/my-home.json"`.
Files under `/shared/` are served live: editing the JSON shows up without rebuilding.

## Their own objects

Furniture is **procedural** (`packages/catalog/src/builders/*.ts`): each variant is a small function
assembling boxes, cylinders, lathes and tori that must fill its `dimensions` exactly
(`packages/catalog/test/catalog.test.ts` enforces it). To reproduce a specific piece (their floor
lamp, a donut wall lamp, a shelf):

1. Ask for a photo and its real dimensions (product page).
2. Add a builder next to similar ones, register a variant key in `builders/index.ts`
   (`{ key: "floorLamp/evedal", label, build, defaultDimensions }`).
3. Material roles: `glow` for the part that lights up, `screen` for TV/monitor panels, `glass` is
   only 32 % opaque — **a colored glass shade must not use `glass`** or only the inner bulb shows
   (gotcha G9).
4. Set the item's `variant` in the scene and look at it in the browser, then on the TV.

Wall-mounted pieces: `position[1]` is the height of the item's base; put it against the wall face
(wall center ± thickness/2 + depth/2), facing into the room (`rotationY`).

## The embedded view (what the TV, phone and widget show)

`/?view=3d` renders only the canvas, transparent, for native shells. Useful parameters:

| Param | Effect |
|---|---|
| `frame=all` / default living | Whole apartment / main room (the room with the TV) |
| `orbit=full` | Slow 360° turn (default: gentle sway) |
| `tilt=64` | Camera angle from vertical in degrees (lower view = more detail) |
| `lite=1` | No shadows (weak GPUs) |
| `maxDpr=1.5`, `aa=0` | Cap resolution / drop antialiasing |
| `daylight=auto\|day\|night` | Follows the sun from the bridge by default |
| `stats=1` | Logs fps, canvas size and draw calls to the console |

Devices switching on/off make the camera fly to their item; the TV item shows what the real TV shows.

## Performance

On a TV SoC the limit is **draw calls (CPU)**, not pixels: parts are merged per material
(`packages/catalog/src/merge.ts`). Measure with `?stats=1` on the target device before tuning
(gotcha G8). The reference reached ~57 fps on a 2022 Google TV at `maxDpr=1.5`.

**Done when** the person recognizes their home, and every device they care about has an item.
