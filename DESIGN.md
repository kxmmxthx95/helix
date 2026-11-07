---
name: Helix
description: School operations back-office — Vercel (Geist) precision with Apple iOS patterns, light and dark equally; an iPhone-style skin for students and a large-size tablet mode for the POS.
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

Helix pairs **Vercel's precision** — Geist type, hairlines, neutral surfaces, a black/white primary button — with **Apple iOS patterns** — large titles, inset grouped lists, segmented controls, sheets/drawers, a tab-bar-style nav and translucent chrome. Staff screens follow the OS light/dark setting (`ThemeProvider`, default `system`); both themes are designed equally. Two scoped variants sit on top of the same components: the **student portal** (`.theme-game`, an iPhone skin — see *Student portal*) and the **POS** (`.pos-large`, the same staff look at a large size for tablet cashiers — see *POS (tablet)*).

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
- **Card**: solid `card`, `shadow-card`, 14px corners, 16/20px padding. **FormSection**: grouped form card, see Forms & overlays.
- **Switch**: iOS 51×31, on = `accent`, off = `fill-strong`.
- **Sheet** (`Sheet.tsx`, vaul): the floating side drawer — inset 8px, 20px corners, `raised` fill, `shadow-drawer`. **Modal** (`Modal.tsx`, native `<dialog>`): centered dialog with the same surface. When to use which, and what goes inside: Forms & overlays.
- **Table panels** (`.table-panel`): `card` + `shadow-card`, head without fill (hairline under, `muted-foreground` labels), row hover `muted`.
- **Empty state**: 48px `secondary` icon tile, 17px title, 14px description.

## Forms & overlays

**Sheet or Modal**
- A form that adds or edits one record (the student form, new or existing), and any short confirm / few-field form: **Modal** (centered, one task, nothing behind it to consult).
- Viewing details beside the list, tables, file imports, long lists, side tools: **Sheet** (side drawer; `wide` / `"full"` for tables). The list stays visible behind it.
- Both: title only in the header (the description is `sr-only`), body scrolls, actions in a footer. Header and footer use matching padding (header `pt-5 pb-3`, footer `pt-3 pb-5` in Modal). Modal is `max-w-md` by default, `max-w-lg` for long forms.

**FormSection** (grouped rows, iOS inset-grouped)
- Surface `muted` with 14px corners and no shadow, on the white overlay. Rows are separated by 1px `border` hairlines inset 16px from both edges, never full width.
- Rows are label left, value right, about 40px tall (the input inside is 28px and borderless). Labels use `foreground`; values use `muted-foreground` and go back to `foreground` while the field is focused (dropdown options stay `foreground`). Empty text fields read "ระบุ", empty selects show their placeholder. Number inputs hide the spin buttons so the value stays flush right.
- The heading above a card is optional (`title`); omit it when a tab or sheet title already names the group. A card whose last row is a textarea gets extra bottom padding.
- Wide controls (date selects, map, textarea) stack under their label instead of splitting the row. A status uses a leading coloured dot: green studying, orange transferred, accent graduated, red dropped.
- Applies to every `FormSection` user (Roster, Users, AcademicEvents) and to `Field` inside any Sheet; the address block in Profile and Onboarding follows the same rows.

**Tabs**
- **Underline tabs with an icon** switch the *section* of one record (student form: ข้อมูลทั่วไป / ที่อยู่ / สุขภาพ / ผู้ปกครอง). Equal-width, semibold, 2px `foreground` underline on the active tab. When the tab row itself is narrower than 26rem (phone, or inside a Sheet) only the icon shows; the label stays for screen readers and as a tooltip.
- **Segmented control** switches the *view or filter* of the same data (2–4 short options).

**Validation** (standard for new or edited forms; older forms move over when touched)
- Mark required fields with a red `*` after the label. Turn off the browser's own validation (`noValidate`) and validate in code with one pure function per form (see `studentErrors` in `Roster.tsx`).
- Show inline red messages under the field only after the first save attempt, and clear each as it becomes valid. A failed save jumps to the tab holding the first error and shows a toast with the count. Errors that sit in another section use a toast with the reason instead.
- Optional fields are checked only when filled (13-digit national ID, 9–10 digit phone, email shape, birth date not in the future).

**Form building blocks**
- **AvatarCard**: 64px round photo with a camera button and remove action; the file uploads when the form is saved, not on pick.
- **MapPicker**: Google map (click or drag a pin) plus a coordinates field that accepts a pasted "lat, lng". Without a Maps key only the field and an open-in-Maps link show.
- **AddressInputs**: house number, moo, soi, road, then postcode, then province, district, subdistrict as selects narrowed by the postcode. A level with one choice fills itself; changing the postcode clears the levels below it. Older free-text values stay selectable.
- **Guardian cards** (father, mother, guardian): three separate cards. A toggle pair on the guardian card ("ผู้ปกครองคือบิดา / มารดา") reuses the father's or mother's data and hides the guardian's own fields.

## Student portal (iPhone skin)

Set by `GameShell` as `.theme-game` on `<html>`; follows light/dark. Files: `src/components/game/GameShell.tsx`, `GameHud.tsx`, the `.theme-game` blocks in `index.css`.

