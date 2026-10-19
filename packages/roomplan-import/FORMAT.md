# RoomPlan Codable JSON — what the importer expects

Notes from research done on 2026-10-09. Confidence: **[sure]** = Apple docs or several real exports agree,
**[likely]** = one real export or strong inference, **[guess]** = not verified, handled leniently.

## Sources
- Apple docs (JSON API behind the doc pages):
  - CapturedRoom: https://developer.apple.com/documentation/roomplan/capturedroom
  - CapturedRoom.Surface: https://developer.apple.com/documentation/roomplan/capturedroom/surface
  - CapturedRoom.Object: https://developer.apple.com/documentation/roomplan/capturedroom/object
  - CapturedRoom.Section / Section.Label: https://developer.apple.com/documentation/roomplan/capturedroom/section
  - CapturedRoom.Confidence: https://developer.apple.com/documentation/roomplan/capturedroom/confidence
  - CapturedStructure (iOS 17): https://developer.apple.com/documentation/roomplan/capturedstructure
  - Raw JSON used: `https://developer.apple.com/tutorials/data/documentation/roomplan/<path>.json`
- Real exports on GitHub:
  - `sow-coding/shopyseek-web` `public/objects.json` (pretty-printed JSONEncoder output, float32 artefacts like `1.1920929e-07`, `0.99999994`)
  - `Goozer8/Lidar` `scans/woonkamer.json` (real scan, iOS 17 fields incl. `attributes`, `sections`)
- Apple forum on simd_float4x4 layout: https://developer.apple.com/forums/thread/748093

## Top level
`CapturedRoom` keys: `identifier` (UUID string), `story` (Int, iOS 17), `version` (Int, 2 seen on iOS 17),
`walls`, `doors`, `windows`, `openings`, `floors` (iOS 17) : `[Surface]`, `objects: [Object]`,
`sections: [Section]` (iOS 17), plus `referenceOriginTransform` (16 floats; not in the public property list
but present in real exports — ignored). **[sure]**

`CapturedStructure` (iOS 17) keys: `identifier`, `rooms: [CapturedRoom]`, `walls`, `doors`, `windows`,
`openings`, `floors`, `objects`, `sections`, `version`. **[sure for the property list; [likely] that shared
walls appear once in `walls`]**

## Element encodings
| Field | Encoding | Confidence |
|---|---|---|
| `transform` (simd_float4x4) | flat array of **16 numbers, column-major**: `[c0.x,c0.y,c0.z,0, c1…, c2…, tx,ty,tz,1]`. Translation at indices 12–14. | **[sure]** — every real export, bottom row (3,7,11) is 0 |
| `dimensions` (simd_float3) | `[x, y, z]`. Walls/doors/windows: `[width, height, 0]`. Objects: `[width, height, depth]` in local axes. Floors: `[extentX, extentY, 0]` in the floor's local plane. | **[sure]** |
| `category` (Surface) | Swift synthesized enum Codable: `{"wall":{}}`, `{"door":{"isOpen":false}}`, `{"window":{}}`, `{"opening":{}}`, `{"floor":{}}` | **[sure]** |
| `category` (Object) | `{"sofa":{}}` … 16 cases: bathtub, bed, chair, dishwasher, fireplace, oven, refrigerator, sink, sofa, stairs, storage, stove, table, television, toilet, washerDryer | **[sure]** |
| `confidence` | `{"high":{}}` / `{"medium":{}}` / `{"low":{}}` | **[sure]** |
| `identifier`, `parentIdentifier` | UUID strings; `parentIdentifier` is `null` (seen as explicit `null`; may also be omitted) | **[sure]** |
| `polygonCorners` (iOS 17) | `[[x,y,z], …]` in the surface's **local** frame; empty for plain rectangles. Floors: corners lie in local XY (z≈0) and the floor transform maps local Z → world +Y. | **[sure]** (verified with real floor: transformed corners lie on the walls) |
| `completedEdges` | array (always `[]` in the exports seen; Edge = top/bottom/left/right). Ignored. | [guess] for non-empty form |
| `curve` (iOS 17) | `null` for straight walls; otherwise an object (center/radius/startAngle/endAngle). Non-null → wall approximated by its chord + warning. | [likely] |
| `story` | Int, 0 for the ground storey. | **[sure]** |
| `sections[]` | `{"label":"livingRoom","center":[x,y,z],"story":0}` — `Section.Label` is a String **RawRepresentable** enum, hence a plain string. Cases: livingRoom, bedroom, bathroom, kitchen, diningRoom, unidentified. | **[sure]** |
| `attributes` (Object, iOS 17) | `{"SofaType":"lShaped"}`, `{"TableType":"coffee"}`, `{"StorageType":"cabinet"}`, `{"ChairType":"dining", …}` | [likely] |

iOS 16 vs 17: iOS 16 has no `floors`, `sections`, `story`, `polygonCorners`, `curve`, `attributes` and no
`CapturedStructure`. The importer treats every one of those as optional.

## Geometry conventions
- Meters, right-handed, Y up, same as three.js, so no axis flip is needed. World origin = where the AR session
  started; the floor is typically around y ≈ -1.3 (phone height). **[sure]**
- Surface/object `transform` = **center** of the box/rectangle (checked: sofa center y − h/2 = floor y). **[sure]**
- Walls: local +X along the wall, +Y up, +Z = normal. In real exports the normal points **into** the room. **[likely]**
- **Object front = local +Z** **[likely]**: in two real scans, TVs, cabinets, sofas and fireplaces standing against
  walls have local +Z pointing to the room center (dot product 0.6–1.0). Our scene contract also faces +Z at
  rotationY = 0, so `rotationY = atan2(col2.x, col2.z)`. Change `ROOMPLAN_FRONT_AXIS` in `src/objects.ts`
  to `"-z"` if a real scan shows furniture backwards.

## Importer tolerance (beyond the real format)
- Matrices: flat column-major (canonical), flat row-major (auto-detected: translation in 3/7/11 and 12–14 zero),
  nested `[[c0],[c1],[c2],[c3]]`, `{ "columns": [...] }`.
- Enums: object-with-single-key or plain string (`"sofa"`, `"high"`).
- Vectors: `[x,y,z]` (extra components ignored) or `{x,y,z}`.
- Unknown fields ignored; unreadable elements skipped with a warning; bare `CapturedRoom` / `CapturedStructure`
  JSON (no envelope) and JSON strings are accepted.
