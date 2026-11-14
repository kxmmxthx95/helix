import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { CheckmarkCircleIcon, ChevronBack, ChevronForward, Search } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { PlanMonthGrid } from "@/components/PlanMonthGrid";
import { PlanWeekGrid } from "@/components/PlanWeekGrid";
import { useAssignmentLabel } from "@/components/TeachingPlanParts";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { useAcademicEvents, useAllAcademicTerms } from "@/hooks/useAcademicTerms";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartmentPeriods, usePeriodsForGrade } from "@/hooks/usePeriodDefinitions";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import {
  groupByLesson,
  slotStats,
  useAssignmentScheduleEntries,
  useClearSlot,
  usePlaceTopic,
  usePlanTopics,
  type PlanTopicItem,
  useTeachingPlanSlots,
} from "@/hooks/useTeachingPlanSlots";
import type { TeachingAssignment, TeachingPlanSlot } from "@/lib/database.types";
import { mergePeriods } from "@/lib/periods";
import { addDays, computeSlots, type SlotCell, termRange, weekStart } from "@/lib/planSlots";
import { supabase } from "@/lib/supabase";
import { useTimetableStyling } from "@/routes/Timetable";
import { cn } from "@/lib/utils";

const DAY = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);

function useAssignment(id: string | undefined) {
  return useQuery({
    queryKey: ["teaching_assignments", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teaching_assignments")
        .select("*, classroom:classrooms!inner(grade_level_id, grade_level:grade_levels!inner(department_id))")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { classroom, ...assignment } = data as unknown as TeachingAssignment & {
        classroom: { grade_level_id: string; grade_level: { department_id: string } };
      };
      return {
        assignment: assignment as TeachingAssignment,
        departmentId: classroom.grade_level.department_id,
        gradeLevelId: classroom.grade_level_id,
      };
    },
  });
}

