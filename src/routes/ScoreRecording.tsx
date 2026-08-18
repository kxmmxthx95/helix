import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack, Plus, SettingsIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Field, Input, Select, Spinner, Switch } from "@/components/ui";
import { useActiveTerm } from "@/hooks/useAcademicTerms";
import { avatarUrl } from "@/hooks/useAvatar";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  signedSubmissionAttachmentUrl,
  useAssignmentSubmissions,
  useReopenSubmission,
} from "@/hooks/useAssignments";
import { useClassroomRoster } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import {
  resolveScorePct,
  scoreToGrade,
  signedAssignmentAttachmentUrl,
  sumItemScores,
  useAddAssignmentAttachment,
  useAssignmentAttachments,
  useClearGradeStatus,
  useCreateScoreItem,
  useDeleteAssignmentAttachment,
  useDeleteScoreItem,
  usePassFailScores,
  useResolvedGradeStatuses,
  useSaveAssignmentScorePct,
  useSaveStudentItemScore,
  useScoreItems,
  useSetGradeStatus,
  useSetPassFailScore,
  useStudentItemScores,
} from "@/hooks/useScoreRecording";
import { useDepartmentSettings } from "@/hooks/useSettings";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import type { StudentListItem } from "@/hooks/useStudents";
import { useDepartmentTeachingAssignments } from "@/hooks/useTeachingLoad";
import type {
  AssignmentSubmission,
  GradeStatusCode,
  ScoreItem,
  ScoreItemKind,
  Student,
  SubmissionAttachment,
  Subject,
  TeachingAssignment,
} from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function ScoreRecording() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const manager = me ? canManage(me.roles) : false;
  const isTeacher = me ? (me.roles.includes("teacher") as boolean) : false;

  const [pickedDept, setPickedDept] = useState("");
  // An id, not the object itself — so saves (e.g. score ratio) that
  // invalidate/refetch teaching_assignments show up immediately instead of
  // staying stuck on the stale object captured at click time.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";

  // Always the department's current term — no manual toggle (grill decision).
  const { data: activeTerm } = useActiveTerm(departmentId || null);
  const academicYear = activeTerm?.academic_year ?? new Date().getFullYear() + 543;
  const term: 1 | 2 = activeTerm?.term_type === "term2" ? 2 : 1;
  const { data: allAssignments = [], isLoading } = useDepartmentTeachingAssignments(
    departmentId || null,
    academicYear,
    splitsByTerm ? term : null,
  );
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId || null);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);

  if (!me || (!manager && !isTeacher)) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  // Teachers only see their own assignments — grading is subject-specific,
  // not "any teacher" like /behavior (grill decision).
  const assignments = manager ? allAssignments : allAssignments.filter((a) => a.teacher_id === me.id);
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const classroomById = new Map(classrooms.map((c) => [c.id, c]));
  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));

  return (
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {orgWide && departments.length > 0 && (
          <Select
            className="w-auto min-w-[10rem]"
            value={pickedDept}
            onChange={(e) => {
              setPickedDept(e.target.value);
              setSelectedId(null);
            }}
            aria-label="แผนก"
            placeholder="เลือกแผนก"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกด้านบนเพื่อดูรายวิชาที่สอน" />
        </div>
      ) : selected ? (
        <AssignmentPanel
          key={selected.id}
          assignment={selected}
          subject={subjectById.get(selected.subject_id) ?? null}
          classroomLabel={(() => {
            const c = classroomById.get(selected.classroom_id);
            const g = c ? gradeLevelById.get(c.grade_level_id) : undefined;
            return c ? `${g ? gradeShortLabel(g.code) : "—"}/${c.name}` : "—";
          })()}
          departmentId={departmentId}
          onBack={() => setSelectedId(null)}
        />
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ไม่พบรายวิชา"
            description={manager ? "ยังไม่มีภาระงานสอนในแผนกนี้" : "ยังไม่ได้รับมอบหมายวิชาที่สอน"}
          />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">วิชา</th>
                  <th className="px-3 py-2 font-medium">ห้อง</th>
                  {manager && <th className="px-3 py-2 font-medium">ครูผู้สอน</th>}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const subject = subjectById.get(a.subject_id);
                  const c = classroomById.get(a.classroom_id);
                  const g = c ? gradeLevelById.get(c.grade_level_id) : undefined;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                    >
                      <td className="px-3 py-2">
                        <span className="block font-medium">{subject?.code ?? "—"}</span>
                        <span className="block text-muted-foreground">{subject?.name_th ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2">{c ? `${g ? gradeShortLabel(g.code) : "—"}/${c.name}` : "—"}</td>
                      {manager && <td className="px-3 py-2">{a.teacher_id === me.id ? "ตัวเอง" : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- assignment

function AssignmentPanel({
  assignment,
  subject,
  classroomLabel,
  departmentId,
  onBack,
}: {
  assignment: TeachingAssignment;
  subject: Subject | null;
  classroomLabel: string;
  departmentId: string;
  onBack: () => void;
}) {
  const { data: roster = [], isLoading } = useClassroomRoster(assignment.classroom_id, assignment.academic_year);
  const graded = !isLoading && roster.length > 0 && subject?.grading_method !== "pass_fail";

  const [itemsOpen, setItemsOpen] = useState(false);
  const [tab, setTab] = useState<"score" | "collect" | "exam">("score");
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="กลับ">
          <ChevronBack className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {subject?.code ?? "—"} · {subject?.name_th ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">{classroomLabel}</p>
        </div>
        {graded && (
          <>
            {tab === "score" ? (
              <Button
                variant={itemsOpen ? "default" : "outline"}
                size="icon"
                className="shrink-0"
                onClick={() => setItemsOpen(true)}
                aria-label="ตั้งค่าสัดส่วนคะแนน"
                title="ตั้งค่าสัดส่วนคะแนน"
              >
                <SettingsIcon className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => setCreating(true)}
                aria-label={`สร้าง${tab === "exam" ? "การสอบ" : "ใบงาน"}ใหม่`}
                title={`สร้าง${tab === "exam" ? "การสอบ" : "ใบงาน"}ใหม่`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            <Select
              className="w-auto min-w-[8rem]"
              value={tab}
              onChange={(e) => {
                setTab(e.target.value as "score" | "collect" | "exam");
                setCreating(false);
              }}
              aria-label="มุมมอง"
            >
              <option value="score">คะแนน</option>
              <option value="collect">ใบงาน</option>
              <option value="exam">การสอบ</option>
            </Select>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : roster.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาในห้องนี้" />
        </div>
      ) : subject?.grading_method === "pass_fail" ? (
        <PassFailPanel assignment={assignment} roster={roster} />
      ) : (
        <GradedPanel
          assignment={assignment}
          roster={roster}
          departmentId={departmentId}
          tab={tab}
          itemsOpen={itemsOpen}
          onItemsOpenChange={setItemsOpen}
          creating={creating}
          onCreatingChange={setCreating}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pass/fail

function PassFailPanel({ assignment, roster }: { assignment: TeachingAssignment; roster: StudentListItem[] }) {
  const { data: scores = [] } = usePassFailScores(assignment.id);
  const setScore = useSetPassFailScore();
  const byStudent = new Map(scores.map((s) => [s.student_id, s.passed]));
  const [avatarStudent, setAvatarStudent] = useState<StudentListItem | null>(null);

  return (
    <div className="table-panel flex-1">
      <div className="table-panel-scroll">
        <table className="w-full min-w-[24rem] text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
              <th className="px-3 py-2 font-medium">รายชื่อ</th>
              <th className="px-3 py-2 text-center font-medium">ผลการเรียน</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((s) => {
              const passed = byStudent.get(s.id);
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2">{s.student_code}</td>
                  <td className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => setAvatarStudent(s)}
                      className="tappable flex items-center gap-2"
                    >
                      <Avatar name={`${s.first_name} ${s.last_name}`} src={s.profile ? avatarUrl(s.profile) : null} className="h-7 w-7 text-[10px]" />
                      {s.first_name} {s.last_name}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center gap-2">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          onClick={() =>
                            setScore.mutate({ teaching_assignment_id: assignment.id, student_id: s.id, passed: v })
                          }
                          className={cn(
                            "tappable rounded-full px-3 py-1 text-[10px] font-medium",
                            passed === v
                              ? v
                                ? "bg-success/15 text-success"
                                : "bg-destructive/15 text-destructive"
                              : "bg-muted text-muted-foreground hover:bg-muted/70",
                          )}
                        >
                          {v ? "ผ่าน" : "ไม่ผ่าน"}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <StudentAvatarSheet student={avatarStudent} onClose={() => setAvatarStudent(null)} />
    </div>
  );
}

// ----------------------------------------------------------------- graded

function GradedPanel({
  assignment,
  roster,
  departmentId,
  tab,
  itemsOpen,
  onItemsOpenChange,
  creating,
  onCreatingChange,
}: {
  assignment: TeachingAssignment;
  roster: StudentListItem[];
  departmentId: string;
  tab: "score" | "collect" | "exam";
  itemsOpen: boolean;
  onItemsOpenChange: (v: boolean) => void;
  creating: boolean;
  onCreatingChange: (v: boolean) => void;
}) {
  const { data: deptSettings } = useDepartmentSettings(departmentId);
  const { data: items = [] } = useScoreItems(assignment.id);
  const { data: itemScores = [] } = useStudentItemScores(assignment.id);
  const { data: resolvedStatuses = [] } = useResolvedGradeStatuses(assignment.id);
  const [avatarStudent, setAvatarStudent] = useState<StudentListItem | null>(null);
  const [statusStudent, setStatusStudent] = useState<StudentListItem | null>(null);

  const pct = resolveScorePct(assignment, deptSettings);
  const statusByStudent = new Map(resolvedStatuses.map((g) => [g.student_id, g.status]));
  const manualByStudent = new Set(resolvedStatuses.filter((g) => g.is_manual).map((g) => g.student_id));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {tab === "score" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="table-panel flex-1">
            <div className="table-panel-scroll">
              <table className="w-full min-w-[36rem] text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                    <th className="px-3 py-2 font-medium">รายชื่อ</th>
                    <th className="px-3 py-2 text-right font-medium">เก็บ</th>
                    <th className="px-3 py-2 text-right font-medium">สอบ</th>
                    <th className="px-3 py-2 text-right font-medium">รวม</th>
                    <th className="px-3 py-2 text-center font-medium">เกรด</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => {
                    const collect = sumItemScores(items, itemScores, s.id, "collect");
                    const exam = sumItemScores(items, itemScores, s.id, "exam");
                    const total = collect.score + exam.score;
                    const status = statusByStudent.get(s.id);
                    return (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-3 py-2">{s.student_code}</td>
                        <td className="px-3 py-2 font-medium">
                          <button
                            type="button"
                            onClick={() => setAvatarStudent(s)}
                            className="tappable flex items-center gap-2"
                          >
                            <Avatar name={`${s.first_name} ${s.last_name}`} src={s.profile ? avatarUrl(s.profile) : null} className="h-7 w-7 text-[10px]" />
                            {s.first_name} {s.last_name}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {collect.score}
                          <span className="text-muted-foreground">/{collect.max}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {exam.score}
                          <span className="text-muted-foreground">/{exam.max}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{total}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setStatusStudent(s)}
                            className={cn(
                              "tappable rounded px-2 py-0.5 font-semibold hover:bg-muted",
                              manualByStudent.has(s.id) && "underline decoration-dotted underline-offset-2",
                            )}
                          >
                            {status ?? scoreToGrade(total)}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <AssignmentKindPanel
          key={tab}
          kind={tab}
          assignmentId={assignment.id}
          items={items}
          roster={roster}
          creating={creating}
          onCreatingChange={onCreatingChange}
        />
      )}

      <ItemManagerSheet
        open={itemsOpen}
        onClose={() => onItemsOpenChange(false)}
        assignment={assignment}
        items={items}
        pct={pct}
        roster={roster}
      />
      <StudentAvatarSheet student={avatarStudent} onClose={() => setAvatarStudent(null)} />
      <GradeStatusPopup
        student={statusStudent}
        assignmentId={assignment.id}
        computedStatus={statusStudent ? (statusByStudent.get(statusStudent.id) ?? null) : null}
        isManual={statusStudent ? manualByStudent.has(statusStudent.id) : false}
        onClose={() => setStatusStudent(null)}
      />
    </div>
  );
}

/** Score-ratio form — top section of ItemManagerSheet, merged in so one gear button covers both. */
function ScoreRatioFields({ assignment }: { assignment: TeachingAssignment }) {
  const toast = useToast();
  const savePct = useSaveAssignmentScorePct();
  const [collectCustom, setCollectCustom] = useState(String(assignment.score_collect_pct ?? ""));
  const [examCustom, setExamCustom] = useState(String(assignment.score_exam_pct ?? ""));
  const [splitExam, setSplitExam] = useState(assignment.split_exam_items);

  function save() {
    const c = collectCustom.trim() === "" ? null : Number(collectCustom);
    const e = examCustom.trim() === "" ? null : Number(examCustom);
    if ((c === null) !== (e === null)) {
      toast("ต้องตั้งทั้งคู่ หรือเว้นว่างทั้งคู่", "error");
      return;
    }
    savePct.mutate(
      { id: assignment.id, score_collect_pct: c, score_exam_pct: e, split_exam_items: splitExam },
      {
        onSuccess: () => toast("บันทึกสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">สัดส่วนของวิชานี้ (เว้นว่าง = ใช้ค่าแผนก)</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="เก็บ (%)">
          <Input type="number" value={collectCustom} onChange={(e) => setCollectCustom(e.target.value)} />
        </Field>
        <Field label="สอบ (%)">
          <Input type="number" value={examCustom} onChange={(e) => setExamCustom(e.target.value)} />
        </Field>
      </div>
      <Switch checked={splitExam} onChange={setSplitExam} label="แยกกลางภาค/ปลายภาค" />
      <Button size="sm" className="w-full" onClick={save} disabled={savePct.isPending}>
        {savePct.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกสัดส่วน"}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------ item manager

function ItemManagerSheet({
  open,
  onClose,
  assignment,
  items,
  pct,
  roster,
}: {
  open: boolean;
  onClose: () => void;
  assignment: TeachingAssignment;
  items: ScoreItem[];
  pct: { collectPct: number; examPct: number } | null;
  roster: Student[];
}) {
  const create = useCreateScoreItem();
  const del = useDeleteScoreItem();
  const [gradingItem, setGradingItem] = useState<ScoreItem | null>(null);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="จัดการรายการคะแนน" side="left">
      <div className="space-y-4">
        <ScoreRatioFields assignment={assignment} />
        <ItemKindSection
          title="คะแนนเก็บ"
          kind="collect"
          items={items.filter((i) => i.kind === "collect")}
          targetMax={pct?.collectPct ?? null}
          allowMultiple
          assignmentId={assignment.id}
          onCreate={(draft) => create.mutate(draft)}
          onDelete={(id) => del.mutate(id)}
          onGrade={setGradingItem}
        />
        <ItemKindSection
          title="คะแนนสอบ"
          kind="exam"
          items={items.filter((i) => i.kind === "exam")}
          targetMax={pct?.examPct ?? null}
          allowMultiple={assignment.split_exam_items}
          assignmentId={assignment.id}
          onCreate={(draft) => create.mutate(draft)}
          onDelete={(id) => del.mutate(id)}
          onGrade={setGradingItem}
        />
      </div>

      <SubmissionsSheet item={gradingItem} roster={roster} onClose={() => setGradingItem(null)} />
    </Sheet>
  );
}

function ItemKindSection({
  title,
  kind,
  items,
  targetMax,
  allowMultiple,
  assignmentId,
  onCreate,
  onDelete,
  onGrade,
}: {
  title: string;
  kind: ScoreItemKind;
  items: ScoreItem[];
  targetMax: number | null;
  allowMultiple: boolean;
  assignmentId: string;
  onCreate: (draft: { teaching_assignment_id: string; kind: ScoreItemKind; label: string; max_score: number }) => void;
  onDelete: (id: string) => void;
  onGrade: (item: ScoreItem) => void;
}) {
  const [label, setLabel] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const sum = items.reduce((s, i) => s + i.max_score, 0);
  const canAdd = allowMultiple || items.length === 0;

  function add() {
    const n = Number(maxScore);
    if (!label.trim() || !n) return;
    onCreate({ teaching_assignment_id: assignmentId, kind, label: label.trim(), max_score: n });
    setLabel("");
    setMaxScore("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{title}</p>
        {targetMax !== null && (
          <p className={cn("text-[10px]", sum === targetMax ? "text-muted-foreground" : "text-warning")}>
            รวมคะแนนเต็มที่ตั้งไว้: {sum}/{targetMax}
          </p>
        )}
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border text-xs">
        {items.map((i) => (
          <ItemRow key={i.id} item={i} onDelete={() => onDelete(i.id)} onGrade={() => onGrade(i)} />
        ))}
        {items.length === 0 && <li className="px-2 py-3 text-center text-muted-foreground">ยังไม่มีรายการ</li>}
      </ul>
      {canAdd && (
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ชื่อรายการ" className="min-w-0 flex-1" />
          <Input
            type="number"
            min="1"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            placeholder="เต็ม"
            className="w-16 shrink-0"
          />
          <Button size="icon" className="shrink-0" onClick={add} disabled={!label.trim() || !maxScore} aria-label="เพิ่มรายการ">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ assignment list

/** The ใบงาน/การสอบ tab body in GradedPanel — table of posted assignments of that kind. "+ สร้างใหม่" (in GradedPanel's header) opens AssignmentPostSheet on top. */
function AssignmentKindPanel({
  kind,
  assignmentId,
  items,
  roster,
  creating,
  onCreatingChange,
}: {
  kind: ScoreItemKind;
  assignmentId: string;
  items: ScoreItem[];
  roster: Student[];
  creating: boolean;
  onCreatingChange: (v: boolean) => void;
}) {
  const del = useDeleteScoreItem();
  const [gradingItem, setGradingItem] = useState<ScoreItem | null>(null);
  const title = kind === "exam" ? "การสอบ" : "ใบงาน";
  const posted = items.filter((i) => i.kind === kind && i.description);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {posted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={`ยังไม่มี${title}`} description={`กด "+ สร้าง${title}ใหม่" เพื่อเริ่มโพสต์`} />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[26rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">ชื่อ / รายละเอียด</th>
                  <th className="px-2 py-1.5 font-medium">กำหนดส่ง</th>
                  <th className="px-2 py-1.5 font-medium">ส่งออนไลน์</th>
                  <th className="w-24 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {posted.map((i) => (
                  <AssignmentTableRow
                    key={i.id}
                    item={i}
                    onDelete={() => del.mutate(i.id)}
                    onGrade={() => setGradingItem(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AssignmentPostSheet kind={creating ? kind : null} assignmentId={assignmentId} onClose={() => onCreatingChange(false)} />
      <SubmissionsSheet item={gradingItem} roster={roster} onClose={() => setGradingItem(null)} />
    </div>
  );
}

function AssignmentTableRow({ item, onDelete, onGrade }: { item: ScoreItem; onDelete: () => void; onGrade: () => void }) {
  const { data: attachments = [] } = useAssignmentAttachments(item.id);

  async function openAttachment(path: string) {
    try {
      window.open(await signedAssignmentAttachmentUrl(path), "_blank");
    } catch {
      /* best-effort — ignore */
    }
  }

  return (
    <tr onClick={onGrade} className="cursor-pointer border-t border-border align-top hover:bg-muted active:bg-muted">
      <td className="px-2 py-2">
        <p className="font-medium">
          {item.label} <span className="font-normal text-muted-foreground">(เต็ม {item.max_score})</span>
        </p>
        {item.description && <p className="text-muted-foreground">{item.description}</p>}
        {attachments.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {attachments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAttachment(a.storage_path);
                  }}
                >
                  {a.file_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-2 py-2 whitespace-nowrap">{item.due_date ?? "—"}</td>
      <td className="px-2 py-2">{item.requires_submission ? "ใช่" : "ไม่ใช่"}</td>
      <td className="px-2 py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ลบ
        </Button>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------ post as assignment

/** Dedicated entry points from GradedPanel's header ("สร้างใบงาน"/"สร้างการสอบ") — the rich due-date/submission/attachment form, kept out of the quick add above. */
function AssignmentPostSheet({
  kind,
  assignmentId,
  onClose,
}: {
  kind: ScoreItemKind | null;
  assignmentId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateScoreItem();
  const addAttachment = useAddAssignmentAttachment();
  const [label, setLabel] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [requiresSubmission, setRequiresSubmission] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setLabel("");
    setMaxScore("");
    setDescription("");
    setDueDate("");
    setScheduled(false);
    setPublishAt("");
    setRequiresSubmission(false);
    setFiles([]);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    if (!kind) return;
    const n = Number(maxScore);
    if (!label.trim() || !n) return;
    if (scheduled && !publishAt) {
      toast("เลือกวันเวลาที่จะโพสต์", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await create.mutateAsync({
        teaching_assignment_id: assignmentId,
        kind,
        label: label.trim(),
        max_score: n,
        description: description.trim() || null,
        due_date: dueDate || null,
        publish_at: scheduled && publishAt ? new Date(publishAt).toISOString() : undefined,
        requires_submission: requiresSubmission,
      });
      for (const file of files) await addAttachment.mutateAsync({ scoreItemId: created.id, file });
      toast(kind === "collect" ? "สร้างใบงานสำเร็จ" : "สร้างการสอบสำเร็จ");
      close();
    } catch (err) {
      toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={kind !== null}
      onOpenChange={(o) => !o && close()}
      title={kind === "exam" ? "สร้างการสอบ" : "สร้างใบงาน"}
    >
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Field label="ชื่อรายการ">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น ใบงานที่ 1" />
            </Field>
          </div>
          <div className="w-16 shrink-0">
            <Field label="เต็ม">
              <Input type="number" min="1" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            </Field>
          </div>
        </div>
        <Field label="คำอธิบายงาน">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดงาน" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="กำหนดส่ง (ถ้ามี)">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="เวลาโพสต์">
            <Select value={scheduled ? "scheduled" : "now"} onChange={(e) => setScheduled(e.target.value === "scheduled")}>
              <option value="now">ทันที</option>
              <option value="scheduled">ตั้งเวลา</option>
            </Select>
          </Field>
        </div>
        {scheduled && (
          <Field label="วันเวลาที่จะโพสต์">
            <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
          </Field>
        )}
        <Switch checked={requiresSubmission} onChange={setRequiresSubmission} label="ต้องให้นักเรียนส่งออนไลน์" />
        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])].slice(0, MAX_ATTACHMENTS);
              if (picked.some((f) => f.size > MAX_ATTACHMENT_BYTES)) {
                toast("ไฟล์ต้องมีขนาดไม่เกิน 10MB", "error");
                return;
              }
              setFiles(picked);
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {files.length ? `เลือกแล้ว ${files.length} ไฟล์` : "แนบไฟล์ (สูงสุด 5 ไฟล์)"}
          </Button>
        </div>
        <Button className="w-full" onClick={submit} disabled={!label.trim() || !maxScore || saving}>
          {saving ? <Spinner className="h-3 w-3" /> : kind === "exam" ? "สร้างการสอบ" : "สร้างใบงาน"}
        </Button>
      </div>
    </Sheet>
  );
}

function ItemRow({ item, onDelete, onGrade }: { item: ScoreItem; onDelete: () => void; onGrade: () => void }) {
  const { data: attachments = [] } = useAssignmentAttachments(item.description ? item.id : null);
  const deleteAttachment = useDeleteAssignmentAttachment();

  async function openAttachment(path: string) {
    try {
      window.open(await signedAssignmentAttachmentUrl(path), "_blank");
    } catch {
      /* best-effort — ignore */
    }
  }

  return (
    <li className="flex items-center justify-between gap-2 px-2 py-1.5">
      <div className="min-w-0">
        <span>
          {item.label} <span className="text-muted-foreground">(เต็ม {item.max_score})</span>
        </span>
        {item.description && (
          <p className="text-[10px] text-muted-foreground">
            งานที่โพสต์{item.due_date ? ` · กำหนดส่ง ${item.due_date}` : ""}
            {item.requires_submission ? " · ต้องส่งออนไลน์" : ""}
          </p>
        )}
        {attachments.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-1">
                <button type="button" className="text-primary underline" onClick={() => openAttachment(a.storage_path)}>
                  {a.file_name}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground"
                  aria-label="ลบไฟล์แนบ"
                  onClick={() => deleteAttachment.mutate(a)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.requires_submission && (
          <Button variant="outline" size="sm" onClick={onGrade}>
            งานที่ส่ง
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onDelete}>
          ลบ
        </Button>
      </div>
    </li>
  );
}

// ------------------------------------------------------------ grading submissions

function SubmissionsSheet({
  item,
  roster,
  onClose,
}: {
  item: ScoreItem | null;
  roster: Student[];
  onClose: () => void;
}) {
  const { data: submissions = [] } = useAssignmentSubmissions(item?.id ?? null);
  const [openStudent, setOpenStudent] = useState<Student | null>(null);
  const byStudent = new Map(submissions.map((s) => [s.student_id, s]));

  return (
    <Sheet open={item !== null} onOpenChange={(o) => !o && onClose()} title="งานที่ส่ง" description={item?.label}>
      {item && (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border text-xs">
            {roster.map((s) => {
              const submission = byStudent.get(s.id) ?? null;
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span>
                    {s.first_name} {s.last_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge submission={submission} dueDate={item.due_date} />
                    <Button variant="outline" size="sm" onClick={() => setOpenStudent(s)}>
                      ตรวจ
                    </Button>
                  </div>
                </li>
              );
            })}
            {roster.length === 0 && <li className="px-2 py-3 text-center text-muted-foreground">ไม่มีนักเรียน</li>}
          </ul>
          <GradeSubmissionSheet item={item} student={openStudent} onClose={() => setOpenStudent(null)} />
        </>
      )}
    </Sheet>
  );
}

function StatusBadge({ submission, dueDate }: { submission: AssignmentSubmission | null; dueDate: string | null }) {
  const late = !!submission && !!dueDate && submission.submitted_at.slice(0, 10) > dueDate;
  if (!submission) return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">ยังไม่ส่ง</span>;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", late ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
      {late ? "ส่งช้า" : "ส่งแล้ว"}
    </span>
  );
}

function GradeSubmissionSheet({
  item,
  student,
  onClose,
}: {
  item: ScoreItem;
  student: Student | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: submissions = [] } = useAssignmentSubmissions(item.id);
  const submission = student ? (submissions.find((s) => s.student_id === student.id) ?? null) : null;
  const { data: itemScores = [] } = useStudentItemScores(item.teaching_assignment_id);
  const saveScore = useSaveStudentItemScore();
  const reopen = useReopenSubmission();
  const existing = student ? itemScores.find((s) => s.score_item_id === item.id && s.student_id === student.id) : undefined;
  const scoreRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLInputElement>(null);

  async function openAttachment(path: string) {
    try {
      window.open(await signedSubmissionAttachmentUrl(path), "_blank");
    } catch {
      /* best-effort — ignore */
    }
  }

  function save() {
    if (!student) return;
    const raw = scoreRef.current?.value ?? "";
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) return;
    const feedback = feedbackRef.current?.value.trim() || null;
    saveScore.mutate(
      { score_item_id: item.id, student_id: student.id, score: n, feedback },
      {
        onSuccess: () => {
          toast("บันทึกคะแนนสำเร็จ");
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={student !== null}
      onOpenChange={(o) => !o && onClose()}
      title="ตรวจงาน"
      description={student ? `${student.first_name} ${student.last_name}` : undefined}
    >
      {student && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">งานที่ส่ง</p>
            {submission ? (
              <>
                {submission.content && <p className="whitespace-pre-wrap">{submission.content}</p>}
                {submission.attachments.length > 0 && (
                  <ul className="space-y-1">
                    {submission.attachments.map((a: SubmissionAttachment) => (
                      <li key={a.id}>
                        <button type="button" className="text-primary underline" onClick={() => openAttachment(a.storage_path)}>
                          {a.file_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!submission.content && submission.attachments.length === 0 && (
                  <p className="text-muted-foreground">ส่งงานแล้ว (ไม่มีข้อความ/ไฟล์)</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">ยังไม่ได้ส่งงาน</p>
            )}
          </div>

          <Field label={`คะแนน (เต็ม ${item.max_score})`}>
            <Input
              key={`${student.id}-score`}
              ref={scoreRef}
              type="number"
              min="0"
              max={item.max_score}
              defaultValue={existing?.score ?? ""}
            />
          </Field>
          <Field label="ความเห็น/feedback">
            <Input
              key={`${student.id}-feedback`}
              ref={feedbackRef}
              defaultValue={existing?.feedback ?? ""}
              placeholder="ให้ความเห็นกับงานชิ้นนี้"
            />
          </Field>
          <Button className="w-full" onClick={save} disabled={saveScore.isPending}>
            {saveScore.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกคะแนน"}
          </Button>

          {submission && (
            <Field label="เปิดให้ส่งใหม่">
              <Switch
                checked={submission.reopened}
                onChange={(v) => reopen.mutate({ id: submission.id, reopened: v })}
                label={submission.reopened ? "เปิดอยู่ — นักเรียนแก้ไขงานที่ส่งได้" : "ปิดอยู่"}
              />
            </Field>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------ per-student entry

function StudentAvatarSheet({ student, onClose }: { student: StudentListItem | null; onClose: () => void }) {
  if (!student) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-sidebar flex flex-col items-center gap-3 rounded-2xl bg-white/[0.85] p-6 dark:bg-white/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar
          name={`${student.first_name} ${student.last_name}`}
          src={student.profile ? avatarUrl(student.profile) : null}
          className="h-40 w-40 text-4xl"
        />
        <div className="font-heading text-base font-semibold">
          {student.first_name} {student.last_name}
        </div>
      </div>
    </div>
  );
}

/** เกรด popup — shows the computed ร/มส (from attendance/submissions, migration 0042) with a manual override escape hatch. */
function GradeStatusPopup({
  student,
  assignmentId,
  computedStatus,
  isManual,
  onClose,
}: {
  student: StudentListItem | null;
  assignmentId: string;
  computedStatus: GradeStatusCode | null;
  isManual: boolean;
  onClose: () => void;
}) {
  const setStatus = useSetGradeStatus();
  const clearStatus = useClearGradeStatus();
  if (!student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-sidebar flex w-full max-w-xs flex-col gap-3 rounded-2xl bg-white/[0.85] p-4 dark:bg-white/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-heading text-sm font-semibold">
          {student.first_name} {student.last_name}
        </div>
        <p className="text-xs text-muted-foreground">
          {computedStatus
            ? `สถานะปัจจุบัน: ${computedStatus}${isManual ? " (ตั้งเอง)" : " (คำนวณอัตโนมัติ)"}`
            : "สถานะปัจจุบัน: ปกติ"}
        </p>
        <Field label="ตั้งสถานะเอง (ทับค่าอัตโนมัติ)">
          <div className="flex gap-2">
            {(["ร", "มส"] as const).map((code) => (
              <Button
                key={code}
                variant={isManual && computedStatus === code ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setStatus.mutate({ teaching_assignment_id: assignmentId, student_id: student.id, status: code })}
              >
                {code}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              disabled={!isManual}
              onClick={() => clearStatus.mutate({ teachingAssignmentId: assignmentId, studentId: student.id })}
            >
              ล้าง
            </Button>
          </div>
        </Field>
      </div>
    </div>
  );
}
