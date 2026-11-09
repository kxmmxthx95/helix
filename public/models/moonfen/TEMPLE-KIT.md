# Moonfen temple + river transition kit (version 4)

**41 individual GLBs: 30 preserved + 11 new modules.** This is an additive, detached art sample, not production map integration.

- Assembly: http://localhost:5555/temple-assembly.html
- Individual catalogue: http://localhost:5555/forest-assets.html#temple-floor-tile
- Bridge: http://localhost:5555/forest-assets.html#river-root-bridge
- Pedestal: http://localhost:5555/forest-assets.html#temple-cyan-pedestal

## Modules / actual file statistics

Each filename is `<id>.glb`. All are self-contained glTF 2.0, Y-up, metres, UVs + normals, embedded original PNGs and Principled PBR materials. Roots use the ground/grid origin; do not recenter the corner by its visible-mesh centroid.

| Asset ID | Triangles | GLB bytes |
|---|---:|---:|
| `temple-floor-tile` | 206 | 833,144 |
| `temple-plaza` | 2,064 | 975,416 |
| `temple-stairs` | 247 | 836,536 |
| `temple-parapet` | 361 | 844,732 |
| `temple-parapet-corner` | 801 | 878,108 |
| `temple-cyan-pedestal` | 625 | 1,081,936 |
| `temple-broken-wall` | 687 | 869,984 |
| `temple-rubble` | 617 | 865,356 |
| `river-root-bridge` | 6,038 | 899,632 |
| `river-grass-bank` | 200 | 758,044 |
| `river-stream` | 14 | 607,784 |

New modules total: **11,860 triangles / 9,450,672 bytes**. Full pack: **308,085 triangles / 37,758,088 bytes**. Six original 512×512 raster PNGs: `textures/kit-stone.png`, `kit-moss.png`, `kit-bark.png`, `kit-earth.png`, `kit-water.png`, `kit-cyan.png`. Cyan lens and rune strips have an actual exported emissive texture. Textures are authored mathematically from seeded fields, cracks, bark striations and water caustics; no image-reference pixels are read or copied.

## Modular contract (glTF coordinates)

Coordinates below are **X, Y-up, Z**, in metres. Rotation is around Y. Do not scale structural pieces when connecting them. Decorative moss can extend 0.015 m above stone and grass above banks; nominal deck height excludes this decoration. Bevels and mortar joints are intentional narrow recesses, not collision meshes.

- `temple-floor-tile`: 2 × 2 m footprint, origin at centre of bottom, structural top Y=0.40. Repeat on X/Z in 2 m increments. Four separate-looking inset paving slabs, hairline texture cracks and moss islands.
- `temple-plaza`: 4 × 4 m, structural top Y=1.00 relative to origin. Place on the floor at Y=0.40 for a deck at Y=1.40. Retaining ashlar courses and sixteen inset slabs.
- `temple-stairs`: width 2 m (X), run 2 m (Z), five 0.20 m risers / 0.40 m treads. Ascends toward **-Z**. Lowest tread is Y=0.20, highest Y=1.00. Set its origin at the same height as the plaza origin. For plaza at (0,.4,-3), place stairs at (0,.4,0): top meets plaza south edge Z=-1.
- `temple-parapet`: 2 m along X, maximum 0.50 m width, cap Y=.80. Place base on the plaza deck. End faces are X=±1. Rotate 90° for a Z-aligned straight run.
- `temple-parapet-corner`: **2 × 2 m grid cell** with L arms at local Z=-.75 and X=-.75; cap Y=.80. Origin is the cell's centre, not the L's centroid. Ends at X=+1, Z=-.75 and X=-.75, Z=+1. For a corner at (-1,1.4,-4), straight east at (1,1.4,-4.75); straight south at (-1.75,1.4,-2), rotated +π/2. These have matching end planes and cap heights.
- `temple-cyan-pedestal`: 1.10 × 1.10 m foot; Y=0 base, approx 1.28 m height. Independent ornament, not a walkable connector.
- `temple-broken-wall`: nominal 2 m footing; stepped missing courses and irregular stones extend slightly beyond it. Prop, not a seamless tiling wall.
- `temple-rubble`: independent fallen masonry cluster, base Y=0, approx 1.8 × 1.44 m. Not a collision surface.
- `river-root-bridge`: **span along X**, landing planes at X=±2, deck endpoints Y=.40, arch approx Y=.81. Width approx 2.11 m including edge roots. Ground-contact sleepers reach Y=0; curved logs overhang span planes by about 0.035 m to tuck into banks. Five swept bark logs, moss ribbons and two curved edge roots; no plants/river baked in.
- `river-grass-bank`: 2 m X × 4 m Z, land top Y=.40; repeat along Z in 4 m increments. Place at X=±3 beside an unrotated stream/bridge at origin. The centre lane is grass-free for access; surface moss is decorative.
- `river-stream`: 4 × 4 m, bed base Y=0, opaque water surface Y=.12. Repeat along Z in 4 m increments. Raster water edges tile; no alpha transparency, depth refraction, flow simulation or animation.

