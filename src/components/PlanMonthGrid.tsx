import { AlertTriangle, CheckmarkCircleIcon } from "@/components/icons";
import type { PlanTopicItem } from "@/hooks/useTeachingPlanSlots";
import type { PeriodDefinition, TeachingPlanSlot } from "@/lib/database.types";
import { hhmm, teachingOrdinal } from "@/lib/periods";
import { addDays, type SlotCell, weekStart } from "@/lib/planSlots";
import { cn } from "@/lib/utils";

const DAY = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

type Props = {
  month: string; // YYYY-MM
  periods: PeriodDefinition[];
  cells: SlotCell[];
  /** Holiday/closure name for a date, or null. */
  closed: (date: string) => string | null;
  slotAt: (c: { date: string; periodNo: number }) => TeachingPlanSlot | undefined;
  topics: PlanTopicItem[];
  /** Subject card gradient classes — same as the timetable. */
  gradient: string;
  today: string;
  readOnly: boolean;
  onOpen: (c: SlotCell) => void;
};

/** Month calendar (Mon–Sat) whose day cells hold timetable-style period cards of this subject. */
export function PlanMonthGrid(p: Props) {
  const first = `${p.month}-01`;
  const weeks = Array.from({ length: 6 }, (_, w) => addDays(weekStart(first), w * 7)).filter((ws) => ws.slice(0, 7) <= p.month);
  const periodAt = new Map(p.periods.map((x) => [`${x.day_of_week}-${x.period_no}`, x]));

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="grid min-w-[44rem] grid-cols-6 text-xs">
        {DAY.map((n) => (
          <div key={n} className="bg-muted px-2 py-3 text-center font-medium text-muted-foreground [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border">
            {n}
          </div>
        ))}
        {weeks.flatMap((ws) =>
          DAY.map((_, i) => {
            const d = addDays(ws, i);
            const inMonth = d.slice(0, 7) === p.month;
            const event = p.closed(d);
            const dayCells = inMonth ? p.cells.filter((c) => c.date === d) : [];
            return (
              <div
                key={d}
                className={cn("min-h-28 space-y-1 border-l border-t border-border p-1 first:border-l-0 [&:nth-child(6n+1)]:border-l-0", !inMonth && "bg-muted/40 opacity-50")}
              >
                <p className={cn("px-1 tabular-nums", d === p.today ? "font-semibold text-accent" : "text-muted-foreground")}>
                  {Number(d.slice(8))}
                </p>
                {inMonth && event && <p className="rounded-lg bg-muted px-1.5 py-1 text-muted-foreground">{event}</p>}
                {dayCells.map((c) => {
                  const pd = periodAt.get(`${i + 1}-${c.periodNo}`);
                  return (
                    <PlanCard
                      key={c.periodNo}
                      ordinal={teachingOrdinal(p.periods, i + 1, c.periodNo)}
                      time={pd ? `${hhmm(pd.start_time)}–${hhmm(pd.end_time)}` : ""}
                      slot={p.slotAt(c)}
                      topic={p.topics.find((t) => t.id === p.slotAt(c)?.topic_id)}
                      gradient={p.gradient}
                      readOnly={p.readOnly}
                      onOpen={() => p.onOpen(c)}
                    />
                  );
                })}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

/** Timetable-style period card; `roomy` = week grid size, default = compact for month cells. */
export function PlanCard({
  ordinal,
  time,
  slot,
  topic,
  gradient,
  readOnly,
  onOpen,
  roomy = false,
}: {
  ordinal: number;
  time: string;
  slot: TeachingPlanSlot | undefined;
  topic: PlanTopicItem | undefined;
  gradient: string;
  readOnly: boolean;
  onOpen: () => void;
  roomy?: boolean;
}) {
  const taught = slot?.completed_at != null;
  const filled = !!topic || taught;
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onOpen}
      className={cn(
        "relative flex w-full flex-col rounded-lg px-2 py-1.5 text-left leading-snug transition-opacity",
        roomy && "min-h-[4.25rem] justify-center rounded-xl px-3 py-2",
        filled ? gradient : "border border-dashed border-destructive/50 text-destructive",
        !readOnly && !filled && "hover:bg-destructive/5",
        !readOnly && filled && "hover:opacity-90",
      )}
    >
      <span className="text-[10px] tabular-nums opacity-70">
        คาบ {ordinal}
        {time && <span className="block">{time}</span>}
      </span>
      <span className={cn("line-clamp-2 pr-4 text-xs", filled && "font-semibold")}>{topic?.title ?? (taught ? "สอนแล้ว" : "ว่าง")}</span>
      {taught &&
        (slot?.completed_on_plan ? (
          <CheckmarkCircleIcon className="absolute right-1.5 top-1.5 h-3.5 w-3.5" aria-label="สอนตามแผน" />
        ) : (
          <AlertTriangle className="absolute right-1.5 top-1.5 h-3.5 w-3.5" aria-label="สอนไม่ตามแผน" />
        ))}
    </button>
  );
}
