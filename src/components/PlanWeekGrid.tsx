import { useState } from "react";
import { RestaurantIcon } from "@/components/icons";
import { type DragPoint, OtherCard, PlanCard, type PlanLinked, type PlanLook, type PlanOther, placedTopics } from "@/components/PlanMonthGrid";
import type { PlanSlot, PlanTopicItem } from "@/hooks/useTeachingPlanSlots";
import type { PeriodDefinition } from "@/lib/database.types";
import { hhmm, teachingOrdinal } from "@/lib/periods";
import { addDays, type SlotCell } from "@/lib/planSlots";
import { cn } from "@/lib/utils";

const DAY = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

type Props = {
  week: string; // Monday, YYYY-MM-DD
  periods: PeriodDefinition[];
  cells: SlotCell[];
  /** Reason a whole day is closed (holiday name / นอกภาคเรียน), or null. */
  closed: (date: string) => string | null;
  slotAt: (c: { date: string; periodNo: number }) => PlanSlot | undefined;
  linkedAt: (c: { date: string; periodNo: number }) => PlanLinked[];
  othersOnDate: (date: string) => PlanOther[];
  onOpenOther: (o: PlanOther) => void;
  topics: PlanTopicItem[];
  look: PlanLook;
  today: string;
  readOnly: boolean;
  onOpen: (c: SlotCell) => void;
  assignmentId: string;
  onMove?: (from: DragPoint, to: DragPoint) => void;
};

