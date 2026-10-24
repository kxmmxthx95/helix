# Student Portal — MapleStory-style World (Plan)

Grill decisions, 2026-10-24. Replaces the current pink portrait `GameHome`.
Visual reference is MapleStory **style only** — no Nexon sprites, maps, UI art
or fonts. Every asset is AI-generated (scenes, NPCs, icons) or from a CC0 /
open-license pack (character sprites).

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Scope | Full world: 5 maps, level/EXP, rank, badges, inventory, cosmetics |
| 2 | Art | AI-generated scenes + NPCs; CC0 sprite pack for animated characters |
| 3 | Palette | Hub stays pastel pink (brand); each other map has its own tone; one shared Maple-style UI chrome |
| 4 | Maps | 5 maps (table below) |
| 5 | Engine | Phaser 3, lazy `import()` only on the student route. React owns HUD, windows, forms; Phaser emits events to React |
| 6 | EXP | Derived from existing data, computed client-side. No XP table |
| 7 | Period | Hybrid: term level on HUD, lifetime rank on profile (read-only Postgres view/RPC, own rows only) |
| 8 | Inventory | Derived badges + cosmetics |
| 9 | Cosmetics | 4–6 whole-character skins (unlock by level) + layered accessories anchored to head/back (unlock by badge). No paper-doll |
| 10 | Controls | Tap-to-move (+ arrows/space on desktop) and HUD quick menu: every feature 1 tap away |
| 11 | Windows | `GameShell` is the layout route; world stays mounted; routes render in `<Outlet />` as Maple-style windows over it. URLs and LINE deep links unchanged. Phaser pauses while a window is open |
| 12 | Perf / offline | Per-map art runtime-cached on first visit. DOM lite mode (no canvas) when no WebGL, low RAM, or student toggle. Old `GameHome` deleted |
| 13 | Rollout | Phases P0–P4, each shippable to production |

## Maps

| Map | Tone | NPCs / doors | Opens |
|---|---|---|---|
| Hub (เมืองหลัก) | Pink, sakura | Homeroom teacher, notice board, doors to other maps | Calendar, leave, attendance, behavior |
| Magic Library (ห้องสมุดเวทมนตร์) | Purple, enchanted forest | Librarian, bookshelves | Practice, documents |
| Quest Field (ลานภารกิจ) | Green meadow | Quest giver | Assignments (as quest log) |
| Arena (สนามประลอง) | Red / gold | Referee | Exams |
| Clock Tower (หอนาฬิกา) | Sky blue | Time keeper | Timetable |

Profile and inventory open from the HUD on every map.

## EXP, level, rank (defaults — constants live in one file, tune freely)

- Term EXP: on-time submission 50 · late submission 20 · present 10 · late
  arrival 5 · behavior score remaining × 1 · exam score % × 1.
- Level curve: cumulative EXP for level n = `100 * n * (n + 1) / 2`.
- Lifetime rank (sum over all terms, from the read-only view/RPC):
  Bronze → Silver → Gold → Platinum → Diamond.
- Badges (derived): first submission, 10 / 50 submissions, perfect attendance
  month, full behavior score, every exam submitted in a term, level 5 / 10 /
  20 reached.

## Data writes

Only one: equipped cosmetics. RPC `equip_cosmetic(item_id)` re-checks the
unlock server-side, then writes `students.equipped jsonb`. Students get no
direct update on `students`; otherwise any client could equip locked items.

## Phases

| Phase | Content | Student sees |
|---|---|---|
| P0 | Maple-style HUD, quick menu, overlay windows, DOM lite mode; delete old `GameHome` | New portal, no world yet, every feature reachable |
| P1 | EXP / level / rank / badges (derived + view/RPC), read-only inventory | Level + badges on HUD |
| P2 | Phaser engine, Hub map, tap-to-move, NPCs, 1 character skin | World goes live |
| P3 | Remaining 4 maps, one at a time | Maps open progressively |
| P4 | Skins, accessories, `equip_cosmetic` RPC + `equipped` column | Dress-up |

## Notes

- `src/lib/pathfind.ts` is a top-down grid A*; not used for the platformer.
  Phaser arcade physics + platform waypoints instead.
- `Character3D` is dropped from the world once P2 ships (2D sprites).
- Update `PRODUCT.md` and `DESIGN.md` brand lines when P2 lands (pink becomes
  the Hub, not the whole portal).
- Ponytail stays on for logic (EXP, RPC, routing); off for visual work (art,
  motion, maps).
