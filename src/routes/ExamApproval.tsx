import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { ChevronBack } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Select, Skeleton, Switch } from "@/components/ui";
import { useClassroomsByIds, useGradeLevelsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import {
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

function TopicChips({ topics }: { topics: ExamTopicLabel[] | undefined }) {
  if (!topics || topics.length === 0) return <span className="text-muted-foreground">ยังไม่เลือกหัวข้อ</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {topics.map((t) => (
        <span key={t.topic_id} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
          {t.lesson} › {t.topic}
        </span>
      ))}
    </div>
  );
}

// ============================================================ teacher: หัวข้อการสอบ

export function ExamTopicsTab({ teacherId }: { teacherId: string }) {
  const { profile } = useAuth();
  const selfApprove = isDeptHead(profile?.roles ?? []);
  const { data: assignments = [], isLoading: loadingA } = useMyTeachingAssignments(teacherId);
  const { data: sets = [], isLoading: loadingS } = useMyTopicSets(teacherId);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(assignments.map((a) => a.subject_id))]);
  const { data: classrooms = [] } = useClassroomsByIds([...new Set(assignments.map((a) => a.classroom_id))]);
  const { data: topicsBySet } = useTopicSetsTopics(sets.map((s) => s.id));
  const { data: inUse } = useTopicSetsInUse(sets.map((s) => s.id));
  const colors = useSubjectColors([]); // hue from กลุ่มสาระ only, like the period attendance views
  const [picking, setPicking] = useState<string | null>(null);
  const submit = useSubmitTopicSet();
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
        const topics = set ? topicsBySet?.get(set.id) : undefined;
        const noExam = !!set?.no_exam;
        const locked = !!set && !!inUse?.has(set.id);
        const editable = !noExam && !locked && set?.approval_status !== "pending";
        const submittable = !selfApprove && !noExam && !!set && (set.approval_status === "draft" || set.approval_status === "rejected") && (topics?.length ?? 0) > 0;
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
                  {set && !noExam && <ApprovalBadge status={set.approval_status} />}
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
            {!noExam && ((topics?.length ?? 0) > 0 || submittable || (set?.approval_status === "rejected" && set.approval_note)) && (
              <div className="mt-2 space-y-2">
                <TopicChips topics={topics} />
                {set?.approval_status === "rejected" && set.approval_note && (
                  <p className="rounded-lg bg-destructive/10 px-2 py-1.5 text-destructive">เหตุผลที่ไม่อนุมัติ: {set.approval_note}</p>
                )}
                {submittable && (
                  <Button
                    size="sm"
                    disabled={submit.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      submit.mutate(set!.id, {
                        onSuccess: () => toast("ส่งขออนุมัติแล้ว"),
                        onError: (err) => toast(err instanceof Error ? err.message : "ส่งไม่สำเร็จ", "error"),
                      });
                    }}
                  >
                    ส่งขออนุมัติ
                  </Button>
                )}
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
  const [picked, setPicked] = useState<string[]>(current);
  const save = useSetTopicSetTopics();
  const createSet = useCreateTopicSet();
  const toast = useToast();

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit() {
    try {
      const setId = set?.id ?? (await createSet.mutateAsync({ teacher_id: teacherId, subject_id: assignment.subject_id, teaching_assignment_id: assignment.id })).id;
      await save.mutateAsync({ setId, current, next: picked });
      toast("บันทึกหัวข้อแล้ว");
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
            <p className="rounded-lg bg-warning/15 px-2 py-1.5 text-xs">การแก้หัวข้อหลังอนุมัติ จะกลับเป็นร่าง ต้องส่งขออนุมัติใหม่</p>
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
        <Button type="button" className="flex-1" disabled={save.isPending || createSet.isPending} onClick={() => void submit()}>
          บันทึก ({picked.length})
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

export function ExamApprovalTab() {
  const { profile } = useAuth();
  const { data: queue = [], isLoading } = useTopicSetQueue(true, profile?.id ?? null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<ExamTopicSet | null>(null);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(queue.map((s) => s.subject_id))]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: teachers = [] } = useProfilesByIds([...new Set(queue.map((s) => s.teacher_id))]);
  const teacherById = new Map(teachers.map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
  const { data: topicsBySet } = useTopicSetsTopics(queue.map((s) => s.id));
  const shown = queue.filter((s) => s.approval_status === filter);
  const count = (f: Filter) => queue.filter((s) => s.approval_status === f).length;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Select className="w-full shrink-0 sm:w-48" aria-label="สถานะ" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
        {FILTERS.map((f) => (
          <option key={f} value={f}>
            {STATUS_LABEL[f]} ({count(f)})
          </option>
        ))}
      </Select>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={filter === "pending" ? "ไม่มีชุดหัวข้อที่รออนุมัติ" : "ไม่มีรายการ"} />
        </div>
      ) : (
        shown.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelected(s)}
            className="block w-full space-y-1.5 rounded-xl border border-border bg-card p-3 text-left text-xs hover:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{subjectById.get(s.subject_id)?.name_th ?? "—"}</p>
              <ApprovalBadge status={s.approval_status} />
            </div>
            <p className="text-muted-foreground">ครู {teacherById.get(s.teacher_id) ?? "—"}</p>
            <TopicChips topics={topicsBySet?.get(s.id)} />
          </button>
        ))
      )}

      {selected && (
        <ReviewSheet
          // Re-pick from the live queue so the sheet reflects the decision just made.
          set={queue.find((s) => s.id === selected.id) ?? selected}
          subject={subjectById.get(selected.subject_id)}
          teacher={teacherById.get(selected.teacher_id)}
          topics={topicsBySet?.get(selected.id)}
          onClose={() => setSelected(null)}
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
}: {
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
        ) : undefined
      }
    >
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <ApprovalBadge status={set.approval_status} />
          {set.approval_note && <span className="text-muted-foreground">{set.approval_note}</span>}
        </div>
        <div>
          <p className="mb-1 font-medium">หัวข้อการสอบ</p>
          <TopicChips topics={topics} />
        </div>
      </div>
    </Sheet>
  );
}
