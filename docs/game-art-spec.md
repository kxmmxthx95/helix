# Student game skin: art spec

Drop files in `public/game/` as `.webp` (transparent where noted). Missing file = CSS fallback in `src/components/game/parts.tsx` (`FRAMES`). Keep this table in sync with `FRAMES`.

**Tone:** frames `hud`, `panel`, `sign` are LIGHT (cream stone, gold trim, rose-pink accents); text on them turns plum automatically once the file loads. `button`, `tab`, `bar` keep their text colour (button plum, tab/bar white), so make `bar` and `tab` darker rose-pink.

Frames are 9-slice (`border-image`): corners stay fixed, edges and centre stretch. Draw at 2x for retina.

| File | Used for | Suggested size | Slice (px) | Rendered border (CSS px) | Notes |
|---|---|---|---|---|---|
| `frame-hud.webp` | Top status panel on home | 256x256 | 40 | 20 | Dark purple glass look; centre is filled |
| `frame-panel.webp` | Wrapper card of every inner page | 192x192 | 32 | 16 | Light parchment centre (text is dark on it) |
| `frame-sign.webp` | Side menu signs, name plate, back button | 128x128 | 24 | 12 | Small; must work at ~72x80 and ~36x36 |
| `frame-button.webp` | Main "ดูงาน" button | 192x192 | 32 | 16 | Gold; text is dark plum |
| `frame-tab.webp` | Active bottom tab highlight | 128x128 | 24 | 10 | Pink glow |
| `frame-bar.webp` | Bottom nav bar background | 64x128 | n/a | n/a | Tiles horizontally (repeat-x), height scaled to bar |

Icons and mascot (existing slots, same folder):
`nav-attendance nav-behavior nav-leave nav-calendar nav-practice nav-documents tab-assignments tab-exams tab-timetable tab-home tab-profile` (webp, square, ~96px), `character.webp` poster or `character.glb` for 3D. `nav-practice` and `nav-documents` are not drawn yet.

Changing a slice or border value means editing `FRAMES` in `parts.tsx`.

## Mode card scenes (no text)

`card-assignments`, `card-exams`, `card-timetable` (.webp): painted scene for the home mode cards, no text and no icon (code overlays the icon, the Thai label and the pending badge). Keep the bottom-centre third calm for the label. Sizes at 2x: `card-assignments` 640x500, `card-exams` 640x1020 (tall), `card-timetable` 640x400. Edges are cropped by `object-fit: cover`, so keep key details in the middle 80%.
