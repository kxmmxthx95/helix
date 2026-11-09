# Moonfen — original textured GLB sample pack

Open **http://localhost:5555/forest-assets.html** in the existing Helix dev server. This is a standalone HTML entry, not a production route or map replacement. No auth/data hooks or database calls. The hero uses an orthographic fixed game angle, directional light shadow maps, receiving ground, and a daylight/moonlight comparison. Thumbnails are actual GLB renders, not reference images. Each is framed independently (not a same-scale size chart).

## Temple + river transition extension (version 4 — current)

**41 standalone GLBs: previous 30 GLBs and 17 PNGs preserved byte-for-byte, plus 11 new modules.** Open **http://localhost:5555/temple-assembly.html** for the detached, fixed-camera temple/bridge assembly, or **http://localhost:5555/forest-assets.html#temple-floor-tile** for individual GLB downloads. Catalogue entries are discovered automatically from the manifest; existing catalogue/prototype code is unchanged.

New modules: `temple-floor-tile`, `temple-plaza`, `temple-stairs`, `temple-parapet`, `temple-parapet-corner`, `temple-cyan-pedestal`, `temple-broken-wall`, `temple-rubble`, `river-root-bridge`, `river-grass-bank`, `river-stream`. Six original PNG textures, embedded UVs/normals/PBR and actual cyan emissive material. **[TEMPLE-KIT.md](TEMPLE-KIT.md)** contains metre-scale connector contracts, exact assembly positions, per-asset triangles/bytes, rebuild commands, provenance and limitations.

Verified: **41/41 Khronos and real browser GLTFLoader loads, zero validator errors/warnings, zero captured browser errors**; all 41 selectors/download targets, deep-link, light toggles and three assembly camera positions exercised. Actual mesh raycasts confirm four connecting surfaces. Full pack: **308,085 triangles / 37,758,088 bytes**; new kit: **11,860 triangles / 9,450,672 bytes**. Repeated additive export is byte-identical and stays at 41 unique IDs. SHA-256 protection is in `temple-preservation.json`; evidence/screenshots are in `/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-temple-proof/`.

Static procedural samples: no physics/collision/navmesh, animated water, bloom/GI, normal/AO maps, LOD or mobile certification. No production map, DB, dependency, commit or deployment changes. Use `generate-temple.py` to rebuild only this extension; older generators reset historical manifest stages.

## Rock, bone and crystal extension (version 3 — historical verification)

**30 standalone GLBs: all previous 22 GLBs and 12 PNGs preserved byte-for-byte, plus eight distinct props.** `props-preservation.json` records protected SHA-256 hashes; the validator rechecks them. Existing `mossy-rocks.glb` and `teal-crystals.glb` are unchanged.

New IDs (filenames are exactly `<id>.glb`):
- `moss-standing-rock` — tall monolith and two foot stones.
- `moss-boulder-group` — four staggered medium boulders.
- `moss-low-patch` — three low, broad stones.
- `animal-skeleton-large` — elongated horned animal skull, carved eye hollows, seven vertebrae, six paired ribs, scattered jointed limbs and tail.
- `animal-ribs-medium` — four vertebrae, three paired ribs and two loose bones; no skull.
- `animal-skull-small` — lone hornless animal skull with elongated split muzzle.
- `teal-grove-large` — eight crystals with varied lean and spacing.
- `teal-cluster-small` — four differently arranged crystals.

Each has an irregular grass base, a deterministic distinct layout, and batched solid grass geometry. These are not uniform-scale aliases. The remains are whimsical, non-gory fantasy animal props, not anatomical reconstructions. Five newly authored 256×256 original raster PNGs (`props-grass`, `props-rock`, `props-moss`, `props-bone`, `props-teal`) are embedded with UVs, normals and PBR base-colour links. No reference pixels or downloaded geometry were used.

