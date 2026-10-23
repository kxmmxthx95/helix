---
name: Helix
description: School operations back-office — dark, glass-layered, dense and fast; with a separate pastel game skin for students.
colors:
  ink-night: "#141414"
  ink-card: "#0a0a0a"
  ink-raised: "#1a1a1a"
  hairline-night: "#292929"
  paper-text: "#ededed"
  paper-muted: "#a1a1a1"
  signal-blue: "#0a7cff"
  signal-blue-day: "#0072f5"
  alarm-red: "#f52424"
  ok-green: "#4ebc60"
  caution-amber: "#f6b23c"
  day-paper: "#ffffff"
  day-ink: "#0a0a0a"
  day-wash: "#f5f5f5"
  day-muted: "#666666"
  day-hairline: "#d1d1d1"
  game-blush: "#fff0f7"
  game-pink: "#ee2b8c"
  game-plum: "#2f163b"
  game-violet: "#8a2eb8"
typography:
  heading:
    fontFamily: "Inter, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, Sarabun, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "'Sukhumvit Set', SukhumvitSet, Prompt, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
  caption:
    fontFamily: "'Sukhumvit Set', SukhumvitSet, Prompt, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.25
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  game: "16px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.paper-text}"
    textColor: "{colors.ink-card}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-accent:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.day-paper}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-destructive:
    backgroundColor: "{colors.alarm-red}"
    textColor: "{colors.day-paper}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  input-field:
    backgroundColor: "{colors.ink-night}"
    textColor: "{colors.paper-text}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.ink-card}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Helix

## Overview

**Creative North Star: "The Night Registry"**

Helix back-office reads like a registry kept after hours: dark, exact, and unhurried. Teachers and staff open it many times a day, on phones in a classroom and desktops in an office. Every surface is built so a routine task finishes before attention drifts. The shell is off-black, content sits on near-black cards separated by 1px hairlines, and a single electric blue marks what can be acted on.

Density is high on purpose: 32px controls, 12px label text, 10px captions. Hierarchy comes from weight, tone, and spacing, not from size or color. Glass (blur + translucency) is reserved for things that float above content; it is never the page itself.

The student portal is a deliberate second world. It switches on `.theme-game` and becomes a pink-and-violet fantasy-castle world: painted 9-slice frames, glowing edges, rounded display type (Mali). It is a separate skin, not a theme toggle, and it never leaks into staff screens.

