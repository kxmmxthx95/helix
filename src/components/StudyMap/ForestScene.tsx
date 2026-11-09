import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createForestWorld, type ForestWorld } from "@/components/StudyMap/ForestWorld";

export type ForestNode = { id: string; name: string };
type Props = {
  /** Lessons in display order. Empty = library preview with clearly labelled sample stages. */
  nodes: ForestNode[];
  /** Open lesson id (detail panel open). The camera follows it. */
  selectedId: string | null;
  /** Called when the user presses "เปิดบทเรียน". */
  onSelect: (id: string) => void;
};

const SAMPLE: ForestNode[] = [
  { id: "sample-1", name: "จุดตัวอย่าง 1 · ลานแสงแรก" },
  { id: "sample-2", name: "จุดตัวอย่าง 2 · ซุ้มเถาวัลย์" },
  { id: "sample-3", name: "จุดตัวอย่าง 3 · ทางสู่ซากวิหาร" },
];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Fixed-camera forest. No orbit, pan or zoom: stages are chosen with the numbered markers,
 * previous/next buttons or arrow keys, and the camera glides along the trail at a constant scale.
 */
export function ForestScene({ nodes, selectedId, onSelect }: Props) {
  const sample = nodes.length === 0;
  const stages = useMemo(() => (sample ? SAMPLE : nodes), [sample, nodes]);
  const count = stages.length;
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const markers = useRef<(HTMLButtonElement | null)[]>([]);
  const world = useRef<ForestWorld | null>(null);
  const reduced = useRef(false);

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(count - 1, i))), [count]);
  // Relative moves use the latest index so rapid taps never drop a step.
  const step = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(count - 1, i + d))), [count]);

  useEffect(() => { setIndex((i) => Math.min(i, count - 1)); }, [count]);
  useEffect(() => {
    const at = selectedId ? stages.findIndex((s) => s.id === selectedId) : -1;
    if (at >= 0) setIndex(at);
  }, [selectedId, stages]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    reduced.current = !!mq?.matches;
    const update = () => { reduced.current = !!mq?.matches; };
    mq?.addEventListener?.("change", update);
    return () => mq?.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const holder = host.current, box = wrap.current; if (!holder || !box) return;
    // A fresh canvas per world: dispose() force-loses the WebGL context, and React StrictMode (dev)
    // mounts effects twice, so reusing one canvas would hand the second world a dead context.
    const el = document.createElement("canvas");
    el.setAttribute("aria-hidden", "true"); el.className = "block h-full w-full"; el.style.touchAction = "pan-y";
    holder.append(el);
    let w: ForestWorld;
    try {
      w = createForestWorld(el, {
        stageCount: count,
        reducedMotion: () => reduced.current,
        onFrame: (pts) => pts.forEach((p, i) => {
          const m = markers.current[i]; if (!m) return;
          m.style.left = `${p.x}px`; m.style.top = `${p.y}px`; m.hidden = p.hidden;
        }),
      });
    } catch {
      el.remove(); setFailed(true); return;
    }
    world.current = w;
    let alive = true; setLoading(true);
    void w.ready?.then(() => { if (alive) setLoading(false); });
    w.resize(box.clientWidth, box.clientHeight);
    const ro = new ResizeObserver(() => w.resize(box.clientWidth, box.clientHeight)); ro.observe(box);
    return () => { alive = false; ro.disconnect(); w.dispose(); el.remove(); world.current = null; };
  }, [count]);

  useEffect(() => { world.current?.focus(index); }, [index, count]);

  if (failed) return <p className="p-6">ไม่สามารถแสดงภาพ 3D ได้ — เลือกบทเรียนจากรายการด้านล่าง</p>;
  const current = stages[index]!;
  return (
    <div
      ref={wrap}
      tabIndex={0}
      role="group"
      aria-label="แผนที่ป่า กล้องคงที่ เลือกด่านด้วยปุ่มหรือลูกศรซ้ายขวา"
      className="relative h-full w-full overflow-hidden bg-[#0d211d] text-[#f3eedb] outline-none focus-visible:ring-2 focus-visible:ring-[#e2c984]"
      onKeyDown={(e) => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); }}
    >
      <div ref={host} className="absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(5,19,17,.55),transparent 22%,transparent 62%,rgba(5,19,17,.85)),radial-gradient(ellipse at center,transparent 48%,#041a184f)" }} />
      {loading && <div role="status" className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-sm text-[#d9ead2]"><span className="rounded-full bg-[#0d211d]/80 px-4 py-2">กำลังโหลดฉากป่า…</span></div>}
      {stages.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => { markers.current[i] = el; }}
          type="button"
          hidden
          aria-label={`ด่าน ${i + 1}: ${s.name}`}
          aria-pressed={i === index}
          onClick={() => go(i)}
          className={`absolute z-10 grid h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 px-1 text-xs font-semibold shadow-md transition-colors ${i === index ? "border-[#f3e3a8] bg-[#e2c984] text-[#1c2a1c]" : "border-[#c9e3c9]/70 bg-[#0d211d]/75 text-[#e8f2e3] hover:bg-[#1d3a30]"}`}
        >
          {pad(i + 1)}
        </button>
      ))}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-3 sm:p-4">
        <section aria-live="polite" className="min-w-0 max-w-[26rem]">
          <div className="text-[11px] tracking-widest text-[#bfd8b8]">{sample ? "ตัวอย่างฉาก" : `ด่าน ${pad(index + 1)} / ${pad(count)}`}</div>
          <h3 className="truncate text-base font-semibold sm:text-lg">{current.name}</h3>
          {!sample && (
            <button type="button" onClick={() => onSelect(current.id)} className="mt-2 rounded-full border border-[#e2c984] bg-[#e2c984] px-4 py-1.5 text-sm font-semibold text-[#1c2a1c] hover:bg-[#f0d994]">
              เปิดบทเรียน ↗
            </button>
          )}
        </section>
        <nav aria-label="เลือกด่าน" className="flex items-center gap-2">
          <button type="button" aria-label="ด่านก่อนหน้า" disabled={index === 0} onClick={() => step(-1)} className="h-9 w-9 rounded-full border border-[#c9e3c9]/70 bg-[#0d211d]/75 text-lg disabled:opacity-40">←</button>
          <span className="min-w-[3.5rem] text-center text-sm tabular-nums">{pad(index + 1)} / {pad(count)}</span>
          <button type="button" aria-label="ด่านถัดไป" disabled={index === count - 1} onClick={() => step(1)} className="h-9 w-9 rounded-full border border-[#c9e3c9]/70 bg-[#0d211d]/75 text-lg disabled:opacity-40">→</button>
        </nav>
      </div>
    </div>
  );
}
