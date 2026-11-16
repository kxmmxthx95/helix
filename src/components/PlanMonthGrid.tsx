import { AlertTriangle, CheckmarkCircleIcon } from "@/components/icons";
import type { PlanSlot, PlanTopicItem } from "@/hooks/useTeachingPlanSlots";
import type { PeriodDefinition } from "@/lib/database.types";
import { addDays, type SlotCell, weekStart } from "@/lib/planSlots";
import { cn } from "@/lib/utils";

const DAY = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

type Props = {
  month: string; // YYYY-MM
  periods: PeriodDefinition[];
  cells: SlotCell[];
  /** Holiday/closure name for a date, or null. */
  closed: (date: string) => string | null;
  slotAt: (c: { date: string; periodNo: number }) => PlanSlot | undefined;
  topics: PlanTopicItem[];
  /** Timetable-card look of this subject: stripe colour, code, classroom pill, subject-type pill. */
  look: PlanLook;
  today: string;
  readOnly: boolean;
  onOpen: (c: SlotCell) => void;
};

/** Month calendar (Mon–Sat) whose day cells hold timetable-style period cards of this subject. */
export function PlanMonthGrid(p: Props) {
  const first = `${p.month}-01`;
  const weeks = Array.from({ length: 6 }, (_, w) => addDays(weekStart(first), w * 7)).filter((ws) => ws.slice(0, 7) <= p.month);

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
                  return (
                    <PlanCard
                      key={c.periodNo}
                      slot={p.slotAt(c)}
                      topics={placedTopics(p.topics, p.slotAt(c))}
                      look={p.look}
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

/** Topics of a slot, in placement order. */
export function placedTopics(topics: PlanTopicItem[], slot: PlanSlot | undefined): PlanTopicItem[] {
  return (slot?.topic_ids ?? []).flatMap((id) => topics.find((t) => t.id === id) ?? []);
}

export type PlanLook = {
  tone: string;
  code: string;
  grade: { label: string; className: string };
  badge: { className: string; title: string };
};

/** Timetable-style period card; `roomy` = week grid size, default = compact for month cells. */
export function PlanCard({
  slot,
  topics,
  look,
  readOnly,
  onOpen,
  roomy = false,
}: {
  slot: PlanSlot | undefined;
  topics: PlanTopicItem[];
  look: PlanLook;
  readOnly: boolean;
  onOpen: () => void;
  roomy?: boolean;
}) {
  const taught = slot?.completed_at != null;
  const filled = topics.length > 0 || taught;
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onOpen}
      className={cn(
        "relative flex w-full flex-col gap-1 overflow-hidden rounded-lg px-2 py-1.5 text-left leading-snug transition-colors",
        roomy && "min-h-[4.25rem] justify-center rounded-xl px-3 py-2",
        filled ? "border border-border bg-card pl-3.5 text-foreground shadow-sm" : "border border-dashed border-destructive/50 text-destructive",
        !readOnly && !filled && "hover:bg-destructive/5",
        !readOnly && filled && "hover:bg-muted/40",
      )}
    >
      {filled && <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", look.tone)} />}
      {filled && (
        <span className="flex items-center gap-1.5">
          <span title={look.badge.title} className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", look.badge.className)}>
            {look.code}
          </span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", look.grade.className)}>{look.grade.label}</span>
        </span>
      )}
      {topics.length > 0 ? (
        topics.map((t) => (
          <span key={t.id} className="line-clamp-2 pr-4 text-xs font-semibold">
            {t.title}
          </span>
        ))
      ) : (
        <span className={cn("pr-4 text-xs", taught && "font-semibold")}>{taught ? "สอนแล้ว" : "ว่าง"}</span>
      )}
      {taught &&
        (slot?.completed_on_plan ? (
          <CheckmarkCircleIcon className="absolute right-1.5 top-1.5 h-3.5 w-3.5" aria-label="สอนตามแผน" />
        ) : (
          <AlertTriangle className="absolute right-1.5 top-1.5 h-3.5 w-3.5" aria-label="สอนไม่ตามแผน" />
        ))}
    </button>
  );
}
