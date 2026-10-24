# Student game skin: art spec

Drop files in `public/game/` as `.webp` (transparent where noted). Missing file = CSS fallback in `src/components/game/parts.tsx` (`FRAMES`). Keep this table in sync with `FRAMES`.

**Tone:** frames `hud`, `panel`, `sign` are LIGHT (cream stone, gold trim, rose-pink accents); text on them turns plum automatically once the file loads. `button` and `title` keep their plum text colour.

Frames are 9-slice (`border-image`): corners stay fixed, edges and centre stretch. Draw at 2x for retina.

| File | Used for | Suggested size | Slice (px) | Rendered border (CSS px) | Notes |
|---|---|---|---|---|---|
| `frame-hud.webp` | Top status panel on home | 256x256 | 40 | 20 | Dark purple glass look; centre is filled |
| `frame-panel.webp` | Wrapper card of every inner page | 192x192 | 32 | 16 | Light parchment centre (text is dark on it) |
| `frame-sign.webp` | Side menu signs, name plate, back button | 128x128 | 24 | 12 | Small; must work at ~72x80 and ~36x36 |
| `frame-button.webp` | Main "ดูงาน" button | 192x192 | 32 | 16 | Gold; text is dark plum |
| `frame-title.webp` | Window title strip (gold/cream) | 128x64 | 24 | 8 | Plum text on it |

Icons and mascot (existing slots, same folder):
`nav-attendance nav-behavior nav-leave nav-calendar nav-practice nav-documents tab-assignments tab-exams tab-timetable tab-profile` (webp, square, ~96px), `character.webp` poster or `character.glb` for 3D. `nav-practice` and `nav-documents` are not drawn yet.

Changing a slice or border value means editing `FRAMES` in `parts.tsx`.

