# Student game skin: art spec

Drop files in `public/game/` as `.webp` (transparent where noted). Missing file = CSS fallback in `src/components/game/parts.tsx` (`FRAMES`). Keep this table in sync with `FRAMES`. Images are user-generated from the prompts below; code ships with CSS fallbacks, so the portal works with no art at all.

**Tone:** purple-pink CSS gradient, navy translucent HUD and bars, yellow BATTLE button. Only the route window frame (`panel`) takes painted art; everything else is CSS.

Frames are 9-slice (`border-image`): corners stay fixed, edges and centre stretch. Draw at 2x for retina.

| File | Used for | Suggested size | Slice (px) | Rendered border (CSS px) | Notes |
|---|---|---|---|---|---|
| `frame-panel.webp` | Wrapper card of every inner page | 192x192 | 32 | 16 | Light parchment centre (text is dark on it) |

Icons (existing slots, same folder, reused by the island home):
`nav-attendance nav-behavior nav-leave nav-calendar nav-practice nav-documents tab-assignments tab-exams tab-timetable tab-profile` (webp, square, ~96px). `nav-practice` and `nav-documents` are not drawn yet.

Changing a slice or border value means editing `FRAMES` in `parts.tsx`.

## Islands

One image per subject, shown as the floating island on home.

- Size: 768x768 PNG, exported as transparent `.webp`.
- Island centred, about 10% padding on every side.
- File names: `/game/island-{code}.webp` where `{code}` is `learning_areas.code`. A sub-area uses its parent's code.
- Fallback chain: missing `island-{code}` → `island-other` → CSS fallback.

Shared style prefix (paste before each theme line):

> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters.

Per file (full prompt = prefix + theme):

**island-thai**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: ancient Thai library pavilion with palm-leaf manuscripts.

**island-math**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: geometric crystal formations and floating abstract shapes (no numbers).

**island-science**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: small volcano and glass lab domes.

**island-social**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: temple ruins and a globe statue.

**island-health_pe**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: mini sports field and running track.

**island-art**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: rainbow paint splashes and giant brushes.

**island-career**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: gears workshop and garden plots.

**island-foreign_lang**
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: clock tower and signposts.

**island-other** (also the fallback)
> Stylized 3D render of a small floating island, casual mobile game art, soft bright lighting, saturated colors, chunky shapes, turquoise water base wrapping the island, isometric 3/4 view, transparent background, no text, no characters. Theme: plain grassy island with a single tree.

## Island colour theme

Each learning area has its own island and water palette so subjects read apart at a glance. Add this line to the end of any island prompt:

> Colour theme: the grass and foliage are [LAND], the water (including the translucent underwater base) is [WATER]. Keep the overall style, lighting and composition identical.

| Island | LAND | WATER |
|---|---|---|
| thai | warm golden-green grass, terracotta and gold accents | warm turquoise-teal |
| math | cool mint grass, violet and lilac crystals | violet-blue |
| science | lime-green grass, orange and red volcanic rock | emerald green |
| social | olive-green grass, sandstone and ochre ruins | deep sapphire blue |
| health_pe | fresh bright green grass, white and red track markings | bright aqua cyan |
| art | pastel pink and yellow grass, rainbow splashes | magenta-pink to purple gradient |
| career | autumn yellow-green grass, copper and steel gears | amber-orange |
| foreign_lang | soft blue-green grass, cream stone | sky blue with a hint of lavender |
| other | classic green grass, grey-brown rocks | classic turquoise |

Generic island (`island-other`): "small floating island, grassy top, two palm trees, mossy rocks, small sandy beach and wooden dock" + the colour line above.

## HUD icons

Square 96x96, transparent background, exported as `.webp`. Used by the top HUD currency slots and the map and BATTLE buttons.

Shared style prefix (paste before each object line):

> glossy 3D game UI icon, single centered object, soft highlights, saturated colors, transparent background, no text, no border, square crop.

Per file (full prompt = prefix + object):

**hud-energy** (⚡ pending assignments)
> glossy 3D game UI icon, single centered object, soft highlights, saturated colors, transparent background, no text, no border, square crop. Object: yellow lightning bolt.

**hud-coin** (🪙 behavior score)
> glossy 3D game UI icon, single centered object, soft highlights, saturated colors, transparent background, no text, no border, square crop. Object: gold coin with a ribbon.

**hud-gem** (💎 attendance)
> glossy 3D game UI icon, single centered object, soft highlights, saturated colors, transparent background, no text, no border, square crop. Object: purple gem.

**hud-map** (sheet grid of all islands)
> glossy 3D game UI icon, single centered object, soft highlights, saturated colors, transparent background, no text, no border, square crop. Object: small globe with a folded map.

**btn-hard** (open exams of the subject)
> glossy 3D game UI icon, single centered object, soft highlights, saturated colors, transparent background, no text, no border, square crop. Object: red flame demon badge.
