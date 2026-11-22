import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { AppsIcon, ChevronBack, ListIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Avatar, Button, EmptyState, Select, Skeleton, Switch } from "@/components/ui";
import { useClassroomsByIds, useGradeLevelsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import {
  useAssignmentClassrooms,
  useCreateTopicSet,
  useDecideTopicSet,
  useMyTopicSets,
  useSetNoExam,
  useSetTopicSetTopics,
  useSubmitTopicSet,
  useTopicSetQueue,
  useTopicSetsInUse,
  useTopicSetsTopics,
  type ExamTopicLabel,
} from "@/hooks/useExams";
import { avatarUrl } from "@/hooks/useAvatar";
import { useSubjectLinkedLessons } from "@/hooks/usePlan";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { useProfilesByIds } from "@/hooks/usePractice";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { isDeptHead } from "@/lib/roles";
import type { ExamApprovalStatus, ExamTopicSet, Subject, TeachingAssignment } from "@/lib/database.types";
import { cn } from "@/lib/utils";

// ชุดหัวข้อการสอบ (migration 0183): teachers submit a subject + ผังการเรียน topics, heads approve,
// then sessions are opened from an approved set.

const STATUS_LABEL: Record<ExamApprovalStatus, string> = {
  draft: "ร่าง",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};
const STATUS_STYLE: Record<ExamApprovalStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/15 text-[#a35a00] dark:text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

export function ApprovalBadge({ status }: { status: ExamApprovalStatus }) {
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const thDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });

// ============================================================ teacher: หัวข้อการสอบ

export function ExamTopicsTab({ teacherId }: { teacherId: string }) {
  const { data: assignments = [], isLoading: loadingA } = useMyTeachingAssignments(teacherId);
  const { data: sets = [], isLoading: loadingS } = useMyTopicSets(teacherId);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(assignments.map((a) => a.subject_id))]);
  const { data: classrooms = [] } = useClassroomsByIds([...new Set(assignments.map((a) => a.classroom_id))]);
  const { data: topicsBySet } = useTopicSetsTopics(sets.map((s) => s.id));
  const { data: inUse } = useTopicSetsInUse(sets.map((s) => s.id));
  const colors = useSubjectColors([]); // hue from กลุ่มสาระ only, like the period attendance views
  const [picking, setPicking] = useState<string | null>(null);
  const createSet = useCreateTopicSet();
  const setNoExam = useSetNoExam();
  const toast = useToast();

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));
  const { data: grades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);
  const gradeById = new Map(grades.map((g) => [g.id, g]));
  const setByAssignment = new Map(sets.filter((s) => s.teaching_assignment_id).map((s) => [s.teaching_assignment_id!, s]));
  const gradeOf = (classroomId: string) => gradeById.get(classroomById.get(classroomId)?.grade_level_id ?? "");
  const cards = [...assignments]
    .filter((a) => subjectById.has(a.subject_id))
    .sort(
      (x, y) =>
        y.academic_year - x.academic_year ||
        (gradeOf(x.classroom_id)?.sort_order ?? 0) - (gradeOf(y.classroom_id)?.sort_order ?? 0) ||
        (classroomById.get(x.classroom_id)?.name ?? "").localeCompare(classroomById.get(y.classroom_id)?.name ?? "", "th", { numeric: true }) ||
        subjectById.get(x.subject_id)!.code.localeCompare(subjectById.get(y.subject_id)!.code),
    );
  const pickingAssignment = cards.find((a) => a.id === picking) ?? null;

  function toggleNoExam(a: TeachingAssignment, set: ExamTopicSet | undefined, on: boolean) {
    const onError = () => toast("บันทึกไม่สำเร็จ", "error");
    if (set) setNoExam.mutate({ id: set.id, no_exam: on }, { onError });
    else createSet.mutate({ teacher_id: teacherId, subject_id: a.subject_id, teaching_assignment_id: a.id, no_exam: on }, { onError });
  }

  if (loadingA || loadingS) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (cards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ยังไม่มีวิชาที่ได้รับมอบหมาย" description="เมื่อได้รับมอบหมายวิชาสอนแล้ว จะเลือกหัวข้อการสอบได้ที่นี่" />
      </div>
    );
  }

  if (pickingAssignment) {
    const pickedSet = setByAssignment.get(pickingAssignment.id) ?? null;
    return (
      <TopicPickerPage
        teacherId={teacherId}
        assignment={pickingAssignment}
        set={pickedSet}
        subject={subjectById.get(pickingAssignment.subject_id)}
        current={(topicsBySet?.get(pickedSet?.id ?? "") ?? []).map((t) => t.topic_id)}
        onClose={() => setPicking(null)}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      {cards.map((a) => {
        const subject = subjectById.get(a.subject_id)!;
        const set = setByAssignment.get(a.id);
        const noExam = !!set?.no_exam;
        const locked = !!set && !!inUse?.has(set.id);
        const editable = !noExam && !locked && set?.approval_status !== "pending";
        const classroom = classroomById.get(a.classroom_id);
        const grade = classroom ? gradeById.get(classroom.grade_level_id) : undefined;
        const roomLabel = grade ? `${gradeShortLabel(grade.code)}/${classroom?.name}` : (classroom?.name ?? "—");
        return (
          <div
            key={a.id}
            role={editable ? "button" : undefined}
            tabIndex={editable ? 0 : undefined}
            onClick={editable ? () => setPicking(a.id) : undefined}
            onKeyDown={editable ? (e) => e.key === "Enter" && setPicking(a.id) : undefined}
            className={cn(
              "rounded-xl border border-border bg-card p-3 text-xs",
              editable && "cursor-pointer hover:bg-muted active:bg-muted",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-medium", noExam && "text-muted-foreground")}>{subject.name_th}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(subject.learning_area_id))}>{subject.code}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(roomLabel))}>{roomLabel}</span>
                </p>
              </div>
              <label
                className="flex shrink-0 items-center gap-2 text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
                title={locked ? "มีห้องสอบแล้ว" : undefined}
              >
                ไม่มีสอบ
                <Switch
                  size="xs"
                  label={`ไม่มีการสอบ ${subject.name_th}`}
                  checked={noExam}
                  disabled={locked || createSet.isPending || setNoExam.isPending}
                  onChange={(on) => toggleNoExam(a, set, on)}
                />
              </label>
            </div>
            {!noExam && set?.approval_status === "rejected" && set.approval_note && (
              <div className="mt-2 space-y-2">
                <p className="rounded-lg bg-destructive/10 px-2 py-1.5 text-destructive">เหตุผลที่ไม่อนุมัติ: {set.approval_note}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** ผังการเรียน topics offered for a catalog subject — mirrors plan_topic_fits_subject (name prefix, or lesson tagged with the subject). */
function TopicPickerPage({
  teacherId,
  assignment,
  set,
  subject,
  current,
  onClose,
}: {
  teacherId: string;
  assignment: TeachingAssignment;
  set: ExamTopicSet | null;
  subject: Subject | undefined;
  current: string[];
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const selfApprove = isDeptHead(profile?.roles ?? []);
  const { data: lessons = [], isLoading } = useSubjectLinkedLessons(subject?.id ?? null);
  // Saving replaces the set with this pick, like submitting — so it starts empty, previous topics are not pre-checked.
  const [picked, setPicked] = useState<string[]>([]);
  const save = useSetTopicSetTopics();
  const createSet = useCreateTopicSet();
  const submitSet = useSubmitTopicSet();
  const toast = useToast();

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit() {
    try {
      const setId = set?.id ?? (await createSet.mutateAsync({ teacher_id: teacherId, subject_id: assignment.subject_id, teaching_assignment_id: assignment.id })).id;
      await save.mutateAsync({ setId, current, next: picked });
      const changed = picked.length !== current.length || picked.some((id) => !current.includes(id));
      // Saving sends it to อนุมัติสอบ: draft/rejected always, approved only if topics changed (DB trigger resets it to draft).
      if (!selfApprove && picked.length > 0 && (set?.approval_status !== "approved" || changed)) {
        await submitSet.mutateAsync(setId);
        toast("ส่งขออนุมัติแล้ว");
      } else toast("ส่งหัวข้อแล้ว");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="ย้อนกลับ">
          <ChevronBack className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">เลือกหัวข้อการสอบ</h2>
          <p className="truncate text-xs text-muted-foreground">
            {subject ? `${subject.code} ${subject.name_th}` : ""} · เลือกแล้ว {picked.length} หัวข้อ
          </p>
        </div>
      </div>
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4">
          {set?.approval_status === "approved" && !selfApprove && (
            <p className="rounded-lg bg-warning/15 px-2 py-1.5 text-xs">การแก้หัวข้อหลังอนุมัติ จะส่งขออนุมัติใหม่อัตโนมัติ</p>
          )}
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && lessons.length === 0 && (
            <p className="text-xs text-muted-foreground">ยังไม่มีบทเรียนที่ผูกกับวิชานี้ในผังการเรียน</p>
          )}
          {lessons.map((l) => {
            const ids = l.topics.map((t) => t.id);
            const n = ids.filter((id) => picked.includes(id)).length;
            const all = n === ids.length;
            return (
              <section key={l.id}>
                <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
                  <h3 className="min-w-0 truncate text-[13px] font-semibold">{l.name}</h3>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-accent"
                    onClick={() => setPicked((p) => (all ? p.filter((id) => !ids.includes(id)) : [...new Set([...p, ...ids])]))}
                  >
                    {all ? "ล้างทั้งบท" : `เลือกทั้งบท (${n}/${ids.length})`}
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl bg-muted [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border">
                  {l.topics.map((t) => (
                    <label key={t.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-sm active:bg-foreground/5">
                      <input type="checkbox" className="h-[18px] w-[18px] shrink-0 accent-accent" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                      <span className="min-w-0">{t.name}</span>
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button type="button" className="flex-1" disabled={picked.length === 0 || save.isPending || createSet.isPending || submitSet.isPending} onClick={() => void submit()}>
          ส่งหัวข้อ ({picked.length})
        </Button>
      </div>
    </div>
  );
}

// ============================================================== head: อนุมัติสอบ

type Filter = ExamApprovalStatus;
const FILTERS: Filter[] = ["pending", "approved", "rejected"];

export function useExamApprovalPendingCount(enabled: boolean) {
  const { profile } = useAuth();
  const { data = [] } = useTopicSetQueue(enabled, profile?.id ?? null);
  return data.filter((s) => s.approval_status === "pending").length;
}

export function ExamApprovalTab({ onCreateRoom }: { onCreateRoom: (set: ExamTopicSet) => void }) {
  const { profile } = useAuth();
  const { data: queue = [], isLoading } = useTopicSetQueue(true, profile?.id ?? null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [selected, setSelected] = useState<ExamTopicSet | null>(null);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(queue.map((s) => s.subject_id))]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: teachers = [] } = useProfilesByIds([...new Set(queue.map((s) => s.teacher_id))]);
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const colors = useSubjectColors([]);
  const { data: roomOfAssignment } = useAssignmentClassrooms(queue.flatMap((s) => (s.teaching_assignment_id ? [s.teaching_assignment_id] : [])));
  const { data: classrooms = [] } = useClassroomsByIds([...new Set(roomOfAssignment?.values() ?? [])]);
  const { data: grades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);
  const roomLabel = (s: ExamTopicSet) => {
    const c = classrooms.find((x) => x.id === roomOfAssignment?.get(s.teaching_assignment_id ?? ""));
    const g = grades.find((x) => x.id === c?.grade_level_id);
    return c && g ? `${gradeShortLabel(g.code)}/${c.name}` : null;
  };
  const { data: topicsBySet } = useTopicSetsTopics(queue.map((s) => s.id));
  const { data: inUse } = useTopicSetsInUse(queue.map((s) => s.id));
  const shown = queue.filter((s) => s.approval_status === filter);
  const canCreateRoom = (s: ExamTopicSet) => s.approval_status === "approved" && !s.no_exam && !!inUse && !inUse.has(s.id);
  const createRoomButton = (s: ExamTopicSet) => (
    <Button
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onCreateRoom(s);
      }}
    >
      สร้างห้องสอบ
    </Button>
  );
  const count = (f: Filter) => queue.filter((s) => s.approval_status === f).length;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Select className="w-40 shrink-0 sm:w-48" aria-label="สถานะ" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {STATUS_LABEL[f]} ({count(f)})
            </option>
          ))}
        </Select>

        <div className="ml-auto flex shrink-0 rounded-lg bg-muted p-0.5" role="group" aria-label="มุมมอง">
          {(["cards", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={v === "cards" ? "มุมมองการ์ด" : "มุมมองตาราง"}
              onClick={() => setView(v)}
              className={cn("flex h-8 w-9 items-center justify-center rounded-md", view === v ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {v === "cards" ? <AppsIcon className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={filter === "pending" ? "ไม่มีชุดหัวข้อที่รออนุมัติ" : "ไม่มีรายการ"} />
        </div>
      ) : view === "table" ? (
        <div className="table-panel flex">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[40rem] text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">ครู</th>
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">ห้อง</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่อนุมัติ</th>
                  <th className="w-32 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
                  const subject = subjectById.get(s.subject_id);
                  const teacher = teacherById.get(s.teacher_id);
                  const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}` : "—";
                  const room = roomLabel(s);
                  return (
                    <tr key={s.id} onClick={() => setSelected(s)} className="h-14 cursor-pointer border-t border-border first:border-t-0">
                      <td className="px-4 py-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={teacherName} src={teacher ? avatarUrl(teacher) : null} className="h-9 w-9 text-xs" />
                          <p className="truncate text-sm font-medium">{teacherName}</p>
                        </div>
                      </td>
                      <td className="px-4 py-0">
                        <p className="truncate text-sm font-medium">{subject?.name_th ?? "—"}</p>
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">{subject?.code ?? "—"}</p>
                      </td>
                      <td className="px-4 py-0">
                        {room ? <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", levelTone(room))}>{room}</span> : "—"}
                      </td>
                      <td className="px-4 py-0">
                        <ApprovalBadge status={s.approval_status} />
                      </td>
                      <td className="px-4 py-0 text-muted-foreground">{s.approved_at ? thDate(s.approved_at) : "—"}</td>
                      <td className="px-4 py-0 text-right">{canCreateRoom(s) && createRoomButton(s)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        shown.map((s) => {
          const subject = subjectById.get(s.subject_id);
          const teacher = teacherById.get(s.teacher_id);
          const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}` : "—";
          const room = roomLabel(s);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s)}
              className="block w-full space-y-2 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{subject?.name_th ?? "—"}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    {subject && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(subject.learning_area_id))}>{subject.code}</span>}
                    {room && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(room))}>{room}</span>}
                    <ApprovalBadge status={s.approval_status} />
                  </p>
                </div>
                {s.approved_at && <span className="shrink-0 text-muted-foreground">อนุมัติ {thDate(s.approved_at)}</span>}
              </div>
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={teacherName} src={teacher ? avatarUrl(teacher) : null} className="h-6 w-6 text-[10px]" />
                  <span className="truncate">{teacherName}</span>
                </span>
                {canCreateRoom(s) && createRoomButton(s)}
              </div>
            </button>
          );
        })
      )}

      {selected && (
        <ReviewSheet
          // Re-pick from the live queue so the sheet reflects the decision just made.
          set={queue.find((s) => s.id === selected.id) ?? selected}
          subject={subjectById.get(selected.subject_id)}
          teacher={(() => { const t = teacherById.get(selected.teacher_id); return t ? `${t.first_name} ${t.last_name}` : undefined; })()}
          topics={topicsBySet?.get(selected.id)}
          onClose={() => setSelected(null)}
          onCreateRoom={
            canCreateRoom(selected)
              ? (set) => {
                  setSelected(null);
                  onCreateRoom(set);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function ReviewSheet({
  set,
  subject,
  teacher,
  topics,
  onClose,
  onCreateRoom,
}: {
  onCreateRoom?: (set: ExamTopicSet) => void;
  set: ExamTopicSet;
  subject: Subject | undefined;
  teacher: string | undefined;
  topics: ExamTopicLabel[] | undefined;
  onClose: () => void;
}) {
  const decide = useDecideTopicSet();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const pending = set.approval_status === "pending";
  const lessons = [...Map.groupBy(topics ?? [], (t) => t.lesson)];

  function run(approve: boolean) {
    decide.mutate(
      { id: set.id, approve, note },
      {
        onSuccess: () => {
          toast(approve ? "อนุมัติแล้ว" : "ไม่อนุมัติแล้ว");
          onClose();
        },
        onError: (e) => toast(e instanceof Error ? e.message : "ไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={subject?.name_th ?? "ชุดหัวข้อการสอบ"}
      description={`ครู ${teacher ?? "—"}`}
      headerEnd={<ApprovalBadge status={set.approval_status} />}
      footer={
        pending ? (
          rejecting ? (
            <div className="space-y-2">
              <textarea
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                rows={2}
                placeholder="เหตุผลที่ไม่อนุมัติ"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setRejecting(false)}>
                  ยกเลิก
                </Button>
                <Button type="button" className="flex-1" disabled={!note.trim() || decide.isPending} onClick={() => run(false)}>
                  ยืนยันไม่อนุมัติ
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setRejecting(true)}>
                ไม่อนุมัติ
              </Button>
              <Button type="button" className="flex-1" disabled={decide.isPending} onClick={() => run(true)}>
                อนุมัติ
              </Button>
            </div>
          )
        ) : set.approval_status === "approved" && !set.no_exam && onCreateRoom ? (
          <Button type="button" className="w-full" onClick={() => onCreateRoom(set)}>
            สร้างห้องสอบ
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {set.approval_note && <p className="text-sm text-muted-foreground">{set.approval_note}</p>}
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่เลือกหัวข้อ</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">หัวข้อการสอบ {topics?.length} หัวข้อ</p>
            {lessons.map(([lesson, items]) => (
              <section key={lesson}>
                <h3 className="mb-1.5 px-1 text-[13px] font-semibold">{lesson}</h3>
                <ul className="overflow-hidden rounded-xl bg-muted [&>*+*]:border-t [&>*+*]:border-border">
                  {items.map((t) => (
                    <li key={t.topic_id} className="px-4 py-2.5 text-sm">
                      {t.topic}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </Sheet>
  );
}
