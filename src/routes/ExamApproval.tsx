import { useState } from "react";
import { ViewToggle, defaultView } from "@/components/ViewToggle";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { ChevronBack, TrashIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Avatar, Button, EmptyState, Field, Input, Select, Skeleton, TableSkeleton } from "@/components/ui";
import { useClassroomsByIds, useGradeLevelsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import {
  useAssignmentClassrooms,
  useCreateTopicSet,
  useDecideTopicSet,
  useDeleteTopicSet,
  useMyTopicSets,
  useSetTopicSetTopics,
  useSubmitNoExamSet,
  useSubmitTopicSet,
  useTopicSetQueue,
  useTopicSetsInUse,
  useTopicSetsTopics,
  type ExamTopicLabel,
} from "@/hooks/useExams";
import { avatarUrl } from "@/hooks/useAvatar";
import { usePlanLessonLinks, useSubjectsLinkedLessons } from "@/hooks/usePlan";
import { EXAM_KINDS, examLabel } from "@/lib/examKinds";
import { groupBySharedLessons } from "@/lib/examGroups";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { useProfilesByIds } from "@/hooks/usePractice";
import { useAllTeachingAssignments, useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { isDeptHead } from "@/lib/roles";
import type { ExamApprovalStatus, ExamTopicSet, Subject, TeachingAssignment } from "@/lib/database.types";
import { ICON, ICON_BTN } from "@/lib/iconButton";
import { cn } from "@/lib/utils";

// ชุดหัวข้อการสอบ (migrations 0183, 0192): every "ส่งหัวข้อ" / "ไม่มีสอบ" is a NEW set for subject × room and
// one exam (type + round); heads approve, then a room is opened from each approved set.

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
const CHIP = "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

export function ApprovalBadge({ status }: { status: ExamApprovalStatus }) {
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

const thDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });

// ============================================================ teacher: หัวข้อการสอบ

export function ExamTopicsTab({ teacherId, canSeeAll = false }: { teacherId: string; canSeeAll?: boolean }) {
  // Heads can also browse every subject read-only; "ไม่มีสอบ" and picking stay on own subjects.
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const all = canSeeAll && scope === "all";
  const { data: mine = [], isLoading: mineLoading } = useMyTeachingAssignments(teacherId);
  const { data: everyone = [], isLoading: allLoading } = useAllTeachingAssignments(all);
  const assignments = all ? everyone : mine;
  const isLoading = all ? allLoading : mineLoading;
  const { data: teachers = [] } = useProfilesByIds(all ? [...new Set(everyone.map((a) => a.teacher_id).filter((x): x is string => !!x))] : []);
  const teacherNameById = new Map(teachers.map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
  const [view, setView] = useState<"cards" | "table">(defaultView);
  const scopeSelect = canSeeAll ? (
    <Select value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")} className="ui-control-compact h-8 px-2.5 pr-7 text-[13px] sm:w-64 sm:pr-8">
      <option value="mine">วิชาของฉัน</option>
      <option value="all">ทุกวิชา</option>
    </Select>
  ) : null;
  const header = (
    <div className="mb-1 flex shrink-0 items-center gap-2">
      {scopeSelect}
      <ViewToggle value={view} onChange={setView} className="ml-auto" />
    </div>
  );
  const { data: subjects = [] } = useSubjectsByIds([...new Set(assignments.map((a) => a.subject_id))]);
  const { data: classrooms = [] } = useClassroomsByIds([...new Set(assignments.map((a) => a.classroom_id))]);
  const { data: lessonLinks } = usePlanLessonLinks(assignments.map((a) => a.subject_id));
  const colors = useSubjectColors([]); // hue from กลุ่มสาระ only, like the period attendance views
  const [picking, setPicking] = useState<string | null>(null);
  const [noExamFor, setNoExamFor] = useState<string | null>(null);

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));
  const { data: grades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);
  const gradeById = new Map(grades.map((g) => [g.id, g]));
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
  const roomLabelOf = (a: TeachingAssignment) => {
    const classroom = classroomById.get(a.classroom_id);
    const grade = classroom ? gradeById.get(classroom.grade_level_id) : undefined;
    return grade ? `${gradeShortLabel(grade.code)}/${classroom?.name}` : (classroom?.name ?? "—");
  };
  // Subjects of one room that share a ผังการเรียน lesson are one card (key = first assignment id).
  const groups = new Map(
    groupBySharedLessons(cards, (a) => `${a.classroom_id}:${a.academic_year}:${all ? (a.teacher_id ?? "") : ""}`, (a) => a.subject_id, (id) => lessonLinks?.get(id)).map((g) => [g[0]!.id, g] as const),
  );
  const subjectsOf = (members: TeachingAssignment[]) => members.map((a) => subjectById.get(a.subject_id)).filter((x): x is Subject => !!x);
  const pickingGroup = picking ? (groups.get(picking) ?? null) : null;
  const noExamGroup = noExamFor ? (groups.get(noExamFor) ?? null) : null;

  if (isLoading)
    return (
      <div className="flex flex-1 flex-col gap-2">
        {header}
        {view === "table" ? (
          <TableSkeleton headers={["วิชา", "ห้อง", ...(all ? ["ครูผู้สอน"] : []), ""]} />
        ) : (
          <div className="space-y-2" role="status" aria-label="กำลังโหลด">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  {all && <Skeleton className="h-3 w-28" />}
                </div>
                {!all && <Skeleton className="h-8 w-16 rounded-md" />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  if (cards.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-2">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีวิชาที่ได้รับมอบหมาย" description="เมื่อได้รับมอบหมายวิชาสอนแล้ว จะเลือกหัวข้อการสอบได้ที่นี่" />
        </div>
      </div>
    );
  }

  if (pickingGroup) {
    return (
      <TopicPickerPage
        teacherId={teacherId}
        subjects={subjectsOf(pickingGroup)}
        room={roomLabelOf(pickingGroup[0]!)}
        targets={pickingGroup}
        onClose={() => setPicking(null)}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      {header}
      {view === "table" && (
        <div className="table-panel flex-1 rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[28rem] text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">ห้อง</th>
                  {all && <th className="px-4 py-3">ครูผู้สอน</th>}
                  <th className="w-28 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {[...groups].map(([key, members]) => {
                  const room = roomLabelOf(members[0]!);
                  const teacherName = all ? teacherNameById.get(members[0]?.teacher_id ?? "") : undefined;
                  return (
                    <tr
                      key={key}
                      onClick={() => !all && setPicking(key)}
                      className={cn("h-14 border-t border-border first:border-t-0", !all && "cursor-pointer hover:bg-muted")}
                    >
                      <td className="px-4 py-2">
                        {subjectsOf(members).map((x) => (
                          <div key={x.id} className="py-0.5">
                            <p className="truncate text-sm font-medium">{x.name_th}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">{x.code}</p>
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-0">
                        <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", levelTone(room))}>{room}</span>
                      </td>
                      {all && <td className="px-4 py-0">{teacherName}</td>}
                      <td className="px-4 py-0 text-right">
                        {!all && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNoExamFor(key);
                            }}
                          >
                            ไม่มีสอบ
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view === "cards" && [...groups].map(([key, members]) => {
        const memberSubjects = subjectsOf(members);
        const teacherName = all ? teacherNameById.get(members[0]?.teacher_id ?? "") : undefined;
        return (
          <div
            key={key}
            {...(all
              ? {}
              : {
                  role: "button",
                  tabIndex: 0,
                  onClick: () => setPicking(key),
                  onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && setPicking(key),
                })}
            className={cn("rounded-xl border border-border bg-card p-3 text-xs", !all && "cursor-pointer hover:bg-muted active:bg-muted")}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-2">
                {memberSubjects.map((x) => (
                  <div key={x.id}>
                    <p className="truncate text-sm font-medium">{x.name_th}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(x.learning_area_id))}>{x.code}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(roomLabelOf(members[0]!)))}>{roomLabelOf(members[0]!)}</span>
                    </p>
                  </div>
                ))}
                {teacherName && <p className="text-xs text-muted-foreground">{teacherName}</p>}
              </div>
              {!all && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoExamFor(key);
                  }}
                >
                  ไม่มีสอบ
                </Button>
              )}
            </div>
          </div>
        );
      })}
      {noExamGroup && <NoExamSheet targets={noExamGroup} names={subjectsOf(noExamGroup).map((x) => x.name_th).join(" · ")} onClose={() => setNoExamFor(null)} />}
    </div>
  );
}

/** Which exam a submission is for: type (required) + round. */
function ExamFields({ kind, round, onKind, onRound }: { kind: string; round: string; onKind: (v: string) => void; onRound: (v: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="ประเภทการสอบ" required>
        <Select value={kind} placeholder="เลือกประเภท" onChange={(e) => onKind(e.target.value)}>
          {EXAM_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ครั้งที่">
        <Input type="number" min="1" value={round} onChange={(e) => onRound(e.target.value)} placeholder="เช่น 1 (ไม่ระบุได้)" />
      </Field>
    </div>
  );
}

/** "ไม่มีสอบ" for one exam — sent to อนุมัติสอบ like a topic set (heads: approved at once). */
function NoExamSheet({ targets, names, onClose }: { targets: TeachingAssignment[]; names: string; onClose: () => void }) {
  const selfApprove = isDeptHead(useAuth().profile?.roles ?? []);
  const [kind, setKind] = useState("");
  const [round, setRound] = useState("");
  const send = useSubmitNoExamSet();
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    try {
      for (const a of targets) await send.mutateAsync({ assignmentId: a.id, examType: kind, round: round ? Number(round) : null });
      toast(selfApprove ? "ส่งไม่มีสอบแล้ว" : "ส่งขออนุมัติไม่มีสอบแล้ว");
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "ส่งไม่สำเร็จ", "error");
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="ไม่มีสอบ"
      description={names}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="no-exam" className="flex-1" disabled={!kind || send.isPending}>
            ส่ง
          </Button>
        </div>
      }
    >
      <form id="no-exam" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted-foreground">{names}</p>
        <ExamFields kind={kind} round={round} onKind={setKind} onRound={setRound} />
      </form>
    </Sheet>
  );
}

/** ผังการเรียน topics offered for the card's subjects — every send is a new set per subject. */
function TopicPickerPage({
  teacherId,
  subjects,
  room,
  targets,
  onClose,
}: {
  teacherId: string;
  /** Subjects of the card (several when they share a ผังการเรียน lesson). */
  subjects: Subject[];
  room: string;
  targets: TeachingAssignment[];
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const selfApprove = isDeptHead(profile?.roles ?? []);
  const { data: lessons = [], isLoading } = useSubjectsLinkedLessons(subjects.map((x) => x.id));
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState("");
  const [round, setRound] = useState("");
  const save = useSetTopicSetTopics();
  const createSet = useCreateTopicSet();
  const submitSet = useSubmitTopicSet();
  const toast = useToast();
  // topic → subjects whose ผังการเรียน holds it (the DB rejects a topic outside its subject's plan).
  const topicSubjects = new Map(lessons.flatMap((l) => l.topics.map((t) => [t.id, l.subjectIds] as const)));

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit() {
    try {
      let sent = 0;
      for (const a of targets) {
        const next = picked.filter((id) => topicSubjects.get(id)?.includes(a.subject_id));
        if (next.length === 0) continue;
        const set = await createSet.mutateAsync({ teacher_id: teacherId, subject_id: a.subject_id, teaching_assignment_id: a.id, exam_type: kind, round: round ? Number(round) : null });
        await save.mutateAsync({ setId: set.id, current: [], next });
        if (!selfApprove) await submitSet.mutateAsync(set.id); // heads' own sets are born approved
        sent++;
      }
      if (sent === 0) throw new Error("หัวข้อที่เลือกไม่ตรงกับวิชาใดเลย");
      toast(`${selfApprove ? "ส่งหัวข้อแล้ว" : "ส่งขออนุมัติแล้ว"}${sent > 1 ? ` ${sent} วิชา` : ""}`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "ส่งไม่สำเร็จ", "error");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="icon" variant="outline" className={ICON_BTN} onClick={onClose} aria-label="ย้อนกลับ">
          <ChevronBack className={ICON} />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">เลือกหัวข้อการสอบ</h2>
          <p className="truncate text-xs text-muted-foreground">
            {subjects.map((x) => `${x.code} ${x.name_th}`).join(", ")} · {room} · เลือกแล้ว {picked.length} หัวข้อ
          </p>
        </div>
      </div>
      <div className="scrollbar-hidden -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-1">
        <div className="space-y-4">
          <ExamFields kind={kind} round={round} onKind={setKind} onRound={setRound} />
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
        <Button
          type="button"
          className="flex-1"
          disabled={!kind || picked.length === 0 || save.isPending || createSet.isPending || submitSet.isPending}
          onClick={() => void submit()}
        >
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

/** The teacher's own submitted sets: same list as อนุมัติสอบ, over their own sets (withdraw instead of decide). */
export function ExamSubmissionsTab({ teacherId, onCreateRoom }: { teacherId: string; onCreateRoom: (sets: ExamTopicSet[]) => void }) {
  return <ExamApprovalTab mineOf={teacherId} onCreateRoom={onCreateRoom} />;
}

export function ExamApprovalTab({ onCreateRoom, mineOf }: { onCreateRoom?: (sets: ExamTopicSet[]) => void; mineOf?: string }) {
  const { profile } = useAuth();
  const selfApprover = isDeptHead(profile?.roles ?? []);
  const { data: queueData = [], isLoading: loadingQueue } = useTopicSetQueue(!mineOf, profile?.id ?? null);
  const { data: mySets = [], isLoading: loadingMine } = useMyTopicSets(mineOf ?? null);
  const queue = mineOf ? mySets.filter((x) => x.approval_status !== "draft") : queueData;
  const isLoading = mineOf ? loadingMine : loadingQueue;
  const [filter, setFilter] = useState<Filter>("pending");
  const [view, setView] = useState<"cards" | "table">(defaultView);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  // "ยกเลิก" on a card opens the review sheet straight at the reason box (a rejection needs one).
  const [rejectFirst, setRejectFirst] = useState(false);
  const decide = useDecideTopicSet();
  const { data: subjects = [] } = useSubjectsByIds([...new Set(queue.map((s) => s.subject_id))]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { data: teachers = [] } = useProfilesByIds([...new Set(queue.map((s) => s.teacher_id))]);
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const colors = useSubjectColors([]);
  const { data: roomOfAssignment } = useAssignmentClassrooms(queue.flatMap((s) => (s.teaching_assignment_id ? [s.teaching_assignment_id] : [])));
  const { data: classrooms = [] } = useClassroomsByIds([...new Set(roomOfAssignment?.values() ?? [])]);
  const { data: grades = [] } = useGradeLevelsByIds([...new Set(classrooms.map((c) => c.grade_level_id))]);
  const { data: lessonLinks } = usePlanLessonLinks(queue.map((s) => s.subject_id));
  const roomLabel = (s: ExamTopicSet) => {
    const c = classrooms.find((x) => x.id === roomOfAssignment?.get(s.teaching_assignment_id ?? ""));
    const g = grades.find((x) => x.id === c?.grade_level_id);
    return c && g ? `${gradeShortLabel(g.code)}/${c.name}` : null;
  };
  const { data: topicsBySet } = useTopicSetsTopics(queue.map((s) => s.id));
  const { data: inUse } = useTopicSetsInUse(queue.map((s) => s.id));
  const deleteSet = useDeleteTopicSet();
  const toast = useToast();
  const shown = queue.filter((s) => s.approval_status === filter);
  // Subjects of one teacher's room, sent together for the same exam, that share a ผังการเรียน lesson are one card.
  const groups = groupBySharedLessons(
    shown,
    (s) => {
      const classroomId = roomOfAssignment?.get(s.teaching_assignment_id ?? "");
      return classroomId ? [s.teacher_id, classroomId, s.exam_type ?? "", s.round ?? "", s.no_exam, s.created_at.slice(0, 16)].join(":") : null;
    },
    (s) => s.subject_id,
    (id) => lessonLinks?.get(id),
  );
  const canCreateRoom = (s: ExamTopicSet) => s.approval_status === "approved" && !s.no_exam && !!inUse && !inUse.has(s.id);
  // Own sets that are not approved yet (heads: also approved) and that no room uses can be withdrawn.
  const canWithdraw = (s: ExamTopicSet) => s.teacher_id === profile?.id && (s.approval_status !== "approved" || selfApprover) && !!inUse && !inUse.has(s.id);
  async function withdraw(sets: ExamTopicSet[]) {
    if (!confirm("ลบชุดหัวข้อที่ส่งไว้นี้?")) return;
    try {
      for (const s of sets) await deleteSet.mutateAsync(s.id);
      toast("ลบแล้ว");
    } catch (e) {
      toast(e instanceof Error ? e.message : "ลบไม่สำเร็จ", "error");
    }
  }
  async function approve(sets: ExamTopicSet[]) {
    try {
      await Promise.all(sets.map((s) => decide.mutateAsync({ id: s.id, approve: true })));
      toast("อนุมัติแล้ว");
    } catch (e) {
      toast(e instanceof Error ? e.message : "ไม่สำเร็จ", "error");
    }
  }
  const count = (f: Filter) => queue.filter((s) => s.approval_status === f).length;
  const selected = selectedIds ? queue.filter((s) => selectedIds.includes(s.id)) : [];

  const view_ = (group: ExamTopicSet[]) => {
    const first = group[0]!;
    const teacher = teacherById.get(first.teacher_id);
    const members = group.map((s) => subjectById.get(s.subject_id)).filter((x): x is Subject => !!x);
    const createable = group.filter(canCreateRoom);
    const withdrawable = group.filter(canWithdraw);
    // Own sets can't be decided by their author (decide_exam_topic_set refuses self-decisions).
    const reviewable = mineOf ? [] : group.filter((s) => s.approval_status === "pending" && s.teacher_id !== profile?.id);
    return {
      first,
      teacher,
      teacherName: teacher ? `${teacher.first_name} ${teacher.last_name}` : "—",
      members,
      names: members.map((x) => x.name_th).join(" · ") || "—",
      room: roomLabel(first),
      exam: examLabel(first),
      open: () => {
        setRejectFirst(false);
        setSelectedIds(group.map((s) => s.id));
      },
      actions:
        createable.length > 0 || withdrawable.length > 0 || reviewable.length > 0 ? (
          <div className="flex items-center gap-2">
            {reviewable.length > 0 && (
              <>
                <Button
                  size="sm"
                  className="bg-destructive text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRejectFirst(true);
                    setSelectedIds(group.map((s) => s.id));
                  }}
                >
                  ยกเลิก
                </Button>
                <Button
                  size="sm"
                  className="bg-success text-white"
                  disabled={decide.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    void approve(reviewable);
                  }}
                >
                  อนุมัติ
                </Button>
              </>
            )}
            {withdrawable.length > 0 && (
              <Button
                size="icon"
                variant="outline"
                className={ICON_BTN}
                aria-label="ลบชุดหัวข้อ"
                title="ลบชุดหัวข้อ"
                disabled={deleteSet.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  void withdraw(withdrawable);
                }}
              >
                <TrashIcon className={ICON} />
              </Button>
            )}
            {createable.length > 0 && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateRoom?.(createable);
                }}
              >
                สร้างห้องสอบ
              </Button>
            )}
          </div>
        ) : null,
    };
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Select className="ui-control-compact h-8 px-2.5 pr-7 text-[13px] sm:w-64 sm:pr-8" aria-label="สถานะ" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {STATUS_LABEL[f]} ({count(f)})
            </option>
          ))}
        </Select>

        <ViewToggle value={view} onChange={setView} className="ml-auto" />
      </div>

      {isLoading ? (
        view === "table" ? (
          <TableSkeleton headers={[...(mineOf ? [] : ["ครู"]), "วิชา", "การสอบ", "ห้อง", "สถานะ", "วันที่อนุมัติ", ""]} />
        ) : (
          <div className="space-y-3" role="status" aria-label="กำลังโหลด">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-14 rounded-full" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-28 rounded-full" />
                </div>
                {!mineOf && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <Skeleton className="h-3 w-28" />
                    </span>
                    <Skeleton className="h-8 w-24 rounded-md" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={filter === "pending" ? "ไม่มีชุดหัวข้อที่รออนุมัติ" : "ไม่มีรายการ"}
            description={
              mineOf
                ? "ชุดหัวข้อที่ส่งขออนุมัติจะแสดงที่นี่"
                : filter === "pending"
                  ? "เมื่อครูส่งชุดหัวข้อขออนุมัติ จะแสดงที่นี่ให้ตรวจและอนุมัติ"
                  : filter === "approved"
                    ? "ชุดหัวข้อที่อนุมัติแล้วจะแสดงที่นี่"
                    : "ชุดหัวข้อที่ไม่อนุมัติจะแสดงที่นี่"
            }
          />
        </div>
      ) : view === "table" ? (
        <div className="table-panel flex rounded-none border-t border-border shadow-none">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full min-w-[44rem] text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  {!mineOf && <th className="px-4 py-3">ครู</th>}
                  <th className="px-4 py-3">วิชา</th>
                  <th className="px-4 py-3">การสอบ</th>
                  <th className="px-4 py-3">ห้อง</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่อนุมัติ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const v = view_(group);
                  return (
                    <tr key={v.first.id} onClick={v.open} className="h-14 cursor-pointer border-t border-border first:border-t-0">
                      {!mineOf && (
                        <td className="px-4 py-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={v.teacherName} src={v.teacher ? avatarUrl(v.teacher) : null} className="h-9 w-9 text-xs" />
                            <p className="truncate text-sm font-medium">{v.teacherName}</p>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-2">
                        {v.members.map((x) => (
                          <div key={x.id} className="py-0.5">
                            <p className="truncate text-sm font-medium">{x.name_th}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">{x.code}</p>
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-0">{v.exam ?? "—"}</td>
                      <td className="px-4 py-0">
                        {v.room ? <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", levelTone(v.room))}>{v.room}</span> : "—"}
                      </td>
                      <td className="px-4 py-0">
                        {v.first.no_exam && <span className={cn(CHIP, "mr-1.5")}>ไม่มีสอบ</span>}
                        {!(v.first.no_exam && v.first.approval_status === "approved") && <ApprovalBadge status={v.first.approval_status} />}
                      </td>
                      <td className="px-4 py-0 text-muted-foreground">{v.first.approved_at ? thDate(v.first.approved_at) : "—"}</td>
                      <td className="px-4 py-0 text-right">{v.actions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        groups.map((group) => {
          const v = view_(group);
          return (
            <div
              key={v.first.id}
              role="button"
              tabIndex={0}
              onClick={v.open}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  v.open();
                }
              }}
              className="block w-full space-y-2 rounded-xl border border-border bg-card p-3 text-left text-xs cursor-pointer hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  {(v.exam || v.first.no_exam || v.first.approval_status !== "approved") && (
                    <p className="flex flex-wrap items-center gap-1">
                      {v.exam && <span className={CHIP}>{v.exam}</span>}
                      {v.first.no_exam && <span className={CHIP}>ไม่มีสอบ</span>}
                      {v.first.approval_status !== "approved" && <ApprovalBadge status={v.first.approval_status} />}
                    </p>
                  )}
                  {v.members.map((x) => (
                    <div key={x.id}>
                      <p className="truncate text-sm font-medium">{x.name_th}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", colors.shade(x.learning_area_id))}>{x.code}</span>
                        {v.room && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelTone(v.room))}>{v.room}</span>}
                      </p>
                    </div>
                  ))}
                </div>
                {v.first.approved_at && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE.approved)}>อนุมัติ {thDate(v.first.approved_at)}</span>}
              </div>
              {(!mineOf || v.actions) && (
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  {!mineOf ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={v.teacherName} src={v.teacher ? avatarUrl(v.teacher) : null} className="h-6 w-6 text-[10px]" />
                      <span className="truncate">{v.teacherName}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  {v.actions}
                </div>
              )}
            </div>
          );
        })
      )}

      {selected.length > 0 && (
        <ReviewSheet
          // Re-picked from the live queue so the sheet reflects the decision just made.
          sets={selected}
          subjectById={subjectById}
          teacher={(() => { const t = teacherById.get(selected[0]!.teacher_id); return t ? `${t.first_name} ${t.last_name}` : undefined; })()}
          topicsBySet={topicsBySet}
          onClose={() => setSelectedIds(null)}
          startRejecting={rejectFirst}
          readOnly={!!mineOf}
          onCreateRoom={
            onCreateRoom && selected.some(canCreateRoom)
              ? () => {
                  const createable = selected.filter(canCreateRoom);
                  setSelectedIds(null);
                  onCreateRoom(createable);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function ReviewSheet({
  sets,
  subjectById,
  teacher,
  topicsBySet,
  onClose,
  onCreateRoom,
  readOnly,
  startRejecting,
}: {
  readOnly?: boolean;
  startRejecting?: boolean;
  /** One topic set per subject of the card (same teacher, room and exam). */
  sets: ExamTopicSet[];
  subjectById: Map<string, Subject>;
  teacher: string | undefined;
  topicsBySet: Map<string, ExamTopicLabel[]> | undefined;
  onClose: () => void;
  onCreateRoom?: () => void;
}) {
  const decide = useDecideTopicSet();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(!!startRejecting);
  const [note, setNote] = useState("");
  const first = sets[0]!;
  const pending = sets.filter((s) => s.approval_status === "pending");
  const names = sets.map((s) => subjectById.get(s.subject_id)?.name_th).filter(Boolean).join(" · ");
  // Subjects sharing a plan hold the same topics: show them once, not per subject.
  const topics = [...new Map(sets.flatMap((s) => topicsBySet?.get(s.id) ?? []).map((t) => [t.topic_id, t] as const)).values()];
  const lessons = [...Map.groupBy(topics, (t) => t.lesson)];
  const notes = [...new Set(sets.map((s) => s.approval_note).filter((n): n is string => !!n))];

  async function run(approve: boolean) {
    try {
      await Promise.all(pending.map((s) => decide.mutateAsync({ id: s.id, approve, note })));
      toast(approve ? "อนุมัติแล้ว" : "ไม่อนุมัติแล้ว");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "ไม่สำเร็จ", "error");
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={examLabel(first) ?? "ชุดหัวข้อการสอบ"}
      description={`ครู ${teacher ?? "—"} · ${names}`}
      headerEnd={<ApprovalBadge status={first.approval_status} />}
      footer={
        readOnly ? (
          onCreateRoom ? (
            <Button type="button" className="w-full" onClick={onCreateRoom}>
              สร้างห้องสอบ
            </Button>
          ) : undefined
        ) : pending.length > 0 ? (
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
                <Button type="button" className="flex-1" disabled={!note.trim() || decide.isPending} onClick={() => void run(false)}>
                  ยืนยันไม่อนุมัติ
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setRejecting(true)}>
                ไม่อนุมัติ
              </Button>
              <Button type="button" className="flex-1" disabled={decide.isPending} onClick={() => void run(true)}>
                อนุมัติ
              </Button>
            </div>
          )
        ) : onCreateRoom ? (
          <Button type="button" className="w-full" onClick={onCreateRoom}>
            สร้างห้องสอบ
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="space-y-0.5">
          {sets.map((set) => {
            const subject = subjectById.get(set.subject_id);
            return (
              <p key={set.id} className="text-sm font-semibold">
                {subject ? `${subject.code} ${subject.name_th}` : "—"}
              </p>
            );
          })}
        </div>
        {notes.map((n) => (
          <p key={n} className="text-sm text-muted-foreground">{n}</p>
        ))}
        {first.no_exam ? (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm">ครูแจ้งว่าไม่มีการสอบครั้งนี้</p>
        ) : lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่เลือกหัวข้อ</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">หัวข้อการสอบ {topics.length} หัวข้อ</p>
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
