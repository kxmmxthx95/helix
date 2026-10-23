import { useLayoutEffect, useState } from "react";

/**
 * Rows per page that fit between a table and the bottom of the scrolling <main>,
 * so the page needs no scrolling. Attach `ref` to the table's wrapper; give the
 * wrapper `style={{ minHeight }}` so the pager below stays put on a short last page.
 * `reserve` is the height of everything under the table (pager + gap). Below
 * `min` rows the page just scrolls. Measures real row/header heights from the DOM.
 */
export function useFitRows({ reserve, min = 5, initial = 20 }: { reserve: number; min?: number; initial?: number }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [fit, setFit] = useState<{ rows: number; minHeight?: number }>({ rows: initial });

  useLayoutEffect(() => {
    const main = el?.closest("main");
    if (!el || !main) return;
    const measure = () => {
      const head = el.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const row = el.querySelector("tbody tr")?.getBoundingClientRect().height || 40;
      // Table top inside <main>'s scroll content, so scrolling doesn't change the answer.
      const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      const pad = parseFloat(getComputedStyle(main.firstElementChild ?? main).paddingBottom) || 0;
      const rows = Math.max(min, Math.floor((main.clientHeight - top - pad - reserve - head) / row));
      setFit((f) => (f.rows === rows ? f : { rows, minHeight: head + rows * row }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    // Filters above can wrap/unwrap and move the table without <main> resizing.
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [el, reserve, min]);

  return { ref: setEl, ...fit };
}
