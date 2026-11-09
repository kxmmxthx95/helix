# Verdant Archive — isolated forest visual study

Open **http://localhost:5555/forest-prototype.html** with the existing Helix Vite server.

This HTML entry does not import App, StudyMap, auth, data hooks or Supabase. It is intentionally not included in the production Rollup entry, not linked from any production menu, and never writes records. All three stages and lesson titles are explicitly samples. Open lesson opens a disclosure dialog, not a real lesson.

## Art provenance / licensing

- Investigated [Kenney Nature Kit](https://kenney.nl/assets/nature-kit), advertised by its publisher as **Creative Commons CC0**, with 330 models. It is a legally usable candidate for future asset work. **No Kenney files were downloaded or included**: its generic low-poly kit was not selected for this authored visual study.
- All geometry, foliage silhouettes, procedural ground painting, mote sprite, palette and composition used here are authored directly in `main.ts` for this prototype. No third-party model or texture assets; no remote asset requests; no extra asset attribution requirement. These are project source, not a claim of a separate third-party CC0 license.
- three.js and BufferGeometryUtils are existing project dependencies under the **MIT** license (see `node_modules/three/LICENSE`). No dependency additions.
- Supplied Twilight Forest / Last Valiant concept is a visual direction reference only. Its copyrighted pixels were **not used as a texture, traced, copied into the repo or shipped**.

## Interaction / constraints

- Fixed orthographic angle, no orbit, manual pan or zoom. Previous/next, arrow keys, and numbered markers translate the camera with exponential easing.
- Constant camera offset; scale only adapts at the viewport breakpoint, never to the chosen stage.
- Reduced-motion preference immediately places the camera at its target and stops light/mote motion, including preference changes during the session.
- No character, audio, combat or completion/progression state.
- DOM controls remain keyboard accessible; sample lesson disclosure uses native dialog.

## Verification

- `npx tsc -b --pretty false` passed.
- Existing suite: `npm test -- --reporter=dot`: **34 files / 145 tests passed**.
- Browser desktop 1440×960 and mobile emulation 390×844 rendered and inspected.
- Runtime error/rejection/console-error capture: **none after final fixes**.
- Verified next/previous boundaries, numbered selection, intermediate and settled camera positions, sample lesson dialog, reduced motion, and camera remaining unchanged after drag/wheel.
- Mobile actual innerWidth and scrollWidth both 390; sample selection panel 354px wide within the viewport.
- Current scene read-only QA accessor: `window.forestPrototype`.
- Static geometry batching: **33 draw calls**, approx **1.35 million triangles** in captured scene, including renderer accounting. Foliage is instanced; shared-material geometry is baked. This is not a device performance certification.

Proof directory (outside repo):
`/Users/kim/.hermes/profiles/gen-bae/cache/scratch/helix-forest-proof/`
- `desktop-stage-01.png`
- `desktop-temple-stage-03.png`
- `mobile-stage-01.png`
- `mobile-temple-stage-03.png`
- `browser-checks.json`

## Honest limitations

This is original procedural/stylized prototype art, **not reference-quality hand-painted production art**. Canopies still have a faceted look; ruins need bespoke sculpting/texturing for a final art pass. The single stretch repeats botanical forms. The portrait viewport crops parts of the temple and foreground naturally. Physical mobile GPU performance, context-loss recovery, and production integration are not certified. Requires WebGL; no non-WebGL fallback yet. A production rollout must wait for visual approval, asset/performance work, and a separate data integration review.

No commit, deploy, production-map replacement, menu change, or database write was performed.
