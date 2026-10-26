# Student Portal — Island Home (Plan)

Grill decisions, 2026-10-24. Replaces the Maple plan (`student-portal-maple.md`, deleted).
Visual reference: casual mobile game home (Archero-like). **Style only** — no copied
game art, layout assets, fonts or icons. Every island and icon is AI-generated from the
prompts in `docs/game-art-spec.md`; code ships with CSS fallbacks.

Layout, top to bottom: top HUD, side icon rails, floating island in the centre, big yellow
BATTLE button, bottom tab bar.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Direction | Maple plan dropped: no Phaser, no walking character, no maps. EXP/level/rank/badges (`src/lib/exp.ts`, RPC `student_lifetime_exp`) kept |
| 2 | Island / BATTLE | Island = one subject this term. BATTLE opens the nearest-due pending assignment of that subject |
| 3 | Island art | 8 images by `learning_areas.code` (thai, math, science, social, health_pe, art, career, foreign_lang) + `other`. `/game/island-{code}.webp`; sub-area uses parent code; missing → `island-other`, then CSS fallback |
| 4 | HUD | Avatar, name, Lv + EXP bar. 3 currency slots: ⚡ pending assignments (opens `/assignments`), 🪙 behavior score x/100 (opens behavior panel), 💎 month attendance % (opens attendance panel) |
| 5 | Menu | Bottom tab bar: timetable · exams · island home (raised centre) · practice · profile. Left rail: bag (badges/rank) · calendar · documents. Right rail: leave · attendance · behavior. No separate assignments button (BATTLE + ⚡ cover it). Every feature 1 tap away |
| 6 | Palette | CSS purple-pink gradient (no background image). Navy translucent HUD/bars (~#2b2d5c at 85%). Yellow BATTLE #ffd23f. `bg-home` / `bg-desktop` webp removed. Pink brand kept as tone |
| 7 | Wide screens | Home locked to a portrait column. Route windows may widen to `max-w-3xl` |
| 8 | Extras | Green top bar = term progress %. HARD button = open exams of that subject (`/exams?subject=code`), hidden if none. Map icon = sheet grid of all islands |
| 9 | Links | BATTLE opens `SubmitSheet` over the home (no route change; return to island after submit). HARD routes to `/exams?subject=<code>` (exam taking needs the full page) |
| 10 | Order / states | All subjects from `useMySubjects`. Subjects with pending first, by nearest due, then by code. Progress bar "ส่งแล้ว x/y". No pending: BATTLE becomes green "เคลียร์แล้ว ✓" opening `/assignments`. No subjects: `island-other` + "ยังไม่มีวิชาในเทอมนี้", BATTLE hidden. Last island remembered in `sessionStorage` |
| 11 | Removed | `Character3D` / character mascot, cosmetics, lite mode, Phaser. three.js stays only for Login (Beams) |
| 12 | Art | User-generated from prompts in `docs/game-art-spec.md`; code ships with CSS fallbacks |

## Notes

- Motion respects `prefers-reduced-motion`: no island bob, no BATTLE pulse, no HUD
  count-up when set.
- Update `PRODUCT.md` and `DESIGN.md` brand line later if needed (pink stays as tone;
  the island replaces the old pastel home as the main visual).
