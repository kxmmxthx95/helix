import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Field, Skeleton } from "@/components/ui";
import { useGradeLevelsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import {
  useCreateTopicSet,
  useDecideTopicSet,
  useDeleteTopicSet,
  useMyTopicSets,
  useSetTopicSetTopics,
  useSubmitTopicSet,
  useTopicSetQueue,
  useTopicSetsTopics,
  type ExamTopicLabel,
} from "@/hooks/useExams";
import { usePlanOutline, usePlanSubjects } from "@/hooks/usePlan";
import { useProfilesByIds } from "@/hooks/usePractice";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import type { ExamApprovalStatus, ExamTopicSet, Subject } from "@/lib/database.types";
import { SubjectPicker } from "@/routes/ExamBank";
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
  const { data: sets = [], isLoading } = useMyTopicSets(teacherId);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(sets.map((s) => s.subject_id))]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: topicsBySet } = useTopicSetsTopics(sets.map((s) => s.id));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExamTopicSet | null>(null);
  const submit = useSubmitTopicSet();
  const remove = useDeleteTopicSet();
  const toast = useToast();

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          + สร้างชุดหัวข้อ
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : sets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <EmptyState title="ยังไม่มีชุดหัวข้อ" description="สร้างชุดหัวข้อและส่งขออนุมัติ แล้วจึงเปิดสอบจากชุดที่อนุมัติแล้วได้" />
        </div>
      ) : (
        sets.map((s) => {
          const topics = topicsBySet?.get(s.id);
          const editable = s.approval_status !== "pending";
          const submittable = s.approval_status === "draft" || s.approval_status === "rejected";
          return (
            <div key={s.id} className="space-y-2 rounded-xl border border-border bg-card p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{subjectById.get(s.subject_id)?.name_th ?? "—"}</p>
                <ApprovalBadge status={s.approval_status} />
              </div>
              <TopicChips topics={topics} />
              {s.approval_status === "rejected" && s.approval_note && (
                <p className="rounded-lg bg-destructive/10 px-2 py-1.5 text-destructive">เหตุผลที่ไม่อนุมัติ: {s.approval_note}</p>
              )}
              <div className="flex gap-2">
                {editable && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                    เลือกหัวข้อ
                  </Button>
                )}
                {submittable && (
                  <Button
                    size="sm"
                    disabled={submit.isPending}
                    onClick={() =>
                      submit.mutate(s.id, {
                        onSuccess: () => toast("ส่งขออนุมัติแล้ว"),
                        onError: (e) => toast(e instanceof Error ? e.message : "ส่งไม่สำเร็จ", "error"),
                      })
                    }
                  >
                    ส่งขออนุมัติ
                  </Button>
                )}
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (!confirm("ลบชุดหัวข้อนี้?")) return;
                      remove.mutate(s.id, { onError: () => toast("ลบไม่ได้ อาจมีห้องสอบใช้ชุดหัวข้อนี้อยู่", "error") });
                    }}
                  >
                    ลบ
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}
      {creating && (
        <NewSetSheet
          teacherId={teacherId}
          onClose={() => setCreating(false)}
          onCreated={(set) => {
            setCreating(false);
            setEditing(set);
          }}
        />
      )}
      {editing && (
        <TopicPickerSheet
          set={editing}
          subject={subjectById.get(editing.subject_id)}
          current={(topicsBySet?.get(editing.id) ?? []).map((t) => t.topic_id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function NewSetSheet({
  teacherId,
  onClose,
  onCreated,
}: {
  teacherId: string;
  onClose: () => void;
  onCreated: (set: ExamTopicSet) => void;
}) {
  const { data: assignments = [] } = useMyTeachingAssignments(teacherId);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(assignments.map((a) => a.subject_id))]);
  const { data: gradeLevels = [] } = useGradeLevelsByIds(
    [...new Set(subjects.map((s) => s.suggested_grade_level_id).filter((id): id is string => !!id))],
  );
  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));
  const [subjectId, setSubjectId] = useState("");
  const create = useCreateTopicSet();
  const toast = useToast();

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="สร้างชุดหัวข้อ"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!subjectId || create.isPending}
            onClick={() =>
              create.mutate(
                { teacher_id: teacherId, subject_id: subjectId },
                { onSuccess: onCreated, onError: () => toast("สร้างไม่สำเร็จ", "error") },
              )
            }
          >
            ถัดไป
          </Button>
        </div>
      }
    >
      <Field label="วิชา" required>
        <SubjectPicker subjects={subjects} gradeLevelById={gradeLevelById} value={subjectId} onChange={setSubjectId} />
      </Field>
    </Sheet>
  );
}

