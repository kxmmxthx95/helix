import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Field, Skeleton } from "@/components/ui";
import { useSubjectsByIds } from "@/hooks/useExamBank";
import {
  useDecideExamSession,
  useExamApprovalQueue,
  useExamReviewQuestions,
  useExamSessionsTopics,
  useExamSessionTargets,
  useMyExamSessions,
  useSetSessionTopics,
  useSubmitExamSession,
  type ExamTopicLabel,
} from "@/hooks/useExams";
import { usePlanOutline, usePlanSubjects } from "@/hooks/usePlan";
import { useProfilesByIds } from "@/hooks/usePractice";
import type { ExamApprovalStatus, ExamSession, Subject } from "@/lib/database.types";
import { cn } from "@/lib/utils";

// อนุมัติสอบ (migration 0181): teachers pick ผังการเรียน topics and submit, heads approve.

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

const fmt = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });

// ============================================================ teacher: หัวข้อการสอบ

export function ExamTopicsTab({ teacherId }: { teacherId: string }) {
  const { data: sessions = [], isLoading } = useMyExamSessions(teacherId);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(sessions.map((s) => s.subject_id))]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: topicsBySession } = useExamSessionsTopics(sessions.map((s) => s.id));
  const [editing, setEditing] = useState<ExamSession | null>(null);
  const submit = useSubmitExamSession();
  const toast = useToast();

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (sessions.length === 0)
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ยังไม่มีรอบสอบ" description="สร้างรอบสอบในแท็บ “ห้องสอบ” ก่อน แล้วกลับมาเลือกหัวข้อเพื่อขออนุมัติ" />
      </div>
    );

  return (
    <div className="space-y-2">
      {sessions.map((s) => {
        const topics = topicsBySession?.get(s.id);
        const editable = s.approval_status === "draft" || s.approval_status === "rejected";
        return (
          <div key={s.id} className="space-y-2 rounded-xl border border-border bg-card p-3 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-muted-foreground">
                  {subjectById.get(s.subject_id)?.name_th ?? "—"} · {fmt(s.opens_at)} – {fmt(s.closes_at)}
                </p>
              </div>
              <ApprovalBadge status={s.approval_status} />
            </div>
            <TopicChips topics={topics} />
            {s.approval_status === "rejected" && s.approval_note && (
              <p className="rounded-lg bg-destructive/10 px-2 py-1.5 text-destructive">เหตุผลที่ไม่อนุมัติ: {s.approval_note}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                เลือกหัวข้อ
              </Button>
              {editable && (
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
            </div>
          </div>
        );
      })}
      {editing && (
        <TopicPickerSheet
          session={editing}
          subject={subjectById.get(editing.subject_id)}
          current={(topicsBySession?.get(editing.id) ?? []).map((t) => t.topic_id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** ผังการเรียน topics offered for a catalog subject — mirrors plan_topic_fits_subject (name prefix, or lesson tagged with the subject). */
function TopicPickerSheet({
  session,
  subject,
  current,
  onClose,
}: {
  session: ExamSession;
  subject: Subject | undefined;
  current: string[];
  onClose: () => void;
}) {
  const { data: planSubjects = [] } = usePlanSubjects(subject?.department_id ?? null);
  const [planSubjectId, setPlanSubjectId] = useState("");
  const { data: lessons = [], isLoading } = usePlanOutline(planSubjectId || null);
  const [picked, setPicked] = useState<string[]>(current);
  const save = useSetSessionTopics();
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
      { sessionId: session.id, current, next: picked },
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
      description={session.title}
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
        {session.approval_status === "approved" && (
          <p className="rounded-lg bg-warning/15 px-2 py-1.5 text-xs">การแก้หัวข้อหลังอนุมัติ จะส่งรอบสอบกลับไปรออนุมัติใหม่</p>
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
  const { data = [] } = useExamApprovalQueue(enabled);
  return data.filter((s) => s.approval_status === "pending").length;
}

export function ExamApprovalTab() {
  const { data: queue = [], isLoading } = useExamApprovalQueue(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<ExamSession | null>(null);
  const { data: subjects = [] } = useSubjectsByIds([...new Set(queue.map((s) => s.subject_id))]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: teachers = [] } = useProfilesByIds([...new Set(queue.map((s) => s.teacher_id))]);
  const teacherById = new Map(teachers.map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
  const { data: topicsBySession } = useExamSessionsTopics(queue.map((s) => s.id));
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
          <EmptyState title={filter === "pending" ? "ไม่มีรอบสอบที่รออนุมัติ" : "ไม่มีรายการ"} />
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
              <p className="text-sm font-medium">{s.title}</p>
              <ApprovalBadge status={s.approval_status} />
            </div>
            <p className="text-muted-foreground">
              {subjectById.get(s.subject_id)?.name_th ?? "—"} · ครู {teacherById.get(s.teacher_id) ?? "—"}
            </p>
            <TopicChips topics={topicsBySession?.get(s.id)} />
          </button>
        ))
      )}

      {selected && (
        <ReviewSheet
          // Re-pick from the live queue so the sheet reflects the decision just made.
          session={queue.find((s) => s.id === selected.id) ?? selected}
          subject={subjectById.get(selected.subject_id)}
          teacher={teacherById.get(selected.teacher_id)}
          topics={topicsBySession?.get(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ReviewSheet({
  session,
  subject,
  teacher,
  topics,
  onClose,
}: {
  session: ExamSession;
  subject: Subject | undefined;
  teacher: string | undefined;
  topics: ExamTopicLabel[] | undefined;
  onClose: () => void;
}) {
  const { data: questions = [], isLoading } = useExamReviewQuestions(session.id);
  const { data: targets = [] } = useExamSessionTargets(session.id);
  const decide = useDecideExamSession();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const pending = session.approval_status === "pending";
  const total = questions.reduce((n, q) => n + Number(q.points), 0);

  function run(approve: boolean) {
    decide.mutate(
      { id: session.id, approve, note },
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
      title={session.title}
      description={`${subject?.name_th ?? "—"} · ครู ${teacher ?? "—"}`}
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
          <ApprovalBadge status={session.approval_status} />
          {session.approval_note && <span className="text-muted-foreground">{session.approval_note}</span>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">เปิด – ปิด</dt>
          <dd>
            {fmt(session.opens_at)} – {fmt(session.closes_at)}
          </dd>
          <dt className="text-muted-foreground">เวลาทำ</dt>
          <dd>{session.duration_minutes ? `${session.duration_minutes} นาที` : "ไม่จำกัด"}</dd>
          <dt className="text-muted-foreground">สอบได้</dt>
          <dd>{session.max_attempts} ครั้ง</dd>
          <dt className="text-muted-foreground">ห้อง</dt>
          <dd>{targets.length} ห้อง</dd>
        </dl>
        <div>
          <p className="mb-1 font-medium">หัวข้อการสอบ</p>
          <TopicChips topics={topics} />
        </div>
        <div>
          <p className="mb-1 font-medium">
            ข้อสอบ {questions.length} ข้อ ({total} คะแนน)
          </p>
          {isLoading && <Skeleton className="h-20 w-full" />}
          <ol className="space-y-2">
            {questions.map((q, i) => (
              <li key={q.question_id} className="rounded-lg border border-border p-2">
                <p>
                  {i + 1}. {q.prompt} <span className="text-muted-foreground">({q.points} คะแนน)</span>
                </p>
                {q.choices.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {q.choices.map((c) => (
                      <li key={c.position} className={cn(c.is_correct && "font-medium text-success")}>
                        {c.is_correct ? "✓" : "•"} {c.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 font-medium text-success">เฉลย: {q.correct_answer}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Sheet>
  );
}
