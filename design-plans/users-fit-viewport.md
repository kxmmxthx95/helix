# Users list fills the viewport height and shows as many rows as fit

Written against: dfa4462

> **Superseded in part (owner decision after rendering):** the page-size change (`useFitPageSize`, `fitPageSize`, the reserved pagination strip) was dropped. Users shows every row, the table scrolls inside the bounded panel, and the side/bottom frame was removed. Only the viewport-height page and the flex-column wrapper from change 2 remain.

## Evidence chain

- Surface: `src/routes/Users.tsx`, desktop (`lg:` and up), list state with rows loaded.
- Problem: the table panel is only as tall as its rows (20 per page). On a tall screen a band of empty page sits between the table (or its pagination) and the stat cards, because the stat cards are pushed to the bottom with `mt-auto` (`Users.tsx:499`). The list wrapper at `Users.tsx:220` is `<div className="space-y-2">`, a plain block, so `.table-panel { flex: 1 1 auto }` (`src/index.css:388`) has no flex parent to grow in.
- Design evidence: `DESIGN.md` principle 5 ("Layouts never overlap or overflow: rows wrap, the flexible child shrinks"); `.table-panel` / `.table-panel-scroll` in `src/index.css` are written to fill the remaining height and scroll inside (`min-height: 0; overflow: auto`); the `.page-flush` comment in `index.css` documents stat cards pinned to the bottom.
- Owner: `src/routes/Users.tsx` (wrapper and stat cards), `src/hooks/usePagination.ts` (page size), `src/index.css` (`.page-fill`, `.table-panel`).
- Scope and affected surfaces: `Users.tsx` only for layout; `usePagination.ts` gains one export that no other page calls.
- Uncertainty: the page-size half is a product decision, not a design-system rule. The owner chose it explicitly (option "ข": also show as many rows as fit). The row height constant (56px, `h-14`) must be re-checked if the row class changes. Needs a rendered check at 2–3 viewport heights.

## Design decision

Make the Users page a bounded column on desktop: the page is exactly viewport height, the table panel takes all the height between the toolbar and the pagination strip, the stat cards sit under it, and the page size equals the number of rows that fit in the panel. Fewer rows than fit leave blank space inside the panel (no gap outside it); more rows scroll inside the panel only if the viewport is shorter than five rows.

The panel height must come from the layout, not from its content, otherwise measuring it just reads back the current row count. So the page gets a definite height, the panel is told to fill it, and the pagination strip always reserves its height so the row count does not flip when pagination appears or disappears.

## Reuse

- `.table-panel` and `.table-panel-scroll` (`src/index.css`): already fill and scroll; no new CSS class.
- `usePagination(rows, resetDeps, pageSize)` already takes a page size and clamps the page when it changes.
- `Pagination` (`src/components/ui.tsx`) unchanged.
- Exemplar: `src/routes/Enrollment.tsx:521`, wrapper `flex min-h-0 flex-1 flex-col gap-2` around a `.table-panel`.

No new primitive beyond one small hook in the existing pagination module, which already owns page size.

## Changes

1. `src/hooks/usePagination.ts`
   - Change: add and export two things next to `usePagination`.
     ```ts
     /** Rows that fit in `bodyHeight` px; `fallback` when the body is hidden (height 0) and never fewer than `min`. */
     export function fitPageSize(bodyHeight: number, rowHeight: number, min = 5, fallback = 20): number {
       return bodyHeight > 0 ? Math.max(min, Math.floor(bodyHeight / rowHeight)) : fallback;
     }

     /** Attach `ref` to a `.table-panel-scroll` element; `pageSize` tracks how many `rowHeight` rows fit below its `<thead>`. */
     export function useFitPageSize(rowHeight: number) {
       const [el, setEl] = useState<HTMLElement | null>(null);
       const [pageSize, setPageSize] = useState(20);
       useEffect(() => {
         if (!el) return;
         const measure = () =>
           setPageSize(fitPageSize(el.clientHeight - (el.querySelector("thead")?.offsetHeight ?? 0), rowHeight));
         measure();
         const ro = new ResizeObserver(measure);
         ro.observe(el);
         return () => ro.disconnect();
       }, [el, rowHeight]);
       return { ref: setEl, pageSize };
     }
     ```
   - Preserve: `usePagination` signature and behaviour; the three other callers in `Settings.tsx` keep the default 20.
   - Verify: with `rows.length` 16 and a body of 560px at 56px rows `fitPageSize` returns 10.