### Additive rebuild for these eight props only

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/forest-assets/generate-props.py
NODE_PATH=/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-validator/node_modules node scripts/forest-assets/validate.cjs
```

Use this generator on the existing 22- or 30-entry manifest. Do not run `generate.py` or `generate-ground.py` to update these props: the former resets the manifest, and the latter expects the earlier baseline. For an intentional complete rebuild, run baseline, ground, then props in order.

### Verified results

- Khronos: **30/30**, zero errors and zero warnings; exact 22+8 ID set, binary lengths, UV/normals, embedded PNG texture links, triangle totals and preservation hashes checked in code.
- Full pack: **296,225 triangles; 28,307,416 GLB bytes**.
- Real browser GLTFLoader: **30/30 loaded**, all 30 selection buttons and download links exercised; moonlight/daylight toggle exercised, zero captured page errors.
- New meshes remain modest: 871–3,910 triangles per prop, 3–4 material-grouped meshes. Grass is one batched mesh of 180 three-face blades per asset, not hundreds of scene objects.
- Proof directory: `/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-props-proof/`; eight `<id>.png` screenshots, `teal-grove-moonlight.png`, and `browser-report.json`.
- Deep-link example: http://localhost:5555/forest-assets.html#animal-skeleton-large
- Existing showcase code was not modified; its GLTFLoader, receiving floor, cast/receive flags and directional shadow maps display the additions automatically. No production map, database or prototype source edits, commits or deployments.

### Limitations

Faceted procedural samples, not exact reference replicas or hand-painted sculpts. Grass uses repeated triangular blades; moss is angular surface patches rather than dense fibers. Skull proportions and ribs are intentionally simplified. Crystals are opaque PBR (no transmission or internal refraction). Texture fields can repeat and stretch; no normal/AO maps, LOD, rigging, collision or mobile performance certification. Independent gallery framing is not a same-scale chart. Old high-poly vegetation is intentionally untouched. Blender emits a forward-looking `Material.use_nodes` deprecation warning and harmless single-mesh join notices; exports and validation complete successfully.

## Ground vegetation extension (version 2 — historical verification)

**22 standalone GLBs: all 11 original assets preserved byte-for-byte, plus 11 additional assets.** The gallery automatically reads the complete manifest. Deep links select an asset on page load:

- http://localhost:5555/forest-assets.html#pink-bud-rosette
- http://localhost:5555/forest-assets.html#thorn-root-arches
- http://localhost:5555/forest-assets.html#blue-heart-large

Additional IDs: `pink-bud-rosette`, `unopened-bud`, `golden-crozier-large`, `golden-crozier-small`, `spiky-rosette`, `dense-jade-shrub`, `low-jade-shrub`, `thorn-root-arches`, `thorn-root-hook`, `blue-heart-large`, `blue-heart-small`.

These are original thickened leaf meshes, closed petal lobes, swept curling shoots, individual shrub leaves/stems, and solid thorned moss roots. Compact crozier has one shoot/eight leaves versus two shoots/thirteen leaves; shrubs have different branch and leaf counts; blue clusters have five versus three individually arranged stems. None of these additions is merely a uniformly scaled copy of another asset. The original small elder remains an explicitly scaled variant.

Five additional original 512×512 PNGs: `ground-jade`, `ground-blue`, `ground-pink`, `ground-gold`, `ground-root`. All are embedded into each relevant GLB. Base-colour texture plus scalar roughness PBR; not separate normal/AO/roughness texture maps.

### Additive rebuild — preferred

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/forest-assets/generate-ground.py
NODE_PATH=/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-validator/node_modules node scripts/forest-assets/validate.cjs
```

This script imports only the reusable geometry function definitions from the original generator via Python AST, without executing its export or texture-writing code. It regenerates only extension GLBs/textures, preserves baseline manifest entries, checks baseline GLB hashes, and replaces extension entries idempotently. The original `generate.py` below is a **baseline-only full rebuild** and resets the manifest to the original eleven; run the additive generator afterward only if intentionally rebuilding the entire pack. Do not run the baseline generator merely to update new vegetation.

### Actual extension verification

- Khronos validator: **22/22 passed, zero errors, zero warnings**, including UVs, normals, embedded PNG and base-colour links.
- Programmatically computed full-pack totals: **284,540 triangles; 24,817,408 GLB bytes**.
- Browser GLTFLoader: **22/22 loaded**, all 22 selection buttons checked, download targets checked, daylight/moonlight switch exercised; no captured errors/rejections.
- SHA-256 comparison: all original 11 GLBs and seven PNGs unchanged.
- Screenshots and browser report: `/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-ground-proof/` (`blue-heart-large.png`, `thorn-root-arches.png`, `pink-bud-rosette.png`, `pink-bud-moonlight.png`, `browser-report.json`).

### Extension limitations

