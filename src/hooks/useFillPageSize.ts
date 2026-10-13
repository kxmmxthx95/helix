import { useLayoutEffect, useState, type RefObject } from "react";

const ROW_HEIGHT = 40;
const MIN = 5;
const MAX = 50;

/**
 * Page size that fills a `.table-panel-scroll` viewport: how many fixed-height
 * body rows fit under the measured thead. Observes resize; callers pass
 * `ready` when the scroll node is mounted (e.g. after rows load).
 */
export function useFillPageSize(
  scrollRef: RefObject<HTMLElement | null>,
  ready: boolean,
  opts?: { rowHeight?: number; min?: number; max?: number },
) {
  const rowHeight = opts?.rowHeight ?? ROW_HEIGHT;
  const min = opts?.min ?? MIN;
  const max = opts?.max ?? MAX;
  const [pageSize, setPageSize] = useState(min);

  // The scroll node can be unmounted and remounted while `ready` stays true (skeleton while refetching,
  // department switch), which would leave the observers on a detached element — so track the live node.
  const [el, setEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const live = ready ? scrollRef.current : null;
    setEl((prev) => (prev === live ? prev : live));
  });

  useLayoutEffect(() => {
    if (!el) return;

    // Measure the panel that stretches to the viewport, not the scroll node itself: with few rows
    // the scroll node can shrink to its content, which would lock the page size at `min`.
    const box = el.closest<HTMLElement>(".table-panel") ?? el;

    const compute = () => {
      const thead = el.querySelector("thead");
      const headerH = thead instanceof HTMLElement ? thead.offsetHeight : rowHeight;
      const next = Math.min(max, Math.max(min, Math.floor((box.clientHeight - headerH) / rowHeight)));
      setPageSize((prev) => (prev === next ? prev : next));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(box);
    ro.observe(el);
    const thead = el.querySelector("thead");
    if (thead) ro.observe(thead);
    return () => ro.disconnect();
  }, [el, rowHeight, min, max]);

  return pageSize;
}
