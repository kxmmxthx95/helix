import { AlertTriangle, CheckmarkCircleIcon, LinkIcon } from "@/components/icons";
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
  /** Periods of linked (รวมแผน) subjects on a date where this subject has none (read-only ghosts). */
  othersOnDate: (date: string) => PlanOther[];
  onOpenOther: (o: PlanOther) => void;
  /** Linked (รวมแผน) subjects that also meet in this period. */
  linkedAt: (c: { date: string; periodNo: number }) => PlanLinked[];
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
                {inMonth &&
                  p.othersOnDate(d).map((o) => <OtherCard key={o.id} other={o} onOpen={p.readOnly ? undefined : () => p.onOpenOther(o)} />)}
                {dayCells.map((c) => {
                  return (
                    <PlanCard
                      key={c.periodNo}
                      slot={p.slotAt(c)}
                      linked={p.linkedAt(c)}
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

/** A linked subject's own period (this subject does not meet then): shown read-only. */
export type PlanOther = { id: string; assignmentId: string; date: string; periodNo: number; code: string; title: string; topics: PlanTopicItem[]; taught: boolean };

export function OtherCard({ other, onOpen }: { other: PlanOther; onOpen?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={onOpen}
      title={other.title}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1.5 text-left text-xs leading-snug transition-colors",
        onOpen && "hover:bg-accent/10",
      )}
    >
      <span className="flex items-center gap-1.5">
        <LinkIcon className="h-3 w-3 shrink-0 text-accent" />
        <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">{other.code}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">คาบ {other.periodNo}</span>
      </span>
      {other.topics.length > 0 ? (
        other.topics.map((t) => (
          <span key={t.id} className="line-clamp-2 font-semibold">
            {t.title}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">{other.taught ? "สอนแล้ว" : "ว่าง"}</span>
      )}
    </button>
  );
}

/** A subject linked to this plan, shown as a chip on the shared period. */
export type PlanLinked = { code: string; title: string };

export type PlanLook = {
  tone: string;
  code: string;
  grade: { label: string; className: string };
  badge: { className: string; title: string };
};

/** Timetable-style period card; `roomy` = week grid size, default = compact for month cells. */
export function PlanCard({
  slot,
  linked = [],
  topics,
  look,
  readOnly,
  onOpen,
  roomy = false,
}: {
  slot: PlanSlot | undefined;
  linked?: PlanLinked[];
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
          {topics.length > 0 && (
            <span className="ml-auto rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {topics.length}
            </span>
          )}
        </span>
      )}
      {linked.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 pr-4">
          <LinkIcon className="h-3 w-3 text-accent" />
          {linked.map((l) => (
            <span key={l.code} title={l.title} className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
              {l.code}
            </span>
          ))}
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