The reference guides categories and silhouettes only, not exact modeling or pixels. Leaves are smoother, shinier and more regular than the reference; shrub masses comprise repeated thick leaves instead of painted foliage clumps. Roots have geometric ridges and golden solid thorns rather than finely sculpted moss/bark. Heart-leaf outlines have actual paired lobes and a basal notch but their facing/tilt and arrangement differ from the reference. New assets are high-detail samples (dense shrub especially), not game-ready optimized meshes; no LOD, rig, collision or independent normal/AO maps. No production map/database integration, commit or deployment is included.

## Original delivered coverage (version 1, preserved)

11 standalone GLB files: large and small layered elder, bare gnarled tree, tiered pine, leafy bush, flowering rosette, mossy rock cluster, teal crystal cluster, living vine arch, ruined column, ruined gateway. `manifest.json` is the authoritative machine-readable list; `validation.json` records Khronos validator results and mesh/texture/triangle counts.

- glTF 2 binary; Y-up; metres; base-centred pivot; all geometry triangulated.
- UVs, normals, PBR materials, and embedded original 512×512 PNG base-colour textures. Separate reusable PNGs are in `textures/` (bark, leaf, pine, stone, moss, crystal, petal).
- Material-grouped meshes; 1–3 meshes and embedded textures per asset.
- No Draco, Meshopt, KTX2, external textures, transmission extension, or special shader dependency. Three.js GLTFLoader loads directly.
- Texture fields combine original raster brush-shaped leaf marks, bark striations, stone mottling/cracks, moss speckling and crystal streaks. These are genuine image textures, not flat vertex colours or runtime-only procedural shader nodes.

## Rebuild

From repository root, using the already installed Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/forest-assets/generate.py
```

Source is `scripts/forest-assets/generate.py`, deterministic random seeds, no network and no reference-image reads. Uses Blender's built-in bpy, mathutils and NumPy. The showcase source is `src/prototypes/moonfen/showcase.js`; HTML entry is `forest-assets.html`. Blender 5.2.2 was used. Generic Python editors cannot resolve Blender's `bpy`/`mathutils`; run under Blender, not system Python.

Validation uses the small official `gltf-validator` npm package, installed **outside this repository**, with no package manifest/lock changes:

```sh
NODE_PATH=/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-validator/node_modules node scripts/forest-assets/validate.cjs
```

The validator script also checks GLB header/length, embedded PNGs, UV and normal accessors, base-colour texture links, manifest bytes and triangle counts. An ephemeral installation can be recreated with `npm install --prefix <scratch-directory> --no-audit --no-fund gltf-validator`, then point NODE_PATH at its node_modules.

## Verification

- 11/11 GLBs passed Khronos glTF validator: **zero errors, zero warnings**.
- 79,774 triangles across the pack; 11,691,552 bytes of GLBs (self-contained files duplicate shared textures deliberately).
- Browser loaded 11/11 via GLTFLoader, verified actual mesh UVs and texture maps, zero captured runtime errors/rejections.
- `npx tsc -b --pretty false` passed.
- Desktop screenshot proof: `/Users/kim/.hermes/profiles/gen-bae/cache/scratch/moonfen-proof/`.
- No existing production files were modified by this asset task. Existing `/map`, DB and earlier forest prototype work remain separate.

## Provenance / license

All new geometry and raster textures in this directory are original generated work for this task, dedicated under **CC0-1.0**, to the extent rights exist. See LICENSE.txt. This dedication applies only to this new asset pack and generator, not Helix, third-party software, or the supplied reference.

The supplied RuneWaker concept sheet was viewed for category/silhouette direction only. No pixels were copied, traced, packed or used as textures. No third-party models were downloaded. Blender and three.js remain under their respective upstream licenses; three.js is an existing project dependency.

## Honest limitations

This is a first coherent **procedurally authored art sample**, not hand-painted artist-quality production art or an exact reference match. Rounded layered canopies are deliberately stylized but retain repeated/scalloped forms. The small elder is a scaled variant, not a separate sculpt. Bark/stone patterns can show UV repetition, seam/stretch artifacts, and do not include separately authored normal/roughness/AO maps. Curves use finite segments; rocks are faceted. Static assets have no rig, collision, LOD, animation or mobile performance certification. GLBs exceed the old generic model-slot 200KB target and live in a separate subdirectory, so cannot silently replace production stand-ins. Bridge/stream terrain was absent from the original baseline; version 4 now adds separate temple, bridge, bank and stream modules (see TEMPLE-KIT.md). The full reference sheet is not replicated. A bespoke art/optimization pass and user approval are required before production integration.
