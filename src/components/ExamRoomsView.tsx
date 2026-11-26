import { Fragment, useEffect, useState } from "react";
import type { ExamSession, Subject } from "@/lib/database.types";
import { dayKey, endOf, isLive } from "@/lib/examRooms";
import { kindTone, roundTone } from "@/lib/examKinds";
import { cn } from "@/lib/utils";

/** "รายห้อง": pick a day, one column per physical room with that day's exams in time order. Gaps and clashes show inline; tap a card to open its seating. */
export function RoomsView({
  sessions,
  roomIdsOf,
  venues,
  subjectsOf,
  seatBadge,
  clashing,
  onOpen,
}: {
  sessions: ExamSession[];
  roomIdsOf: Map<string, string[]> | undefined;
  venues: { id: string; name: string }[];
  subjectsOf: (s: ExamSession) => Subject[];
  seatBadge: (s: ExamSession) => React.ReactNode;
  clashing: Set<string>;
  onOpen: (s: ExamSession) => void;
}) {
  // Re-render every 30 s so the live dot follows the clock.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  const days = [...new Set(sessions.map((s) => dayKey(new Date(s.opens_at!))))];
  const [picked, setPicked] = useState<string | null>(null);
  const today = dayKey(new Date());
  const day = picked && days.includes(picked) ? picked : (days.find((d) => d >= today) ?? days[0]);
  const hm = (ms: number) => new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const onDay = sessions.filter((s) => dayKey(new Date(s.opens_at!)) === day);
  const NONE = "__none__";
  const columns = new Map<string, ExamSession[]>();
  for (const s of onDay) {
    const ids = roomIdsOf?.get(s.id) ?? [];
    for (const id of ids.length > 0 ? ids : [NONE]) columns.set(id, [...(columns.get(id) ?? []), s]);
  }
  const nameOf = (id: string) => (id === NONE ? "ยังไม่ระบุห้อง" : (venues.find((v) => v.id === id)?.name ?? "ห้อง"));
  // Rooms with nothing on this day are not listed at all.
  const ordered = [...columns].sort(([a], [b]) => (a === NONE ? 1 : b === NONE ? -1 : nameOf(a).localeCompare(nameOf(b), "th", { numeric: true })));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="scrollbar-hidden flex shrink-0 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="วันสอบ">
        {days.map((d) => {
          const first = sessions.find((s) => dayKey(new Date(s.opens_at!)) === d)!;
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPicked(d)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted")}
            >
              {new Date(first.opens_at!).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {ordered.map(([id, list]) => {
          const sorted = list.slice().sort((a, b) => a.opens_at!.localeCompare(b.opens_at!));
          let latestEnd = 0;
          return (
            <section key={id} className="flex min-h-0 w-64 shrink-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-muted/40 p-2">
              <h3 className="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm font-semibold shadow-sm">
                <span className="truncate">{id === NONE ? nameOf(id) : `ห้อง ${nameOf(id)}`}</span>
                <span className="tabular-nums text-xs font-medium text-muted-foreground">{sorted.length} รอบ</span>
              </h3>
              {sorted.map((s, i) => {
                const start = new Date(s.opens_at!).getTime();
                const gap: [number, number] | null = i > 0 && start - latestEnd >= 15 * 60_000 ? [latestEnd, start] : null;
                latestEnd = Math.max(latestEnd, endOf(s));
                const bad = clashing.has(s.id) && id !== NONE;
                return (
                  <Fragment key={s.id}>
                    {gap && <p className="px-1 text-center text-[11px] text-muted-foreground">ว่าง {hm(gap[0])} – {hm(gap[1])}</p>}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpen(s)}
                      onKeyDown={(e) => e.key === "Enter" && onOpen(s)}
                      className={cn("cursor-pointer space-y-1.5 rounded-xl border bg-card p-3 text-xs hover:bg-muted", bad ? "border-destructive" : "border-border")}
                    >
                      <p className="flex items-center justify-between gap-2 text-sm font-semibold tabular-nums">
                        <span className="flex items-center">
                          {isLive(s, now) && <span title="กำลังสอบ" className="mr-1.5 inline-block size-2 shrink-0 animate-pulse rounded-full bg-success" />}
                          {hm(start)}{s.closes_at ? ` – ${hm(endOf(s))}` : ""}
                        </span>
                        {bad && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">ซ้อนเวลา</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-1">
                        {s.exam_type && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", kindTone(s.exam_type))}>{s.exam_type}</span>}
                        {s.round && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", roundTone(s.round))}>ครั้งที่ {s.round}</span>}
                        {seatBadge(s)}
                      </p>
                      <p className="line-clamp-2 text-sm font-medium">{subjectsOf(s).map((x) => x.name_th).join(", ") || s.title}</p>
                    </div>
                  </Fragment>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