2. `src/routes/Users.tsx`
   - Change:
     - Call `const { ref: tableRef, pageSize } = useFitPageSize(56);` and pass `pageSize` as the third argument of the existing `usePagination(rows ?? [], [filters], pageSize)` (line 94). Add `ref={tableRef}` to the `.table-panel-scroll` div of the loaded table (line 321). The loading skeleton table (line 171) is untouched.
     - Root element (line 115): add `lg:h-[calc(100dvh-7.5rem)]` so the page has a definite height (same value `.page-fill` already uses for its `min-height` at `lg`).
     - List wrapper (line 220): `space-y-2` → `flex min-h-0 flex-1 flex-col gap-2` (Enrollment exemplar). The mobile `<ul className="lg:hidden">` keeps its own spacing: give it `mb-0` and let the wrapper `gap-2` apply.
     - Pagination (line 428): wrap in `<div className="min-h-11 shrink-0">` so the strip always reserves its height (the component returns `null` for a single page).
   - Preserve: toolbar, filters, sheets, row actions, the mobile card list and its 20-row pages, `sticky bottom-0 mt-auto` stat cards.
   - Verify: at 1440px high, desktop shows the table filling down to the pagination strip and the stat cards directly below, with no empty band outside the card; no page scrollbar in `<main>`.

3. `src/hooks/usePagination.test.ts` (new, vitest)
   - Change: three asserts on `fitPageSize`: `(560, 56) → 10`; `(100, 56) → 5` (floor to `min`); `(0, 56) → 20` (hidden body).
   - Verify: the file passes under `npx vitest run`.

## Scope

- Inherit: `Users.tsx` desktop list only.
- Verify: mobile (`<lg`) Users list still shows 20 cards per page and scrolls normally; `Settings.tsx` pagination still 20 rows; the `.page-flush` bottom padding behaviour (`main > div:has(.page-flush)`) is unchanged.
- Exclude: horizontal spacing, `max-w-screen-2xl`, other list pages (Roster, Employees), changing the default page size, server-side paging.

## Validation

- Product: an admin opens Users on a tall desktop screen and sees the list fill the screen, a stat row under it, and pagination that matches what is visible; resizing the window changes the row count.
- Interface: `/users` at viewport heights 700, 900, 1400 and at least 40 users and then 8 users; filter to zero results (empty state) and to one page; loading skeleton state; below 1024px.
- System: confirm only `usePagination.ts` gained code and no second pagination helper or new CSS class exists.
- Repository: `npx tsc --noEmit -p .` → no output; `npx vitest run` → all tests pass; `npx vite build` → no errors.

## Stop conditions

- Stop if the table body row height is no longer 56px (`h-14`) or differs when a row wraps; the fixed constant would then miscount.
- Stop if giving the root a definite height makes `<main>` scroll on a normal desktop viewport; the `7.5rem` offset would need re-deriving instead of copying.
- Stop if the row count flips repeatedly while resizing (measurement feedback); the reserved pagination strip is the intended guard.
- Stop if the change needs edits to `index.css` or other pages.

## Design documentation

- After acceptance and validation: add one bullet under "Layout & responsiveness" in `DESIGN.md`: "List pages that pin stat cards to the bottom: the page is viewport height, the table panel fills the space between toolbar and pagination, and the page size is the number of rows that fit (`useFitPageSize`); the pagination strip always reserves its height."
