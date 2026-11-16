import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { CheckmarkCircleIcon, ChevronBack, ChevronForward, Search } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { PlanMonthGrid, type PlanLook, placedTopics } from "@/components/PlanMonthGrid";
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { PlanWeekGrid } from "@/components/PlanWeekGrid";
import { useAssignmentLabel } from "@/components/TeachingPlanParts";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { useAcademicEvents, useAllAcademicTerms } from "@/hooks/useAcademicTerms";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartmentPeriods, usePeriodsForGrade } from "@/hooks/usePeriodDefinitions";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import {
  groupByLesson,
  slotStats,
  useAssignmentScheduleEntries,
  type PlanSlot,
  useClearSlot,
  useCopyPlanToGroup,
  usePlaceTopic,
  useRemoveTopic,
  usePlanTopics,
  type PlanTopicItem,
  useTeachingPlanSlots,
} from "@/hooks/useTeachingPlanSlots";
import type { TeachingAssignment } from "@/lib/database.types";
import { mergePeriods, withTimes } from "@/lib/periods";
import { addDays, computeSlots, copyPreview, eventApplies, type SlotCell, termRange, weekStart } from "@/lib/planSlots";
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
  const clearSlot = useClearSlot();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today); // any date in the shown week/month
  const [picked, setPicked] = useState<SlotCell | null>(null);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const { data: myAssignments = [] } = useMyTeachingAssignments(me?.id ?? null);
  const [armed, setArmed] = useState<PlanTopicItem | null>(null); // topic chosen in the drawer, placed on the next tapped cell

  const range = assignment ? termRange(terms, assignment, departmentId) : null;
  const deptEvents = useMemo(
    () => events.filter((e) => eventApplies(e, departmentId, found?.gradeLevelId ?? null)),
    [events, departmentId, found?.gradeLevelId],
  );
  const cells = useMemo(
    () => (range ? computeSlots(range, withTimes(entries, periods, found?.gradeLevelId ?? null), deptEvents) : []),
    [range, entries, periods, deptEvents, found?.gradeLevelId],
  );
  // Topics placed on a period that is no longer a lesson (a later holiday / replacing activity) — kept, but flagged for re-placing.
  const orphans = useMemo(() => {
    const live = new Set(cells.map((c) => `${c.date}#${c.periodNo}`));
    return slots.filter((s) => s.topic_ids.length > 0 && !s.completed_at && !live.has(`${s.slot_date}#${s.period_no}`));
  }, [slots, cells]);

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
  const mates = assignment.group_id
    ? myAssignments.filter((a) => a.id !== assignment.id && a.group_id === assignment.group_id)
    : [];
  const readOnly = assignment.teacher_id !== me.id;
  const room = classrooms.find((c) => c.id === assignment.classroom_id);
  const gradeCode = gradeLevels.find((g) => g.id === room?.grade_level_id)?.code;
  const gradeLabel = room ? `${gradeCode ? gradeShortLabel(gradeCode) : "—"}/${room.name}` : "—";
  const look: PlanLook = {
    tone: styling.color(assignment.subject_id, assignment.classroom_id),
    code: subjects.find((x) => x.id === assignment.subject_id)?.code ?? "—",
    grade: { label: gradeLabel, className: levelTone(gradeLabel) },
    badge: { className: styling.typeBadge(assignment.subject_id), title: styling.typeLabel(assignment.subject_id) },
  };
  const slotAt = (c: { date: string; periodNo: number }) =>
    slots.find((s) => s.slot_date === c.date && s.period_no === c.periodNo);
  const stats = slotStats(slots, cells.length);
  const countOf = (topicId: string) => slots.filter((s) => s.topic_ids.includes(topicId)).length;
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
      {
        teaching_assignment_id: assignment!.id,
        slot_date: cell.date,
        period_no: cell.periodNo,
        topic_id: armed.id,
        position: slotAt(cell)?.topic_ids.length ?? 0,
      },
      { onError: (e) => toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error") },
    );
  }

  return (
    <div className="page-fill gap-3">
      <div data-slot="plan-banner" className="shrink-0">
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
        <div className="flex min-h-0 flex-1 flex-col">
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
              {!readOnly && mates.length > 0 && (
                <Button size="sm" variant="outline" className="max-sm:ml-auto" onClick={() => setMergeOpen(true)}>
                  รวมแผน
                </Button>
              )}
              {!readOnly && (
                <Button size="sm" className={cn(mates.length === 0 && "max-sm:ml-auto")} onClick={() => setTopicsOpen(true)}>
                  หัวข้อ
                </Button>
              )}
            </div>

            {!readOnly && orphans.length > 0 && (
              <div className="space-y-1.5 rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning">
                <p className="font-medium">มี {orphans.length} คาบที่วางหัวข้อไว้ แต่ตอนนี้ไม่มีเรียน (ถูกกิจกรรม/วันหยุดแทน) — ล้างช่องแล้ววางใหม่</p>
                {orphans.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {fmt(o.slot_date)} คาบ {o.period_no}
                    </span>
                    <Button size="sm" variant="outline" disabled={clearSlot.isPending} onClick={() => clearSlot.mutate(o.id)}>
                      ล้างช่อง
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {view === "week" ? (
              <PlanWeekGrid
                week={week}
                periods={periods}
                cells={cells}
                closed={closedWeek}
                slotAt={slotAt}
                topics={topics}
                look={look}
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
                look={look}
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
            <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card py-2.5 pl-4 pr-3 shadow-sm">
              <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", styling.color(assignment.subject_id, assignment.classroom_id))} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">หัวข้อที่เลือกไว้</p>
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
            selectedIds={armed ? [armed.id] : []}
            emptyText="ยังไม่มีผังการเรียนของวิชานี้ (ชื่อวิชาต้องขึ้นต้นด้วยชื่อวิชาในผังการเรียน) และระดับชั้นนี้"
            onPick={(t) => {
              setArmed(t);
              setTopicsOpen(false);
            }}
          />
        </div>
      </Sheet>

      {mergeOpen && (
        <MergePlanSheet
          source={assignment}
          sourceSlots={slots}
          mates={mates}
          departmentId={departmentId}
          subjects={subjects}
          classrooms={classrooms}
          label={label}
          onClose={() => setMergeOpen(false)}
        />
      )}

      {picked && !readOnly && (
        <SlotSheet
          key={`${picked.date}#${picked.periodNo}`}
          assignmentId={assignment.id}
          cell={picked}
          slot={slotAt(picked)}
          topics={topics}
          countOf={countOf}
          tone={styling.color(assignment.subject_id, assignment.classroom_id)}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}

type MateProps = {
  mate: TeachingAssignment;
  sourceSlots: PlanSlot[];
  departmentId: string | null;
  subjects: { id: string; name_th: string }[];
  classrooms: { id: string; grade_level_id: string }[];
  label: ReturnType<typeof useAssignmentLabel>;
  checked: boolean;
  onToggle: (on: boolean) => void;
};

// One group mate: preview (same rules as the SQL copy) and a checkbox, disabled when nothing would be copied.
function MateRow({ mate, sourceSlots, departmentId, subjects, classrooms, label, checked, onToggle }: MateProps) {
  const gradeId = classrooms.find((c) => c.id === mate.classroom_id)?.grade_level_id ?? null;
  const subjectName = subjects.find((x) => x.id === mate.subject_id)?.name_th ?? null;
  const { data: topics = [], isLoading: l1 } = usePlanTopics(departmentId, gradeId, subjectName);
  const { data: slots = [], isLoading: l2 } = useTeachingPlanSlots([mate.id]);
  const { data: entries = [], isLoading: l3 } = useAssignmentScheduleEntries(mate.id);
  const info = label(mate);
  const preview = useMemo(
    () => copyPreview(sourceSlots, slots, entries, new Set(topics.map((t) => t.id))),
    [sourceSlots, slots, entries, topics],
  );
  const loading = l1 || l2 || l3;
  const none = !loading && preview.copied === 0;
  return (
    <label className={cn("flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5", none && "opacity-60")}>
      <input
        type="checkbox"
        className="size-4"
        checked={checked && !none}
        disabled={loading || none}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {info.name} · {info.grade}/{info.room}
        </p>
        <p className="text-xs text-muted-foreground">
          {loading
            ? "กำลังตรวจ…"
            : none
              ? preview.skipped > 0
                ? "คัดลอกไม่ได้ (ผังการเรียนไม่ตรง / คาบไม่ตรง / มีหัวข้อแล้ว)"
                : "ต้นทางยังไม่มีหัวข้อ"
              : `คัดลอกได้ ${preview.copied} หัวข้อ · ข้าม ${preview.skipped}`}
        </p>
      </div>
    </label>
  );
}

function MergePlanSheet({
  source,
  sourceSlots,
  mates,
  departmentId,
  subjects,
  classrooms,
  label,
  onClose,
}: {
  source: TeachingAssignment;
  sourceSlots: PlanSlot[];
  mates: TeachingAssignment[];
  departmentId: string | null;
  subjects: { id: string; name_th: string }[];
  classrooms: { id: string; grade_level_id: string }[];
  label: ReturnType<typeof useAssignmentLabel>;
  onClose: () => void;
}) {
  const toast = useToast();
  const copy = useCopyPlanToGroup();
  const [off, setOff] = useState<Set<string>>(new Set());
  const targets = mates.filter((m) => !off.has(m.id)).map((m) => m.id);
  const mine = sourceSlots.filter((s) => s.teaching_assignment_id === source.id);

  function run() {
    copy.mutate(
      { source: source.id, targets },
      {
        onSuccess: (rows) => {
          const sum = (k: "copied" | "skipped") => rows.reduce((n, r) => n + r[k], 0);
          toast(`รวมแผนแล้ว: คัดลอก ${sum("copied")} หัวข้อ · ข้าม ${sum("skipped")}`);
          onClose();
        },
        onError: (e) => toast(e instanceof Error ? e.message : "รวมแผนไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="รวมแผน"
      description="คัดลอกหัวข้อของวิชานี้ไปยังห้องที่เรียนรวมกัน (ไม่ทับคาบที่มีหัวข้ออยู่แล้ว ไม่คัดลอกสถานะสอนแล้ว)"
      bottomOnPhone
      closable
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="ml-auto" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={targets.length === 0 || copy.isPending} onClick={run}>
            {copy.isPending ? <Spinner className="h-3 w-3" /> : "รวมแผน"}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {mates.map((m) => (
          <MateRow
            key={m.id}
            mate={m}
            sourceSlots={mine}
            departmentId={departmentId}
            subjects={subjects}
            classrooms={classrooms}
            label={label}
            checked={!off.has(m.id)}
            onToggle={(on) =>
              setOff((o) => {
                const n = new Set(o);
                if (on) n.delete(m.id);
                else n.add(m.id);
                return n;
              })
            }
          />
        ))}
      </div>
    </Sheet>
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
  slot: PlanSlot | undefined;
  topics: PlanTopicItem[];
  countOf: (topicId: string) => number;
  /** Subject stripe colour (same as the timetable cards). */
  tone: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const place = usePlaceTopic();
  const remove = useRemoveTopic();
  const clear = useClearSlot();
  const key = { teaching_assignment_id: assignmentId, slot_date: cell.date, period_no: cell.periodNo };
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error");
  const busy = place.isPending || remove.isPending || clear.isPending;
  const current = placedTopics(topics, slot);
  const taught = slot?.completed_at != null;

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
          <div className="relative overflow-hidden rounded-xl border border-border bg-card py-2.5 pl-4 pr-3 shadow-sm">
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", tone)} />
            <p className="text-[11px] text-muted-foreground">หัวข้อที่วางไว้ ({current.length})</p>
            {current.length === 0 && <p className="text-sm font-semibold">สอนแล้ว</p>}
            {current.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <p className="min-w-0 flex-1 py-1 text-sm font-semibold leading-snug">{t.title}</p>
                {!taught && (
                  <Button size="sm" variant="outline" disabled={busy} aria-label={`ลบ ${t.title}`} onClick={() => remove.mutate({ slot, topic_id: t.id }, { onError: fail })}>
                    ลบ
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <TopicPicker
          topics={topics}
          countOf={countOf}
          selectedIds={slot?.topic_ids ?? []}
          disabled={busy || taught}
          emptyText="ยังไม่มีผังการเรียนของวิชานี้ในระดับชั้นนี้"
          onPick={(t) =>
            slot?.topic_ids.includes(t.id)
              ? remove.mutate({ slot, topic_id: t.id }, { onError: fail })
              : place.mutate({ ...key, topic_id: t.id, position: slot?.topic_ids.length ?? 0 }, { onError: fail })
          }
        />
      </div>
    </Sheet>
  );
}

// Search + lesson accordion + topic rows; shared by the "หัวข้อ" drawer and the per-cell sheet.
function TopicPicker({
  topics,
  countOf,
  selectedIds,
  disabled,
  emptyText,
  onPick,
}: {
  topics: PlanTopicItem[];
  countOf: (topicId: string) => number;
  selectedIds: string[];
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
        <LessonCards topics={shown} openIds={selectedIds} forceOpen={!!needle} countOf={countOf}>
          {(t) => {
            const on = selectedIds.includes(t.id);
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
                  on ? "bg-card font-semibold ring-2 ring-inset ring-accent" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1 leading-snug">{t.title}</span>
                {on ? (
                  <CheckmarkCircleIcon className="h-5 w-5 shrink-0 text-accent" aria-label="เลือกอยู่" />
                ) : (
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
                      n === 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success",
                    )}
                  >
                    {n === 0 ? "ยังไม่วาง" : `${n} คาบ`}
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
  openIds,
  forceOpen,
  countOf,
  children,
}: {
  topics: PlanTopicItem[];
  openIds?: string[];
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
          <details key={lesson} name={forceOpen ? undefined : group} open={forceOpen || items.some((t) => openIds?.includes(t.id))} className="group rounded-xl border border-border bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{lesson}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {placed !== null && (
                  <span aria-hidden className="h-1 w-10 overflow-hidden rounded-full bg-secondary">
                    <span className="block h-full rounded-full bg-success" style={{ width: `${(placed / items.length) * 100}%` }} />
                  </span>
                )}
                <span className={cn("tabular-nums", placed === items.length && "text-success")}>
                  {placed === null ? `${items.length} หัวข้อ` : `${placed}/${items.length}`}
                </span>
                <ChevronForward className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              </span>
            </summary>
            <div className="space-y-0.5 border-t border-border px-1.5 py-1.5">{items.map(children)}</div>
          </details>
        );
      })}
    </>
  );
}
