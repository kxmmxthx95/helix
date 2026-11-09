# Twilight forest · layered diorama 03

Preview: <http://localhost:5555/tile-map-preview.html> · repository `/Users/kim/Desktop/Helix`.

This pass replaces the square 12×12 garden with an editable **6×26 long strip**. Entrance is lower-left, sanctuary upper-right. It changes only the standalone pixel preview and its verification/documentation. `/map`, database, application routes, GLB/3D, original sheets and original sprite manifests are untouched. No commit/deploy.

## Composition and editing

- `layout.mjs`: world dimensions, 128×48 projection, curved central trail, transverse stream, picking, elevation-aware sprite bounds, shared eight-tread temple geometry.
- `preview.js`: independently editable `[spriteId, i, j, scale]` placements, anchor overrides, two irregular mixed-canopy borders, understory/verge plants, occasional bare trees, entrance vine arch, real root bridge, second vine arch behind the crossing, and raised temple.
- **119 sprite instances**, drawn from **22 distinct original props**. All 54 prop images still load and remain available; this is not a claim that all 54 are placed.
- Architecture is editable modular Canvas geometry: lower plaza, raised terrace, eight steps, four column shafts (two supporting a ruined lintel), parapets, five cyan braziers. The mosaic uses the existing star tile.
- Terrain has one continuous sampled surface. Only the two exposed outer borders and waterfall receive cliff faces; there are no per-cell interior skirts. Architectural vertical faces are intentional raised stonework.
- Mixed sprite/architecture painter queue uses **world foot-contact Y**, not image top or elevation-shifted Y. Stairs draw back-to-front. The bridge's contact anchor is on the painted deck (`[104,30]`), not the transparent gap beneath its arch.
- Fit / true 1× / true 2×, drag/scroll pan, grid, decor toggle, test-material modes, and tile picking remain. “Decor off” also hides the modular temple; the terrain/waterfall remain. This is source-editable scene data, **not** a drag-and-drop scene editor.

## Exact source reuse

Unmodified prop PNGs in `public/tiles/twilight/props/`:

```
oak_large oak_medium oak_small
pine_large pine_medium pine_small
dead_large dead_medium
vine_arch_large root_bridge
rocks_large rocks_medium rocks_small
bush_large bush_flower_large bush_flower_small
plant_fern grass_medium
mushroom_red_medium mushroom_blue_small
crystal glow_plant
```

Surface reuse: the existing four `public/tiles/twilight/polished/{grass,dirt,water,stone}.png` textures, derived in the previous surface pass from `grass_plain.png`, `dirt_rocks_01.png`, `water_01.png`, `stone_floor_moss.png`. Existing `stone_star_large.png` is the plaza mosaic. All 22 normalized terrain images load, but only these surfaces/mosaic are used in the composed scene.

The provided `Fantasy Forest Pixel Art Asset Sheet.png`, `Twilight Forest Isometric Tile Set.png`, and target `Twilight Forest Pixel Art Diorama.png` in Downloads were visually inspected, not overwritten. The forest sheet supplies trees, roots, arches and ground decoration, but no temple columns/gateway. The terrain sheet shows stair/cliff/waterfall illustrations, but these are not separate modules in the current 22-image normalized manifest.

## New / derived work and provenance

**No new cropped reference image, external art, GLB, or raster sprite file was added.** The target is not fetched or displayed by the preview, and its logos/title/inset are absent from the scene.

- New modular stone ruins, stairs, cliff courses/vines, waterfall face and cyan flames are original procedural **approximations**, not extracted temple art. Stone faces reuse the existing sampled moss-stone texture with explicit shading.
- Cool forest variants are generated only in memory from the original oak/pine sprites. Eligible green pixels are remapped to a deeper teal palette; golden trunks are retained. Alternate placements use these variants. Every source PNG stays unchanged.
- Binary dirt/grass verges and water banks remain procedural masks around existing sampled textures.
- Original surface derivation script/manifest remains in `scripts/forest-assets/generate_polish_surfaces.py` and `public/tiles/twilight/polished/manifest.json`. Original preservation baseline: `art/pixel-tiles-polish/original-hashes.json`.

## Verified execution

```sh
node --test src/prototypes/pixel-tiles/layout.test.mjs
python3 scripts/forest-assets/test_polish_surfaces.py
```

Actual results: **Node 5/5**, **Python 2/2**. Checks include long-strip orientation, coordinate inversion, continuous walkable dirt/bridge/stone route, eight contiguous six-pixel stair rises, elevation-aware bounds, original hash preservation, all 54 prop dimensions/alpha/anchors, and four texture borders.

Browser:

```js
await (await import('/scripts/forest-assets/verify-preview.mjs')).verifyPreview()
```

**21/21 at desktop 1642×1000 and 21/21 at emulated mobile 390×844**. Includes all original/derived image loading, all prop contacts within island, sprite bounds, clear full canvas perimeter (including architecture), mixed depth ordering, real bridge alpha across both banks (19 samples), zero opaque non-crossing props on the walking-lane centre, 510 walkable route samples, four seam-free terrain test modes, grid/decor controls, true integer zoom, fit, picking, and captured runtime errors/rejections `[]`.

Actual CDP pointer-drag at mobile 1× moved scroll `(865,250)` → `(1005,360)` without tile selection; scale stayed 1; errors `[]`. Mobile is Chromium viewport emulation, not a physical-device test. Preview HTML and served JS returned HTTP 200. Production build/app tests were not run because application code is outside this pass.

### Evidence

All paths below are relative to `/Users/kim/Desktop/Helix/art/forest-diorama/`:

- `desktop-fit.png` — final desktop screenshot.
- `mobile-fit.png` — final mobile overview screenshot.
- `mobile-1x-pan.png` — actual-size mobile detail after pointer drag.
- `scene-native.png` — transparent 2096×1056 Canvas export, assembled from layers (not the target).
- `placements.json` — all 119 placed sprite records and rectangles.
- `desktop-tests.json`, `mobile-tests.json`, `pan-test.json` — actual recorded browser results.

Previous surface-pass evidence stays in `art/pixel-tiles-polish/`.

## Honest fidelity limits

This reproduces the target's scene direction, long-strip composition and major landmarks, **not its exact hand-painted artwork**. The source sprites have exposed trunks, bright foliage, soft alpha/uneven pixel density and painted ground patches unlike the target's tightly packed canopy. Cool variants improve palette cohesion but do not redraw crowns. Temple columns/lintel/stairs/flames and cliff/waterfall treatment are simpler procedural approximations; stone/water sampling visibly repeats, particularly on large plaza faces. The bridge is a scaled existing floral root sprite, not a newly drawn matching bridge. Fit necessarily makes this long strip small on a phone; use 1×/2× and drag. The scene is editable in source, not a production tile atlas or visual editor.

## Close GAME SCREEN preview (separate from diorama)

Open **<http://localhost:5555/pixel-game-screen.html>**. This is a working standalone screen, not `/map` integration. The listener on port 5555 was verified to run from `/Users/kim/Desktop/Helix`. No application, 3D, database, migration, commit or deployment changes were made in this pass.

### Source and behavior

- `pixel-game-screen.html`: full-viewport Canvas and Thai HUD, five numbered sample stops, previous/next, clear “จุดตัวอย่าง · ไม่ใช่บทเรียนจริง” disclosure, native fullscreen. No fake lesson, progress, avatar or DB records.
- `preview.js`: **shared renderer** for both pages. `drawScene()` uses the same source sprites, textures, placements, stone architecture and depth queue. Game-only extension adds real forest belts and continuous grass/trail/river beyond the old footprint; only outer island cliff/waterfall skirts are omitted. Architecture retains its raised faces. Diorama mode remains 119 placements with all its prior controls.
- Game mode has **1,680 sprite instances** including the original placements and surrounding belts. A low-understory apron prevents the new outer foreground crowns from swallowing the sanctuary.
- `game-screen.js`: fixed 128×48 oblique projection, camera translation only; entrance → grove → bridge → ruins → temple. Buttons, `1`–`5`, left/right, Home/End clamp at both ends. No pointer pan, orbit or camera zoom handlers. The small cream ground cross is a sample-position marker, not a player or lesson node.
- Source crop coordinates are rounded to integer pixels; Canvas smoothing is disabled and CSS uses nearest-neighbor `pixelated`. Automatic desktop scale is 1×; narrow viewports below 700 CSS px use 0.5× to fit the full sanctuary rather than enlarging blurry pixels. There is no user zoom control. `prefers-reduced-motion` bypasses the 520 ms camera translation.
- Original sprite/terrain assets are untouched. No reference-background image, new raster artwork or external assets are loaded. The reference remains visual guidance only.

### Reproducible checks and actual results

```sh
node --test src/prototypes/pixel-tiles/{layout,game}.test.mjs
python3 scripts/forest-assets/test_polish_surfaces.py
```

Results: **Node 7/7; Python 2/2**. On the game page:

```js
await (await import('/scripts/forest-assets/verify-game-screen.mjs')).verifyGameScreen()
```

**39/39 at desktop 1440×900 and 39/39 at emulated mobile 390×844.** Each of all five stops was checked after camera settle: every Canvas pixel is opaque, crop stays inside the extended terrain, and marker is outside HUD safe areas. Checks also cover complete elevated sanctuary bounds, HUD layout/non-overlap, depth ordering, source count, all navigation buttons/keys/boundaries, no pointer/wheel camera movement, and **zero opaque non-crossing sprite overlaps on walking-lane centre samples**. Runtime errors/rejections: `[]`.

The original diorama verifier was rerun: **21/21 at 1440×900 and 21/21 at 390×844**, preserving native 1×/2×, fit, grid, materials, decor, picking, bridge coverage and clear lane. Native CDP keyboard input `3` selected the settled bridge (index 2); reduced-motion selection settled immediately; trusted mouse clicks entered and exited native fullscreen with no errors. SHA-256 comparison of **83 source files** under `public/tiles/twilight/`: **0 changed**.

### Evidence files

All evidence is under `/Users/kim/Desktop/Helix/art/pixel-game-screen/`:

- `desktop-{entrance,grove,bridge,ruins,temple}.png`: actual 1440×900 browser screenshots, one per settled camera target.
- `mobile-{entrance,grove,bridge,ruins,temple}.png`: actual 390×844 Chromium-emulated screenshots, one per settled target.
- `desktop-tests.json`, `mobile-tests.json`: machine-readable 39-check game results.
- `diorama-desktop-regression.json`, `diorama-mobile-regression.json`, `diorama-preserved.png`: original mode regression proof.
- `native-keyboard.json`, `reduced-motion.json`, `fullscreen.json`: actual interaction results.
- `source-hashes-before.json`, `source-preservation.json`: exact source-file preservation baseline/results.

### Limits

This remains an art/camera prototype, not gameplay or a production learning map. The world is a finite pre-rendered 6000×3250 backing Canvas (plus a cached surface): startup work and memory have not been production-optimized. Tested layouts are the two explicit viewport sizes above; extremely small/short landscape windows and very large multi-monitor viewports have not been validated. Mobile testing is Chromium emulation, not a physical iOS/Android device. Native fullscreen was tested in this Chromium environment, not every browser. Source sprites retain their painted alpha/pixel-density differences; temple/stairs remain the prior original modular approximation, not the reference artwork. No production app build or whole-application suite was run because application integration remains outside scope.