/** ผังการเรียน topics offered for a catalog subject — mirrors plan_topic_fits_subject (name prefix, or lesson tagged with the subject). */
function TopicPickerSheet({
  set,
  subject,
  current,
  onClose,
}: {
  set: ExamTopicSet;
  subject: Subject | undefined;
  current: string[];
  onClose: () => void;
}) {
  const { data: planSubjects = [] } = usePlanSubjects(subject?.department_id ?? null);
  const [planSubjectId, setPlanSubjectId] = useState("");
  const { data: lessons = [], isLoading } = usePlanOutline(planSubjectId || null);
  const [picked, setPicked] = useState<string[]>(current);
  const save = useSetTopicSetTopics();
  const toast = useToast();

  const prefixMatch = (name: string) => !!subject && subject.name_th.trim().startsWith(name.trim());
  const visible = useMemo(
    () =>
      lessons
        .map((l) => ({
          ...l,
          topics:
            !subject || prefixMatch(planSubjects.find((p) => p.id === planSubjectId)?.name ?? "") || l.tags.some((t) => t.subject.id === subject.id)
              ? l.topics
              : [],
        }))
        .filter((l) => l.topics.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, subject, planSubjectId, planSubjects],
  );

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function submit() {
    save.mutate(
      { setId: set.id, current, next: picked },
      {
        onSuccess: () => {
          toast("บันทึกหัวข้อแล้ว");
          onClose();
        },
        onError: (e) => toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="เลือกหัวข้อการสอบ"
      description={subject?.name_th}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="button" className="flex-1" disabled={save.isPending} onClick={submit}>
            บันทึก ({picked.length})
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {set.approval_status === "approved" && (
          <p className="rounded-lg bg-warning/15 px-2 py-1.5 text-xs">การแก้หัวข้อหลังอนุมัติ จะกลับเป็นร่าง ต้องส่งขออนุมัติใหม่ (แก้ไม่ได้ถ้ามีห้องสอบใช้ชุดนี้แล้ว)</p>
        )}
        <Field label="วิชาในผังการเรียน">
          <select
            className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm"
            value={planSubjectId}
            onChange={(e) => setPlanSubjectId(e.target.value)}
          >
            <option value="">เลือกวิชา</option>
            {planSubjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {picked.length > 0 && (
          <p className="text-xs text-muted-foreground">เลือกแล้ว {picked.length} หัวข้อ (รวมหัวข้อจากวิชาอื่นที่เลือกไว้ก่อนหน้า)</p>
        )}
        {planSubjectId && isLoading && <Skeleton className="h-24 w-full" />}
        {planSubjectId && !isLoading && visible.length === 0 && (
          <p className="text-xs text-muted-foreground">ไม่พบบทเรียนที่ตรงกับวิชานี้ในผังการเรียน</p>
        )}
        {visible.map((l) => (
          <div key={l.id} className="rounded-lg border border-border p-2">
            <p className="mb-1 text-xs font-medium">{l.name}</p>
            <div className="space-y-1">
              {l.topics.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
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
      <div className="scrollbar-hidden flex shrink-0 gap-2 overflow-x-auto" role="tablist" aria-label="สถานะ">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-foreground/5",
            )}
          >
            {STATUS_LABEL[f]} ({count(f)})
          </button>
        ))}
      </div>

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