### Reproduce the showcase assembly

The authoritative placement list is in `src/prototypes/moonfen/temple-assembly.js`; the live `window.templeAssembly.instances` is serializable. All structural assets remain separate GLBs; this page does not export a combined terrain asset.

1. Place floor tiles at every X in [-5,-3,-1,1,3,5], Z in [-5,-3,-1], Y=0.
2. Plaza (0,.4,-3), stairs (0,.4,0). Place parapet corner and two straights as above; another Z-aligned straight at (1.75,1.4,-3).
3. Main pedestal (0,1.4,-3); two smaller-positioned but **unscaled** pedestals at (±1.7,.4,1). Broken walls/rubble sit on the .4 m ground.
4. River segments at X=-4,0,4, Y=0, Z=4, rotation +π/2. Banks at the same X, Z=1 and Z=7, also rotation +π/2. This rotates the entire river system so water flows along X.
5. Bridge at (0,0,4), rotation +π/2. Ends touch Z=2 and Z=6, both Y=.40, matching the banks. No scale changes.
6. Existing elder, shrub, heart-leaf, bud and rock GLBs provide optional decoration. They are independent clones; only decor is sometimes uniformly scaled. Remove the decoration loop for a structural-only view.

Assembly uses a receiving ground plane, directional shadow maps and actual GLTFLoader. Orthographic direction and scale are fixed. The three buttons only translate the camera target; they do not orbit, pan manually, or zoom. Catalogue framing differs per asset and is **not** a same-scale size chart.

## Rebuild / preserve

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/forest-assets/generate-temple.py
NODE_PATH=/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-validator/node_modules node scripts/forest-assets/validate.cjs
```

Run only the additive generator against the 30- or 41-entry pack. It AST-imports geometry functions without running baseline export side effects, overwrites only the eleven kit GLBs and six `kit-*.png` images, and merges by stable ID. Older generators reset historical manifest stages and must not be used to update this pack. The generator refuses an ambiguous non-kit count. Two consecutive final exports were byte-identical; the manifest retained exactly 41 unique IDs and the original 30 records.

## Actual verification / provenance

- Khronos validator **41/41; zero errors, zero warnings**. Also checks binary lengths, UV + normal accessors, embedded PNG links, base-colour PBR links, triangles, ID partition and preservation hashes.
- Existing **30 GLBs + 17 PNGs unchanged byte-for-byte**, independently compared to the before-generation snapshot. `temple-preservation.json` stores SHA-256 for each protected file. Previous prop-preservation checks also remain active.
- Real browser catalogue: **41/41 loaded**, all 41 selection buttons and corresponding exact GLB download targets checked, initial pedestal deep-link and daylight/moonlight toggles passed, no captured page errors.
- Real browser assembly: **17 distinct loaded GLBs / 51 independent placements**, all eleven new modules plus six reused props; no captured errors. All three camera targets and both light states exercised.
- Four connector contracts checked; downward raycasts against actual loaded meshes on both sides verify the plaza/stair, floor/bank and both bridge landings. Greatest measured height difference was about 0.00000003 m (floating-point tolerance). These are sampled surface checks, **not a navigation or physics certificate**.
- All pre-existing `src/` files, existing catalogue HTML, and old forest prototype HTML matched their before-task SHA-256 hashes. No production `/map`, database, dependencies, commit or deployment changes.
- Original generated geometry/textures are CC0-1.0 under the existing `LICENSE.txt`. Supplied temple and bridge images were inspected for category, palette and proportions only. No third-party mesh downloads, tracing or reference textures.

Proof directory: `/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-temple-proof/`

- `baseline.json`, `baseline-manifest.json`, `source-hashes.json`: before snapshots.
- `verification.json`, `new-hashes-first.json`: counts, old-file preservation and byte-identical repeat-export result.
- `catalogue-browser.json`, `catalogue-controls.json`, `assembly-browser.json`: actual browser checks and measured seams.
- `assembly-day.png`, `assembly-moonlight.png`, `<new-asset-id>.png` (eleven), `pedestal-moonlight.png`: actual WebGL screenshot evidence.
- `generation.log`, `idempotence.log`, `validator.log`: real tool logs. Pack-level validator report: `validation.json`.

## Limitations

These are stylized procedural/faceted art samples, not hand-painted sculpts or exact reference replicas. Stone/moss fields visibly repeat, masonry is regular, grass banks have deliberately straight modular edges, and the broken wall uses stepped missing courses rather than a detailed fracture simulation. Flat opaque water uses a static caustic texture. Cyan uses emissive material but no bloom, light spill or baked GI. No physics, collision mesh, navmesh, water animation, rig, normal/AO texture maps, LOD, mesh compression, KTX2, mobile performance certification or production integration. Self-contained GLBs duplicate PNGs and exceed the old 200 KB generic slot budget; further art approval and optimization are separate steps.
