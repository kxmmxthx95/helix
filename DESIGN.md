---
name: Helix
description: School operations back-office — Vercel (Geist) precision with Apple iOS patterns, light and dark equally; a separate pastel game skin for students.
colors:
  shell: { light: "#f2f2f7", dark: "#000000" }
  background: { light: "#ffffff", dark: "#0a0a0a" }
  card: { light: "#ffffff", dark: "#1c1c1e" }
  raised: { light: "#ffffff", dark: "#2c2c2e" }
  foreground: { light: "#0a0a0a", dark: "#ededed" }
  muted-foreground: { light: "#66666b", dark: "#aeaeb2" }
  secondary: { light: "#ededf0", dark: "#2c2c2e" }
  muted: { light: "#f4f4f6", dark: "#232325" }
  fill-strong: { light: "#e3e3e8", dark: "#3a3a3c" }
  border: { light: "#e5e5ea", dark: "#38383a" }
  input: { light: "#8e8e93", dark: "#757579" }
  primary: { light: "#0a0a0a", dark: "#ededed" }
  accent: { light: "#0066cc", dark: "#0071e3 (fill) / #3d9bff (text)" }
  accent-soft: { light: "#e6f0fa", dark: "#16212e" }
  success: { light: "#1f7a35", dark: "#30d158" }
  warning: { light: "#b25000", dark: "#ff9f0a" }
  destructive: { light: "#d70015", dark: "#ff453a" }
typography:
  family: "Geist, -apple-system, 'SF Pro Text', 'Sukhumvit Set', 'Noto Sans Thai', system-ui, sans-serif"
  mono: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace"
rounded: { sm: "6px", md: "8px", lg: "10px", xl: "14px", 2xl: "20px" }
---

# Design System: Helix

The full system (tokens, components, previews, usage rules) lives in the **Helix Design System** artifact. This file is the in-repo summary for agents; `src/index.css` holds the live CSS variables.

## Overview

Helix pairs **Vercel's precision** — Geist type, hairlines, neutral surfaces, a black/white primary button — with **Apple iOS patterns** — large titles, inset grouped lists, segmented controls, sheets/drawers, a tab-bar-style nav and translucent chrome. Staff screens follow the OS light/dark setting (`ThemeProvider`, default `system`); both themes are designed equally. The student portal stays a separate `.theme-game` world and does not use these rules.

## Principles

1. Task speed over decoration; the brand lives in precise details.
2. One meaningful hue: `accent` blue marks "tappable / selected". Everything else is neutral or a status colour.
3. Thai first: line-height never below 1.25.
4. Never lose a write: queued offline saves are always announced.
5. Layouts never overlap or overflow: rows wrap, the flexible child shrinks.

## Colour

- Frame and sidebar on `shell`; the main pane on `background`; cards and table panels on `card` with `shadow-card`; drawers, dialogs and menus on `raised`.
- Text `foreground`; secondary text `muted-foreground` (≥4.5:1 on every surface in both themes).
- Primary action: `bg-primary text-primary-foreground` — one per view. Blue confirm: `bg-accent`. Everything else: `bg-secondary`.
- Destructive is red text on a soft red tint (`bg-destructive/10 text-destructive`), confirmed by a dialog.
- In dark mode, `text-accent` / `border-accent` / `ring-accent` automatically use the lighter `#3d9bff` (see `index.css`), fills keep `#0071e3` so white labels pass 4.5:1.
- Status colours always come with a word or icon. Subject hues (`subjectColor.ts`) are data, never chrome.

## Typography

- One family: Geist for Latin, SF/Sukhumvit on Apple and Noto Sans Thai elsewhere for Thai. IDs, scores and numbers use `font-mono` with `tabular-nums`.
- Page title 17px semibold in the header; large titles 32/40 bold; card titles 15–17px semibold; body 14–15px; labels 13px medium; footnotes 12px; nothing under 11px.
- Inputs are 16px below `md` (prevents iOS zoom) and 13px from `md` up.

## Layout & responsiveness

- Desktop (≥1024px): sidebar 240px on `shell` + main pane (`rounded-2xl`, `shadow-card`). Phones: glass header + left nav drawer.
- Controls are 32px on desktop and at least 40px below `md` (`ui-control` / `ui-control-icon` in `ui.tsx`). Tiny `h-6`/`h-7` controls opt out.
- **Toolbars use `.toolbar`** (flex + wrap + gap 8px). The flexible child (search, title) gets `min-w-0 flex-1`; fixed-width controls use `w-full sm:w-48` style widths, never a fixed width wider than ~40% of a phone.
- Never position badges/buttons `absolute` over text unless the text reserves that space; prefer a flex row with `min-w-0` + `truncate` on the text and `shrink-0` on the badge.
- Card grids: `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`; every card `min-w-0`.

## Elevation & shape

- `shadow-card` (1px ring + soft 1–2px) for cards/panels; `shadow-float` for popovers, toasts, link-card hover; `shadow-drawer` for drawers/dialogs; `shadow-thumb` for switch knobs.
- Radii: inputs `rounded-md` (8px), buttons `rounded-lg` (10px), cards/panels `rounded-xl` (14px), drawers/dialogs `rounded-2xl` (20px), avatars/switches full.
- Blur only on floating chrome (mobile header, toasts, desktop sticky header) — never on tables or in-page panels.

## Components (`src/components`)

- **Button** variants: `default` (primary), `accent`, `secondary`, `tinted`, `outline`, `ghost`, `plain`, `destructive`; sizes `default`/`sm` 32px (40px touch), `xs` 24px, `lg` 40px, `icon`. Press scales to 97%.
- **Input / Select**: `card` fill, `input` border (≥3:1), focus = accent border + 3px accent halo. Native selects and date pickers stay native.
- **Card**: solid `card`, `shadow-card`, 14px corners, 16/20px padding. **FormSection**: same surface with an icon tile.
- **Switch**: iOS 51×31, on = `accent`, off = `fill-strong`.
- **Sheet** (`Sheet.tsx`, vaul): the floating side drawer — inset 8px, 20px corners, `raised` fill, `shadow-drawer`, icon tile on `accent-soft`, round close button. **Modal**: centered dialog with the same surface.
- **Table panels** (`.table-panel`): `card` + `shadow-card`, head without fill (hairline under, `muted-foreground` labels), row hover `muted`.
- **Empty state**: 48px `secondary` icon tile, 17px title, 14px description.

## Don'ts

- No gradients or glow on staff chrome; no coloured left-border cards; no emoji as icons.
- No second accent hue in the back-office.
- No fixed-width rows that can't wrap; no text under absolutely positioned controls.
- Don't reuse the game skin's pink, thick borders or press shadow in staff screens.