**Key Characteristics:**
- Off-black shell (#141414), near-black cards (#0a0a0a), 1px hairlines. No pure #000 shell.
- One accent: signal blue (#0a7cff dark / #0072f5 light). Everything else is neutral.
- Glass only on floating chrome: cards on glass, bottom nav, sheets, drawers.
- Thai-first type stack with correct line height for vowel and tone marks.
- Press feedback everywhere: tappable surfaces scale to 95% on active.
- Light theme exists and mirrors the dark tokens; dark is the default for staff.

## Colors

Neutral-led and cool. One blue accent, three status hues, and a pink game skin that stays in its own lane.

### Primary
- **Paper Text** (#ededed dark / #0a0a0a light): primary text and the default filled button. In dark mode the "primary" button is light-on-dark, not blue.

### Secondary
- **Signal Blue** (#0a7cff dark, #0072f5 light): the only accent. Focus ring, accent buttons, active selection. Used on a small share of any screen so it reads as a signal.

### Neutral
- **Ink Night** (#141414): page shell and input fill in dark mode.
- **Ink Card** (#0a0a0a): cards, drawers, table panels.
- **Ink Raised** (#1a1a1a): muted and secondary fills, hover states.
- **Hairline Night** (#292929): borders and inputs in dark mode.
- **Paper Muted** (#a1a1a1): secondary text in dark mode.
- **Day Paper** (#ffffff), **Day Wash** (#f5f5f5), **Day Muted** (#666666), **Day Hairline** (#d1d1d1): the light theme equivalents.

### Status
- **Alarm Red** (#f52424): destructive actions and errors.
- **Ok Green** (#4ebc60): success.
- **Caution Amber** (#f6b23c): warnings.

### Student game skin (`.theme-game`)
- Painted frames live in `public/game/` (spec: `docs/game-art-spec.md`); CSS fallbacks in `FRAMES` keep the skin intact without art.
- **Game Blush** (#fff0f7) page, **Game Pink** (#ee2b8c) primary, **Game Plum** (#2f163b) text and borders, **Game Violet** (#8a2eb8) accent. Light only; `.dark` is overridden.

Hex values above are rounded from the HSL tokens in `src/index.css`, which remain the source of truth.

### Named Rules
**The One Blue Rule.** Blue is the only accent in staff screens. If a second hue is needed for meaning, it is a status color, never decoration.

**The Subject Hue Exception.** Subject chips and timetable cards use a per-learning-area hue (`src/lib/subjectColor.ts`) with three grade shades. This is a data encoding, not a palette; it stays out of chrome.

## Typography

**Heading Font:** Inter, with Noto Sans Thai fallback
**Body Font:** Inter, with Sarabun for Thai
**Label/UI Font:** Sukhumvit Set on Apple, Prompt elsewhere, Noto Sans Thai fallback

**Character:** Neutral Latin sans for numbers and headings, softer Thai faces for reading. Controls use the Sukhumvit/Prompt family so buttons, selects, and sidebar labels feel like the OS.

### Hierarchy
- **Heading** (700, 15px, 1.4, -0.01em): empty-state titles and section heads. Page chrome stays small.
- **Body** (400, 13px, 1.4): descriptions, table text, max 20rem width in empty states.
- **Label** (500, 12px): button text, field labels, sidebar items (sidebar section headings 600).
- **Caption** (400, 10px): role subtitles, compact buttons.

### Named Rules
**The 16px Input Rule.** Inputs are 16px on phones to stop iOS zoom, and drop to 14px at 768px and above.

**The Thai Leading Rule.** Never set line-height below 1.25 on Thai text; tone marks and upper vowels clip.

## Layout

App shell is fixed to the viewport. A collapsible sidebar on large screens, a bottom nav with safe-area padding on phones. Main pane scrolls with a reserved scrollbar gutter so content does not jump between views. Shell gutter is 12px (`px-shell`), growing for landscape notches. Spacing rhythm is tight: 6px between stacked nav items, 12px page gutters, 16px card padding. `.page-fill` stretches a table panel to the remaining viewport height. Touch targets are 32px tall in dense rows; primary actions on phones should not go smaller.

## Elevation & Depth

Hybrid. Default surfaces are flat and tonal: a card is a darker fill with a 1px hairline. Depth appears only on things that float.

### Shadow Vocabulary
- **Float glass** (`0 10px 40px rgb(0 0 0 / 0.45)` + inset top highlight `rgb(255 255 255 / 0.12)`, blur 40px): floating chrome.
- **Drawer** (`0 20px 50px rgb(0 0 0 / 0.55), 0 2px 8px rgb(0 0 0 / 0.3)`): side drawers; solid card fill, not glass.
- **Glass panel** (`0 8px 32px rgb(0 0 0 / 0.35)`, blur 28px): login and focal overlays.
- **Game press** (`0 3px 0 hsl(var(--border))`): student portal cards only.

### Named Rules
**The Float-Only Rule.** Blur and heavy shadow mark things above the page. Tables, lists, and in-page panels do not get them.

## Shapes

Soft but not round. Base radius is 8px (`--radius`), with 6px and 4px steps. Cards and sheets use 12px. Avatars are circles. Empty-state icon tiles are 12px squares with a hairline. The game skin raises radius to 16–20px and thickens borders to 2px.

## Components

### Buttons
- **Shape:** 8px radius, 32px high (24px for `xs`), 12px label text.
- **Primary:** filled with Paper Text, label in Ink Card. Hover drops opacity to 90%.
- **Accent / Destructive:** blue or red fill, white label.
- **Outline / Ghost:** hairline border or no border; hover fills Ink Raised.
- **Focus / Press:** 2px blue ring on `:focus-visible`; scales to 95% on press over 100ms.

### Inputs / Fields
- **Style:** 32px high, 8px radius, 1px hairline, background matches the shell.
- **Focus:** border shifts to the blue ring color.
- **Disabled:** 50% opacity. Native `select` and date inputs stay native for OS pickers, with a custom chevron and calendar glyph.
- **Labels:** 12px medium above the field; red asterisk for required; error text in Alarm Red below.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** glass fill at 72% alpha over the shell, 1px hairline.
- **Internal Padding:** 16px.

### Navigation
Sidebar on large screens, grouped under small semibold section labels, 12px items with 12px icons, collapsible to icons. Phones get a glass bottom nav and a header slot. Active item is marked by foreground color and fill, not blue.

### Empty State
Centered column: 44px hairline icon tile, 15px bold title, 13px muted description, optional action. It stretches to fill the page.

### Timetable Cards
Soft same-hue gradients per subject area, three shades by grade. They are data, so they carry their own hue and stay inside the grid.

## Do's and Don'ts

### Do:
- **Do** keep staff screens dark by default with the off-black shell (#141414), never pure #000.
- **Do** use signal blue for focus and the single main action only.
- **Do** put glass on floating chrome only.
- **Do** keep Thai text at line-height 1.25 or more.
- **Do** keep tappable surfaces pressable with the 95% scale response.
- **Do** keep the student portal a separate `.theme-game` skin.

### Don't:
- **Don't** put gradient text or decorative gradients on staff chrome.
- **Don't** add a second accent hue to the back-office.
- **Don't** apply blur or heavy shadow to tables and in-page panels.
- **Don't** shrink 16px mobile inputs below 16px.
- **Don't** reuse the game skin's pink, thick borders, or press shadow in staff screens.
- **Don't** use the Overcooked-style hard-shadow comic look; it was tried and discarded for the student portal.
