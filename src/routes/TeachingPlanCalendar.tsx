import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { usePlanSubjects } from "@/hooks/usePlan";
import { useAuth } from "@/auth/AuthProvider";
import { CheckmarkCircleIcon, ChevronBack, ChevronForward, Search } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { type DragPoint, type MarkedPoints, PlanMonthGrid, type PlanLook, type PlanOther, placedTopics, pointKey } from "@/components/PlanMonthGrid";
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { PlanWeekGrid } from "@/components/PlanWeekGrid";
import { useAssignmentLabel } from "@/components/TeachingPlanParts";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, FormSection, Input, Select, Spinner, Switch } from "@/components/ui";
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
  useScheduleEntriesForAssignments,
  useSetPlanLink,
  usePlaceTopic,
  useRemoveTopic,
  usePlanTopics,
  type PlanTopicItem,
  useTeachingPlanSlots,
} from "@/hooks/useTeachingPlanSlots";
import type { TeachingAssignment } from "@/lib/database.types";
import { mergePeriods, withTimes } from "@/lib/periods";
import { addDays, computeSlots, eventApplies, isoDow, type SlotCell, termRange, weekStart } from "@/lib/planSlots";
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
  const { data: planSubjects = [] } = usePlanSubjects(departmentId);
  const styling = useTimetableStyling(subjects, classrooms, gradeLevels);
  const subjectName = subjects.find((x) => x.id === assignment?.subject_id)?.name_th ?? null;
  const { data: topics = [] } = usePlanTopics(departmentId, found?.gradeLevelId ?? null, subjectName, assignment?.subject_id ?? null);
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
  const [pickedOther, setPickedOther] = useState<PlanOther | null>(null); // a linked subject's period
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [search] = useSearchParams();
  const [mergeOpen, setMergeOpen] = useState(search.get("merge") === "1");
  const { data: myAssignments = [] } = useMyTeachingAssignments(me?.id ?? null);
  const linkedIds = useMemo(
    () =>
      assignment?.plan_group_id
        ? myAssignments.filter((a) => a.id !== assignment.id && a.plan_group_id === assignment.plan_group_id).map((a) => a.id)
        : [],
    [assignment, myAssignments],
  );
  const { data: linkedEntries = [] } = useScheduleEntriesForAssignments(linkedIds);
  const { data: linkedSlots = [] } = useTeachingPlanSlots(linkedIds);
  const [armed, setArmed] = useState<PlanTopicItem | null>(null); // topic chosen in the drawer, placed on the next tapped cell
  const [multi, setMulti] = useState(false); // multi-place: taps tick periods, one button places the armed topic in all
  const [marked, setMarked] = useState<MarkedPoints>(new Map());
  const endArm = () => {
    setArmed(null);
    setMulti(false);
    setMarked(new Map());
  };
  const toggleMark = (pt: DragPoint) =>
    setMarked((m) => {
      const n = new Map(m);
      if (!n.delete(pointKey(pt))) n.set(pointKey(pt), pt);
      return n;
    });

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

  // Timetable-card look (stripe colour, badges) of an assignment.
  const lookOf = (a: TeachingAssignment): PlanLook => {
    const room = classrooms.find((c) => c.id === a.classroom_id);
    const gradeCode = gradeLevels.find((g) => g.id === room?.grade_level_id)?.code;
    const gradeLabel = room ? `${gradeCode ? gradeShortLabel(gradeCode) : "—"}/${room.name}` : "—";
    return {
      tone: styling.color(a.subject_id, a.classroom_id),
      code: subjects.find((x) => x.id === a.subject_id)?.code ?? "—",
      grade: { label: gradeLabel, className: levelTone(gradeLabel) },
      badge: { className: styling.typeBadge(a.subject_id), title: styling.typeLabel(a.subject_id) },
    };
  };

  // Periods of linked subjects where this subject has none (this term's slot rule, per linked subject).
  const othersByDate = useMemo(() => {
    const out = new Map<string, PlanOther[]>();
    if (!range || linkedIds.length === 0) return out;
    const own = new Set(cells.map((c) => `${c.date}#${c.periodNo}`));
    for (const id of linkedIds) {
      const m = myAssignments.find((a) => a.id === id);
      if (!m) continue;
      const entries = linkedEntries.filter((e) => e.teaching_assignment_id === id);
      for (const c of computeSlots(range, withTimes(entries, periods, found?.gradeLevelId ?? null), deptEvents)) {
        if (own.has(`${c.date}#${c.periodNo}`)) continue;
        const sl = linkedSlots.find((s) => s.teaching_assignment_id === id && s.slot_date === c.date && s.period_no === c.periodNo);
        out.set(c.date, [
          ...(out.get(c.date) ?? []),
          {
            id: `${id}#${c.date}#${c.periodNo}`,
            assignmentId: id,
            date: c.date,
            periodNo: c.periodNo,
            code: label(m).code,
            title: `${label(m).name} · ${label(m).grade}/${label(m).room}`,
            topics: placedTopics(topics, sl),
            taught: sl?.completed_at != null,
            look: lookOf(m),
          },
        ]);
      }
    }
    return out;
  }, [range, linkedIds, linkedEntries, linkedSlots, cells, deptEvents, myAssignments, topics, label, periods, found?.gradeLevelId]);

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
  // Link candidates: same grade and a shared ผังการเรียน subject (name prefix, like the DB trigger).
  const planIds = (subjectId: string) => {
    const n = subjects.find((x) => x.id === subjectId)?.name_th.trim() ?? "";
    return planSubjects.filter((p) => n.startsWith(p.name.trim())).map((p) => p.id);
  };
  const gradeOf = (a: TeachingAssignment) => classrooms.find((c) => c.id === a.classroom_id)?.grade_level_id;
  const mine = planIds(assignment.subject_id);
  const mates = myAssignments.filter(
    (a) => a.id !== assignment.id && gradeOf(a) === gradeOf(assignment) && planIds(a.subject_id).some((id) => mine.includes(id)),
  );
  const readOnly = assignment.teacher_id !== me.id;
  const look = lookOf(assignment);
  // Linked subjects that also meet on this date + period (same rule the DB mirror uses).
  const linkedAt = (c: { date: string; periodNo: number }) =>
    linkedEntries
      .filter((e) => e.period_no === c.periodNo && e.day_of_week === isoDow(c.date))
      .flatMap((e) => {
        const m = myAssignments.find((a) => a.id === e.teaching_assignment_id);
        return m ? [{ code: label(m).code, title: `${label(m).name} · ${label(m).grade}/${label(m).room}` }] : [];
      });
  const othersOnDate = (date: string) => othersByDate.get(date) ?? [];
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

  // A linked subject's period: edits go to that assignment (the DB mirrors them back here when it meets).
  function openOther(o: PlanOther) {
    if (!armed) return setPickedOther(o);
    if (multi) return o.taught ? undefined : toggleMark({ assignmentId: o.assignmentId, date: o.date, periodNo: o.periodNo });
    place.mutate(
      {
        teaching_assignment_id: o.assignmentId,
        slot_date: o.date,
        period_no: o.periodNo,
        topic_id: armed.id,
        position: linkedSlots.find((s) => s.teaching_assignment_id === o.assignmentId && s.slot_date === o.date && s.period_no === o.periodNo)?.topic_ids.length ?? 0,
      },
      { onError: (e) => toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error") },
    );
  }

  // Drag & drop: move a period's topics to another period (append), then clear the source. Works across linked subjects (topics are shared in the plan group).
  async function moveSlot(from: DragPoint, to: DragPoint) {
    const find = (pt: DragPoint) =>
      [...slots, ...linkedSlots].find((s) => s.teaching_assignment_id === pt.assignmentId && s.slot_date === pt.date && s.period_no === pt.periodNo);
    const src = find(from);
    if (!src || src.completed_at || src.topic_ids.length === 0) return;
    const base = find(to)?.topic_ids.length ?? 0;
    try {
      for (const [i, topic_id] of src.topic_ids.entries()) {
        await place.mutateAsync({ teaching_assignment_id: to.assignmentId, slot_date: to.date, period_no: to.periodNo, topic_id, position: base + i });
      }
      await clearSlot.mutateAsync(src.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "ย้ายไม่สำเร็จ", "error");
    }
  }

  // Multi-place: put the armed topic in every ticked period (appended); failures stay ticked for a retry.
  async function placeMarked() {
    if (!armed) return;
    const failed = new Map(marked);
    let err: unknown = null;
    for (const [key, pt] of marked) {
      const cur = [...slots, ...linkedSlots].find((x) => x.teaching_assignment_id === pt.assignmentId && x.slot_date === pt.date && x.period_no === pt.periodNo);
      try {
        if (!cur?.topic_ids.includes(armed.id)) {
          await place.mutateAsync({ teaching_assignment_id: pt.assignmentId, slot_date: pt.date, period_no: pt.periodNo, topic_id: armed.id, position: cur?.topic_ids.length ?? 0 });
        }
        failed.delete(key);
      } catch (e) {
        err = e;
      }
    }
    setMarked(failed);
    if (err) toast(`วางไม่สำเร็จ ${failed.size} ช่อง${err instanceof Error ? `: ${err.message}` : ""}`, "error");
  }

  function openCell(cell: SlotCell) {
    if (!armed) return setPicked(cell);
    if (multi) return slotAt(cell)?.completed_at ? undefined : toggleMark({ assignmentId: assignment!.id, date: cell.date, periodNo: cell.periodNo });
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
    <div className="page-fill gap-4">
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
          <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto">
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
                <Button size="sm" variant="outline" className="max-sm:ml-auto" onClick={() => setMergeOpen(true)}>
                  รวมแผน
                </Button>
              )}
              {!readOnly && (
                <Button size="sm" onClick={() => setTopicsOpen(true)}>
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
                linkedAt={linkedAt}
                othersOnDate={othersOnDate}
                onOpenOther={openOther}
                topics={topics}
                look={look}
                today={today()}
                readOnly={readOnly}
                onOpen={openCell}
                assignmentId={assignment.id}
                marked={marked}
                onMove={moveSlot}
              />
            ) : (
              <PlanMonthGrid
                month={month}
                periods={periods}
                cells={cells}
                closed={closed}
                slotAt={slotAt}
                linkedAt={linkedAt}
                othersOnDate={othersOnDate}
                onOpenOther={openOther}
                topics={topics}
                look={look}
                today={today()}
                readOnly={readOnly}
                onOpen={openCell}
                assignmentId={assignment.id}
                marked={marked}
                onMove={moveSlot}
              />
            )}
          </div>
        </div>
      )}

      {armed && (
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {multi ? "แตะช่องเพื่อติ๊ก" : "แตะช่องในปฏิทินเพื่อวาง"}: <b>{armed.title}</b>
          </span>
          <Button
            size="sm"
            variant={multi ? "default" : "outline"}
            aria-pressed={multi}
            onClick={() => {
              setMulti((v) => !v);
              setMarked(new Map());
            }}
          >
            เลือกหลายช่อง
          </Button>
          {multi && (
            <Button size="sm" variant="accent" disabled={marked.size === 0 || place.isPending} onClick={() => void placeMarked()}>
              วาง {marked.size} ช่อง
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={endArm}>
            เสร็จ
          </Button>
        </div>
      )}

      <Sheet open={topicsOpen} onOpenChange={setTopicsOpen} title="หัวข้อ" description="เลือกหัวข้อ แล้วแตะช่องในปฏิทินเพื่อวาง" closable bottomOnPhone>
        <div className="space-y-3">
          {armed && (
            <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card py-2.5 pl-4 pr-3 shadow-sm">
              <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", styling.color(assignment.subject_id, assignment.classroom_id))} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">หัวข้อที่เลือกไว้</p>
                <p className="truncate text-sm font-semibold">{armed.title}</p>
              </div>
              <Button size="sm" variant="outline" onClick={endArm}>
                ยกเลิก
              </Button>
            </div>
          )}
          <TopicPicker
            topics={topics}
            countOf={countOf}
            selectedIds={armed ? [armed.id] : []}
            emptyText="ยังไม่มีผังการเรียนของวิชานี้ในระดับชั้นนี้ (ผูกวิชาที่บทเรียนในผังการเรียน หรือตั้งชื่อวิชาให้ขึ้นต้นด้วยชื่อวิชาในผัง)"
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
          mates={mates}
          label={label}
          onClose={() => setMergeOpen(false)}
        />
      )}

      {pickedOther && !readOnly && (
        <SlotSheet
          key={pickedOther.id}
          assignmentId={pickedOther.assignmentId}
          cell={{ date: pickedOther.date, dayOfWeek: isoDow(pickedOther.date), periodNo: pickedOther.periodNo }}
          slot={linkedSlots.find(
            (s) => s.teaching_assignment_id === pickedOther.assignmentId && s.slot_date === pickedOther.date && s.period_no === pickedOther.periodNo,
          )}
          suffix={pickedOther.code}
          topics={topics}
          countOf={(id) => linkedSlots.filter((s) => s.teaching_assignment_id === pickedOther.assignmentId && s.topic_ids.includes(id)).length}
          tone={(() => {
            const m = myAssignments.find((a) => a.id === pickedOther.assignmentId);
            return m ? styling.color(m.subject_id, m.classroom_id) : "bg-muted";
          })()}
          onClose={() => setPickedOther(null)}
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

// รวมแผน: tick the other rooms of this subject to link with. Linked rooms mirror each other's
// topic placement (migration 0169); un-ticking a linked room unlinks it (its topics stay).
function MergePlanSheet({
  source,
  mates,
  label,
  onClose,
}: {
  source: TeachingAssignment;
  mates: TeachingAssignment[];
  label: ReturnType<typeof useAssignmentLabel>;
  onClose: () => void;
}) {
  const toast = useToast();
  const link = useSetPlanLink();
  const [on, setOn] = useState<Set<string>>(
    () => new Set(mates.filter((m) => source.plan_group_id && m.plan_group_id === source.plan_group_id).map((m) => m.id)),
  );

  function run() {
    link.mutate(
      { source: source.id, mates: [...on] },
      {
        onSuccess: ([r]) => {
          toast(on.size === 0 ? "เลิกรวมแผนแล้ว" : `รวมแผนแล้ว${r && r.copied > 0 ? `: คัดลอก ${r.copied} หัวข้อ` : ""}`);
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
      bottomOnPhone
      closable
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="ml-auto" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={link.isPending} onClick={run}>
            {link.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {mates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            ไม่มีวิชาอื่นให้รวม (รวมได้เฉพาะวิชาที่คุณสอน ชั้นเดียวกัน และใช้ผังการเรียนเดียวกัน เช่น คณิตพื้นฐาน + คณิตเพิ่มเติม)
          </p>
        ) : (
          <FormSection title="เลือกวิชาที่จะรวมแผน">
            {mates.map((m) => {
              const info = label(m);
              return (
                <div key={m.id} className="flex items-center justify-between gap-4 text-sm leading-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{info.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{info.code}</span> · {info.grade}/{info.room}
                    </p>
                  </div>
                  <Switch
                    size="xs"
                    checked={on.has(m.id)}
                    label={`${info.name} ${info.grade}/${info.room}`}
                    onChange={(v) =>
                      setOn((o) => {
                        const n = new Set(o);
                        if (v) n.add(m.id);
                        else n.delete(m.id);
                        return n;
                      })
                    }
                  />
                </div>
              );
            })}
          </FormSection>
        )}
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
  suffix,
  onClose,
}: {
  assignmentId: string;
  cell: SlotCell;
  slot: PlanSlot | undefined;
  topics: PlanTopicItem[];
  countOf: (topicId: string) => number;
  /** Subject stripe colour (same as the timetable cards). */
  tone: string;
  /** Which subject this period belongs to (shown for a linked subject's period). */
  suffix?: string;
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
      title={`${DAY[cell.dayOfWeek]} ${fmt(cell.date)} · คาบ ${cell.periodNo}${suffix ? ` · ${suffix}` : ""}`}
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
                  "flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors active:bg-muted",
                  on ? "font-semibold text-accent" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1 leading-snug">{t.title}</span>
                {on ? (
                  <CheckmarkCircleIcon className="h-5 w-5 shrink-0 text-accent" aria-label="เลือกอยู่" />
                ) : (
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      n === 0 ? "text-muted-foreground/70" : "font-medium text-success",
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
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug">{lesson}</span>
                {placed !== null && (
                  <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-secondary">
                    <span className="block h-full rounded-full bg-success" style={{ width: `${(placed / items.length) * 100}%` }} />
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("tabular-nums", placed === items.length && "text-success")}>
                  {placed === null ? `${items.length} หัวข้อ` : `${placed}/${items.length}`}
                </span>
                <ChevronForward className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              </span>
            </summary>
            <div className="divide-y divide-border/60 border-t border-border px-1.5">{items.map(children)}</div>
          </details>
        );
      })}
    </>
  );
}
