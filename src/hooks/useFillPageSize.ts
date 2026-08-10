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

  useLayoutEffect(() => {
    if (!ready) return;
    const el = scrollRef.current;
    if (!el) return;

    const compute = () => {
      const thead = el.querySelector("thead");
      const headerH = thead instanceof HTMLElement ? thead.offsetHeight : rowHeight;
      const next = Math.min(max, Math.max(min, Math.floor((el.clientHeight - headerH) / rowHeight)));
      setPageSize((prev) => (prev === next ? prev : next));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    const thead = el.querySelector("thead");
    if (thead) ro.observe(thead);
    return () => ro.disconnect();
  }, [scrollRef, ready, rowHeight, min, max]);

  return pageSize;
}
