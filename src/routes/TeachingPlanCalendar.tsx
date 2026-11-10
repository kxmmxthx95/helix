import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack, ChevronForward } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { PlanMonthGrid } from "@/components/PlanMonthGrid";
import { PlanWeekGrid } from "@/components/PlanWeekGrid";
import { PlanProgress, useAssignmentLabel } from "@/components/TeachingPlanParts";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Spinner } from "@/components/ui";
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
      <div className="shrink-0 space-y-2">
        <Link to="/teaching-plan?tab=mine" className="inline-flex items-center gap-1 text-xs text-accent">
          <ChevronBack className="h-3 w-3" /> ทุกวิชา
        </Link>
        <div>
          <p className="text-xs text-muted-foreground">
            {info.code}
            {info.learningArea && ` · ${info.learningArea}`} · {info.where}
          </p>
          <h2 className="text-lg font-semibold leading-snug">{info.name}</h2>
          <PlanProgress stats={stats} className="mt-1" />
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
              <div className="ml-auto flex gap-1 rounded-xl bg-fill p-1 max-sm:hidden" role="radiogroup" aria-label="มุมมอง">
                {(["week", "month"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={view === v}
                    onClick={() => setView(v)}
                    className={cn("h-7 rounded-lg px-3 text-xs font-medium transition-colors", view === v ? "bg-card shadow-sm" : "text-muted-foreground")}
                  >
                    {v === "week" ? "สัปดาห์" : "เดือน"}
                  </button>
                ))}
              </div>
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
        <div className="space-y-1.5">
          {topics.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีผังการเรียนของวิชานี้ (ชื่อวิชาต้องขึ้นต้นด้วยชื่อวิชาในผังการเรียน) และระดับชั้นนี้</p>}
          <LessonCards topics={topics}>
            {(t) => {
              const n = countOf(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setArmed(t);
                    setTopicsOpen(false);
                  }}
                  className={cn("block w-full rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted/60", n === 0 ? "border-warning/50" : "border-border")}
                >
                  <p className="font-medium leading-snug">{t.title}</p>
                  <p className={cn("text-xs", n === 0 ? "text-warning" : "text-muted-foreground")}>{n === 0 ? "ยังไม่ได้วาง" : `${n} คาบ`}</p>
                </button>
              );
            }}
          </LessonCards>
        </div>
      </Sheet>

      {picked && !readOnly && (
        <SlotSheet
          key={`${picked.date}#${picked.periodNo}`}
          assignmentId={assignment.id}
          cell={picked}
          slot={slotAt(picked)}
          topics={topics}
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
  onClose,
}: {
  assignmentId: string;
  cell: SlotCell;
  slot: TeachingPlanSlot | undefined;
  topics: PlanTopicItem[];
  onClose: () => void;
}) {
  const toast = useToast();
  const place = usePlaceTopic();
  const clear = useClearSlot();
  const key = { teaching_assignment_id: assignmentId, slot_date: cell.date, period_no: cell.periodNo };
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error");
  const busy = place.isPending || clear.isPending;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${DAY[cell.dayOfWeek]} ${fmt(cell.date)} · คาบ ${cell.periodNo}`}
      bottomOnPhone
      closable
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">เลือกหัวข้อ</p>
          {topics.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีผังการเรียนของวิชานี้ในระดับชั้นนี้</p>}
          <LessonCards topics={topics} openId={slot?.topic_id}>
            {(t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => place.mutate({ ...key, topic_id: t.id }, { onSuccess: onClose, onError: fail })}
                className={cn(
                  "block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/60",
                  slot?.topic_id === t.id ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border",
                )}
              >
                {t.title}
              </button>
            )}
          </LessonCards>
          {slot && (
            <Button variant="outline" disabled={busy} onClick={() => clear.mutate(slot.id, { onSuccess: onClose, onError: fail })}>
              ล้างช่องนี้
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// Lesson = main card; tap to reveal its topics (native <details>, no state).
function LessonCards({
  topics,
  openId,
  children,
}: {
  topics: PlanTopicItem[];
  openId?: string | null;
  children: (t: PlanTopicItem) => ReactNode;
}) {
  return (
    <>
      {groupByLesson(topics).map(([lesson, items]) => (
        <details key={lesson} open={items.some((t) => t.id === openId)} className="group rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-semibold leading-snug">{lesson}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {items.length} หัวข้อ
              <ChevronForward className="h-3 w-3 transition-transform group-open:rotate-90" />
            </span>
          </summary>
          <div className="space-y-1.5 px-2 pb-2">{items.map(children)}</div>
        </details>
      ))}
    </>
  );
}