export function TeachingPlanCalendar() {
  const { assignmentId } = useParams();
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: found, isLoading } = useAssignment(assignmentId);
  const assignment = found?.assignment;
  const departmentId = found?.departmentId ?? null;
  const { data: defaultPeriods = [] } = useDepartmentPeriods(departmentId);
  const { data: gradePeriods = [] } = usePeriodsForGrade(departmentId, found?.gradeLevelId ?? null);
  const periods = useMemo(() => mergePeriods(defaultPeriods, gradePeriods), [defaultPeriods, gradePeriods]);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId: departmentId ?? "",
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const styling = useTimetableStyling(subjects, classrooms, gradeLevels);
  const subjectName = subjects.find((x) => x.id === assignment?.subject_id)?.name_th ?? null;
  const { data: topics = [] } = usePlanTopics(departmentId, found?.gradeLevelId ?? null, subjectName);
  const label = useAssignmentLabel(departmentId);
  const { data: terms = [] } = useAllAcademicTerms();
  const { data: events = [] } = useAcademicEvents();
  const { data: entries = [] } = useAssignmentScheduleEntries(assignmentId ?? null);
  const ids = useMemo(() => (assignmentId ? [assignmentId] : []), [assignmentId]);
  const { data: slots = [] } = useTeachingPlanSlots(ids);
  const place = usePlaceTopic();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today); // any date in the shown week/month
  const [picked, setPicked] = useState<SlotCell | null>(null);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [armed, setArmed] = useState<PlanTopicItem | null>(null); // topic chosen in the drawer, placed on the next tapped cell

  const range = assignment ? termRange(terms, assignment, departmentId) : null;
  const deptEvents = useMemo(
    () => events.filter((e) => e.departmentIds.length === 0 || (departmentId && e.departmentIds.includes(departmentId))),
    [events, departmentId],
  );
  const cells = useMemo(() => (range ? computeSlots(range, entries, deptEvents) : []), [range, entries, deptEvents]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!assignment || !me) {
    return <EmptyState title="ไม่พบวิชานี้" description="วิชาอาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึง" />;
  }

  const info = label(assignment);
  const readOnly = assignment.teacher_id !== me.id;
  const slotAt = (c: { date: string; periodNo: number }) =>
    slots.find((s) => s.slot_date === c.date && s.period_no === c.periodNo);
  const stats = slotStats(slots, cells.length);
  const countOf = (topicId: string) => slots.filter((s) => s.topic_id === topicId).length;
  const month = anchor.slice(0, 7);
  const first = `${month}-01`;
  const week = weekStart(anchor);
  const step = (dir: 1 | -1) =>
    setAnchor(view === "week" ? addDays(week, 7 * dir) : dir === 1 ? addDays(first, 31) : addDays(first, -1));
  const closed = (d: string) =>
    deptEvents.find((e) => !e.students_attend && e.start_date <= d && d <= e.end_date)?.name ?? null;
  const closedWeek = (d: string) => (!range || d < range.start || d > range.end ? "นอกภาคเรียน" : closed(d));

  function openCell(cell: SlotCell) {
    if (!armed) return setPicked(cell);
    place.mutate(
      { teaching_assignment_id: assignment!.id, slot_date: cell.date, period_no: cell.periodNo, topic_id: armed.id },
      { onError: (e) => toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error") },
    );
  }

  return (
    <div className="page-fill">
      <div data-slot="plan-banner" className="shrink-0 space-y-1">
        <div className="flex items-center gap-1">
          <Link
            to="/teaching-plan?tab=mine"
            aria-label="กลับ"
            className="-ml-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <ChevronBack className="h-4 w-4" />
          </Link>
          <h2 className="min-w-0 truncate text-xl font-semibold leading-snug">{info.name}</h2>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {(
              [
                [info.code, `font-mono tabular-nums ${styling.outline(assignment.subject_id)}`],
                [info.grade, "border-accent/60 text-accent"],
                [`ห้อง ${info.room}`, "border-warning/60 text-warning"],
                [`${stats.total} คาบ`, "border-border text-muted-foreground"],
              ] as const
            ).map(([t, tone]) => (
              <span key={t} className={cn("inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium", tone)}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {!range ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่กำหนดวันที่ภาคเรียน" description="ให้ผู้ดูแลตั้งวันเริ่ม-สิ้นสุดภาคเรียนก่อน" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="วิชานี้ยังไม่อยู่ในตารางสอน" description="ให้ผู้ดูแลจัดคาบสอนในตารางสอนก่อน" />
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" aria-label="ก่อนหน้า" onClick={() => step(-1)}>
                <ChevronBack className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAnchor(today())}>
                วันนี้
              </Button>
              <Button variant="outline" size="sm" aria-label="ถัดไป" onClick={() => step(1)}>
                <ChevronForward className="h-3 w-3" />
              </Button>
              <span className="text-sm font-medium tabular-nums">
                {view === "month"
                  ? new Date(`${first}T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" })
                  : `${fmt(week)} – ${fmt(addDays(week, 5))}`}
              </span>
              <Select
                className="ml-auto w-auto max-sm:hidden"
                value={view}
                onChange={(e) => setView(e.target.value as "week" | "month")}
                aria-label="มุมมอง"
              >
                <option value="week">สัปดาห์</option>
                <option value="month">เดือน</option>
              </Select>
              {!readOnly && (
                <Button size="sm" className="max-sm:ml-auto" onClick={() => setTopicsOpen(true)}>
                  หัวข้อ
                </Button>
              )}
            </div>

            {view === "week" ? (
              <PlanWeekGrid
                week={week}
                periods={periods}
                cells={cells}
                closed={closedWeek}
                slotAt={slotAt}
                topics={topics}
                gradient={styling.gradient(assignment.subject_id, assignment.classroom_id)}
                today={today()}
                readOnly={readOnly}
                onOpen={openCell}
              />
            ) : (
              <PlanMonthGrid
                month={month}
                periods={periods}
                cells={cells}
                closed={closed}
                slotAt={slotAt}
                topics={topics}
                gradient={styling.gradient(assignment.subject_id, assignment.classroom_id)}
                today={today()}
                readOnly={readOnly}
                onOpen={openCell}
              />
            )}
          </div>
        </div>
      )}

      {armed && (
        <div className="mt-2 flex shrink-0 items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">แตะช่องในปฏิทินเพื่อวาง: <b>{armed.title}</b></span>
          <Button size="sm" variant="outline" onClick={() => setArmed(null)}>
            เสร็จ
          </Button>
        </div>
      )}

      <Sheet open={topicsOpen} onOpenChange={setTopicsOpen} title="หัวข้อ" description="เลือกหัวข้อ แล้วแตะช่องในปฏิทินเพื่อวาง" closable>
        <div className="space-y-3">
          {armed && (
            <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", styling.gradient(assignment.subject_id, assignment.classroom_id))}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] opacity-70">หัวข้อที่เลือกไว้</p>
                <p className="truncate text-sm font-semibold">{armed.title}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setArmed(null)}>
                ยกเลิก
              </Button>
            </div>
          )}
          <TopicPicker
            topics={topics}
            countOf={countOf}
            tone={styling.gradient(assignment.subject_id, assignment.classroom_id)}
            selectedId={armed?.id}
            emptyText="ยังไม่มีผังการเรียนของวิชานี้ (ชื่อวิชาต้องขึ้นต้นด้วยชื่อวิชาในผังการเรียน) และระดับชั้นนี้"
            onPick={(t) => {
              setArmed(t);
              setTopicsOpen(false);
            }}
          />
        </div>
      </Sheet>

      {picked && !readOnly && (
        <SlotSheet
          key={`${picked.date}#${picked.periodNo}`}
          assignmentId={assignment.id}
          cell={picked}
          slot={slotAt(picked)}
          topics={topics}
          countOf={countOf}
          tone={styling.gradient(assignment.subject_id, assignment.classroom_id)}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}

function SlotSheet({
  assignmentId,
  cell,
  slot,
  topics,
  countOf,
  tone,
  onClose,
}: {
  assignmentId: string;
  cell: SlotCell;
  slot: TeachingPlanSlot | undefined;
  topics: PlanTopicItem[];
  countOf: (topicId: string) => number;
  /** Subject area gradient (same as the calendar cards). */
  tone: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const place = usePlaceTopic();
  const clear = useClearSlot();
  const key = { teaching_assignment_id: assignmentId, slot_date: cell.date, period_no: cell.periodNo };
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error");
  const busy = place.isPending || clear.isPending;
  const current = topics.find((t) => t.id === slot?.topic_id);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${DAY[cell.dayOfWeek]} ${fmt(cell.date)} · คาบ ${cell.periodNo}`}
      bottomOnPhone
      closable
    >
      <div className="space-y-3">
        {slot && (
          <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", tone)}>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] opacity-70">หัวข้อที่วางไว้</p>
              <p className="truncate text-sm font-semibold">{current?.title ?? "สอนแล้ว"}</p>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => clear.mutate(slot.id, { onSuccess: onClose, onError: fail })}>
              ลบ
            </Button>
          </div>
        )}

        <TopicPicker
          topics={topics}
          countOf={countOf}
          tone={tone}
          selectedId={slot?.topic_id}
          disabled={busy}
          emptyText="ยังไม่มีผังการเรียนของวิชานี้ในระดับชั้นนี้"
          onPick={(t) => place.mutate({ ...key, topic_id: t.id }, { onSuccess: onClose, onError: fail })}
        />
      </div>
    </Sheet>
  );
}

// Search + lesson accordion + topic rows; shared by the "หัวข้อ" drawer and the per-cell sheet.
function TopicPicker({
  topics,
  countOf,
  tone,
  selectedId,
  disabled,
  emptyText,
  onPick,
}: {
  topics: PlanTopicItem[];
  countOf: (topicId: string) => number;
  tone: string;
  selectedId?: string | null;
  disabled?: boolean;
  emptyText: string;
  onPick: (t: PlanTopicItem) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? topics.filter((t) => `${t.title} ${t.lessonName}`.toLowerCase().includes(needle)) : topics;
  if (topics.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาหัวข้อ" aria-label="ค้นหาหัวข้อ" className="pl-9" />
      </div>
      {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบหัวข้อ</p>}
      <div className="space-y-1.5">
        <LessonCards topics={shown} openId={selectedId} forceOpen={!!needle} countOf={countOf}>
          {(t) => {
            const on = selectedId === t.id;
            const n = countOf(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onPick(t)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors active:bg-muted",
                  on ? cn(tone, "font-semibold") : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1 leading-snug">{t.title}</span>
                {on ? (
                  <CheckmarkCircleIcon className="h-5 w-5 shrink-0" aria-label="เลือกอยู่" />
                ) : (
                  <span className={cn("shrink-0 text-xs tabular-nums", n === 0 ? "text-warning" : "text-muted-foreground")}>
                    {n === 0 ? "ยังไม่วาง" : `วางแล้ว ${n} คาบ`}
                  </span>
                )}
              </button>
            );
          }}
        </LessonCards>
      </div>
    </div>
  );
}

// Lesson = main card; tap to reveal its topics (native <details>, no state).
function LessonCards({
  topics,
  openId,
  forceOpen,
  countOf,
  children,
}: {
  topics: PlanTopicItem[];
  openId?: string | null;
  forceOpen?: boolean;
  countOf?: (topicId: string) => number;
  children: (t: PlanTopicItem) => ReactNode;
}) {
  const group = useId(); // same `name` = native exclusive accordion: opening a lesson closes the others
  return (
    <>
      {groupByLesson(topics).map(([lesson, items]) => {
        const placed = countOf ? items.filter((t) => countOf(t.id) > 0).length : null;
        return (
          <details key={lesson} name={forceOpen ? undefined : group} open={forceOpen || items.some((t) => t.id === openId)} className="group rounded-xl border border-border bg-card">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-base font-semibold leading-snug">{lesson}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <span className={cn("tabular-nums", placed === items.length && "text-success")}>
                  {placed === null ? `${items.length} หัวข้อ` : `วางแล้ว ${placed}/${items.length}`}
                </span>
                <ChevronForward className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              </span>
            </summary>
            <div className="space-y-0.5 px-1.5 pb-1.5">{items.map(children)}</div>
          </details>
        );
      })}
    </>
  );
}