/** Timetable-style week: rows = periods (times, breaks), columns = days. Only this subject's periods are live. */
export function PlanWeekGrid(p: Props) {
  const days = [...new Set(p.periods.map((x) => x.day_of_week))].filter((d) => d <= 6).sort((a, b) => a - b);
  const maxNo = p.periods.reduce((m, x) => Math.max(m, x.period_no), 0);
  const periodAt = new Map(p.periods.map((x) => [`${x.day_of_week}-${x.period_no}`, x]));
  const dateOf = (day: number) => addDays(p.week, day - 1);
  const [picked, setPicked] = useState<number | null>(null);
  const live = new Set([
    ...p.cells.map((c) => days.find((d) => dateOf(d) === c.date)),
    ...days.filter((d) => p.othersOnDate(dateOf(d)).length > 0),
  ].filter((d): d is number => d != null));
  const listDay = picked ?? days.find((d) => live.has(d) && dateOf(d) === p.today) ?? days.find((d) => live.has(d)) ?? days[0] ?? 1;

  const cell = (day: number, no: number) => p.cells.find((c) => c.date === dateOf(day) && c.periodNo === no);
  const others = (day: number, no: number) =>
    p.othersOnDate(dateOf(day)).filter((o) => o.periodNo === no).map((o) => <OtherCard key={o.id} other={o} roomy onOpen={p.readOnly ? undefined : () => p.onOpenOther(o)} onMove={p.onMove} />);
  const card = (c: SlotCell) => {
    return (
      <PlanCard
        slot={p.slotAt(c)}
        linked={p.linkedAt(c)}
        topics={placedTopics(p.topics, p.slotAt(c))}
        look={p.look}
        readOnly={p.readOnly}
        onOpen={() => p.onOpen(c)}
        point={{ assignmentId: p.assignmentId, date: c.date, periodNo: c.periodNo }}
        onMove={p.onMove}
        roomy
      />
    );
  };

  return (
    <>
      {/* phone: day tabs + period list, like the timetable */}
      <div className="sm:hidden">
        <div className="scrollbar-hidden -mx-1 mb-3 flex gap-2 overflow-x-auto px-1" role="tablist">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === listDay}
              disabled={!live.has(d)}
              onClick={() => setPicked(d)}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors disabled:opacity-40",
                d === listDay ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {DAY[d]} {Number(dateOf(d).slice(8))}
            </button>
          ))}
        </div>
        {p.closed(dateOf(listDay)) && (
          <p className="mb-2 rounded-xl bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">{p.closed(dateOf(listDay))}</p>
        )}
        <ul className="space-y-2">
          {p.periods
            .filter((x) => x.day_of_week === listDay)
            .sort((a, b) => a.period_no - b.period_no)
            .map((pd) => {
              if (pd.period_type === "break") {
                return (
                  <li key={pd.period_no} className="flex items-center justify-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    <RestaurantIcon className="h-3.5 w-3.5" />
                    {pd.label} {hhmm(pd.start_time)} – {hhmm(pd.end_time)}
                  </li>
                );
              }
              const c = cell(listDay, pd.period_no);
              return (
                <li key={pd.period_no} className="flex gap-3">
                  <div className="w-12 shrink-0 pt-2 text-center">
                    <p className="text-base font-semibold">{teachingOrdinal(p.periods, listDay, pd.period_no)}</p>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      {hhmm(pd.start_time)}
                      <br />
                      {hhmm(pd.end_time)}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {c ? card(c) : others(listDay, pd.period_no)}
                    {!c && others(listDay, pd.period_no).length === 0 && <p className="min-h-[4.25rem] rounded-xl bg-muted/40" />}
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      {/* desktop: full grid */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
        <table className="w-full min-w-[48rem] table-fixed border-collapse text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr className="h-12">
              <th className="w-28 px-2 py-3 text-center font-medium">คาบ / เวลา</th>
              {days.map((d) => (
                <th
                  key={d}
                  className={cn("border-l border-border px-2 py-3 text-center font-medium", dateOf(d) === p.today && "text-accent", !live.has(d) && "opacity-40")}
                >
                  <span className="block">{DAY[d]}</span>
                  <span className="block font-normal tabular-nums">{fmt(dateOf(d))}</span>
                  {p.closed(dateOf(d)) && <span className="block truncate font-normal text-warning">{p.closed(dateOf(d))}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxNo }, (_, i) => i + 1).map((no) => {
              const slots = days.map((d) => periodAt.get(`${d}-${no}`));
              const first = slots.find(Boolean);
              if (first && slots.every((pd) => !pd || pd.period_type === "break")) {
                return (
                  <tr key={no} className="h-10 border-t border-border bg-muted/60">
                    <td colSpan={days.length + 1} className="px-2 py-2 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <RestaurantIcon className="h-3.5 w-3.5" />
                        {first.label} {hhmm(first.start_time)} – {hhmm(first.end_time)}
                      </span>
                    </td>
                  </tr>
                );
              }
              const ordinal = days
                .map((d) => (periodAt.get(`${d}-${no}`)?.period_type === "teaching" ? teachingOrdinal(p.periods, d, no) : 0))
                .find(Boolean);
              return (
                <tr key={no} className="border-t border-border align-top">
                  <td className="bg-muted/40 px-2 py-2 text-center">
                    <p className="text-base font-semibold text-foreground">{ordinal ?? "—"}</p>
                    {first && (
                      <p className="text-[11px] text-muted-foreground">
                        {hhmm(first.start_time)} – {hhmm(first.end_time)}
                      </p>
                    )}
                  </td>
                  {days.map((d, i) => {
                    const pd = slots[i];
                    if (!pd) return <td key={d} className="border-l border-border p-1" />;
                    if (pd.period_type === "break") {
                      return (
                        <td key={d} className="border-l border-border p-1">
                          <div className="rounded-lg bg-muted px-1.5 py-3 text-center text-muted-foreground">{pd.label}</div>
                        </td>
                      );
                    }
                    const c = cell(d, no);
                    return (
                      <td key={d} className="border-l border-border p-1">
                        {c ? (
                          card(c)
                        ) : others(d, no).length > 0 ? (
                          <div className="space-y-1">{others(d, no)}</div>
                        ) : (
                          <div aria-disabled="true" className={cn("min-h-[4.25rem] rounded-lg bg-muted/60", !live.has(d) && "opacity-60")} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