- **Colours (iOS system):** ground `#f2f2f7` / dark `#000`, cards `#fff` / `#1c1c1e`, separators 0.5px, tint = system pink (`--primary` ≈ `#ff2d55`), links and back buttons = system blue (`--accent`), switches green (`--success`). Inputs are filled (`--field`, `bg-field`) with no border, 10px corners.
- **Type:** SF Pro / Sukhumvit (`-apple-system` first). Large title 34/41 bold, nav title 17 semibold, body 17, secondary 15, footnote 13, tab labels 10.
- **Shell:** phones = translucent bottom tab bar (5 tabs, icon + label, active = tint) and an iOS nav bar on inner pages (blue "‹ หน้าแรก", centred 17px title); the page's large title collapses into the nav bar on scroll and the bar turns to frosted material. Desktop (≥1024) = translucent sidebar (source-list style, selected row `foreground/8%` with tint text).
- **Home:** greeting large title + Lv/EXP bar → Today-style featured card (pink gradient, next due work, swipe between subjects, "ส่งงาน") → app-icon menu (56px squircles, iOS colours, red badge) → inset-grouped "งานที่ต้องส่ง" list → subject cards scroller → "สรุปของฉัน" Settings-style list (30px coloured icon squares, value + chevron).
- **Sheets:** on phones every `Sheet` in the portal is an iPhone bottom card sheet with a grabber (`SheetStyleContext` = `"ios"` provided by `GameShell`); desktop keeps the side drawer.
- Don't: game art, thick outlines, press shadows, or the old island/BATTLE UI.

## POS (tablet)

The cashier counter (`CardTopupPos.tsx`, `PosLogin.tsx`, `CardTopupSlips/Report/Products/Admin.tsx`). Users are school cashiers aged 40–60 on a **tablet** (landscape 1024–1366, portrait 768–834). Same Helix tokens and components, **larger and simpler**.

- **`.pos-large`** on `<html>` while the POS (or its login) is mounted: every `ui-control` is ≥52px tall with 16px side padding and 12px corners; small control text becomes 17px; field labels 16px; dialog text 17px. Call sites that ask for more keep it (min-height only). Ionicon wrappers are sized with `h-*`/`w-*`, not `size-*`.
- **Sizes:** body ≥18px (`text-lg`), headings 24–30px, money 30–72px bold `tabular-nums`; buttons `h-14 text-lg`, primary/confirm `h-16 text-xl`; keypad keys 72–80px with 30–36px digits; gaps ≥12px; list rows ≥56px.
- **Rules:** every action is a labelled button (no icon-only buttons, no underline links); status is colour **and** a word (green ออนไลน์ / red ออฟไลน์, amber รออนุมัติ); errors stay on screen in a red box (not only a toast); secondary text never carries important info; no hover-only or gesture-only actions.
- **Shell:** top bar = labelled "เมนู" button (drawer at every width) · segmented tabs ขายสินค้า / เติมเงิน (48px, top-up shows minutes left, red + blinking ≤5 min) · status pill · "รายการวันนี้". Admin views (สลิป, รายงาน, สินค้า, เครื่องขาย) live in the drawer.
- **Sale:** product grid (photo, 18px name, 20px bold price, 48px category chips) or keypad on the right, cart with 56px ± steppers, step hint under the charge button (① เลือกสินค้า → ② สแกนบัตร → ③ กดตัดเงิน), success = whole panel green with a big check + "ทำรายการต่อไป".
- **Admin pages share one pattern:** title + count, search (`!pl-12` with a left icon), black "เพิ่ม…" button; 48px pill filter chips (active = `foreground` fill); card grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` of `rounded-2xl` cards; tap a card to edit in a Modal; quick on/off `Switch` + word in the card footer, saved at once with a toast.
- **Reports:** date presets (วันนี้ / เมื่อวาน / 7 วัน / เดือนนี้ / เลือกเอง), the drawer cash total as the headline, 4 stat tiles, then tabs (ตามแคชเชียร์ / ตามเครื่องขาย / รายการยกเลิก) of cards, not wide tables.
- **Slip approval:** review queue — list left, review panel right (slip image inline, facts, 64px amount field, "อนุมัติ เติมเงิน X ฿" over "ไม่อนุมัติ"); portrait opens the panel as a Modal; after a decision the next pending slip opens. Reject reasons offer one-tap presets.
- **PIN pad:** lock icon, one instruction line, six 48px boxes (next box outlined), inline red error with a shake, "กำลังตรวจสอบ…", keys 80px with ล้าง / ลบ words; first-time setup shows a 2-step bar.
- **Scanner test:** hidden capture input (tap anywhere), one big status box (amber ready / green ทำงานปกติ / red with the cause: no Enter, Thai keyboard layout, wrong characters, too slow), steps 1-2-3, big barcode, "ทดสอบอีกครั้ง".

## Don'ts

- No gradients or glow on staff chrome; no coloured left-border cards; no emoji as icons.
- No second accent hue in the back-office.
- No fixed-width rows that can't wrap; no text under absolutely positioned controls.
- Don't bring the student portal's pink tint and iOS chrome, or the POS's large sizes, into ordinary staff screens.
