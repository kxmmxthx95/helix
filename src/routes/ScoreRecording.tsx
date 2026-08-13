import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner, Switch } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useClassroomRoster } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import {
  resolveScorePct,
  scoreToGrade,
  sumItemScores,
  useClearGradeStatus,
  useCreateScoreItem,
  useDeleteScoreItem,
  useGradeStatuses,
  usePassFailScores,
  useSaveAssignmentScorePct,
  useSaveStudentItemScore,
  useScoreItems,
  useSetGradeStatus,
  useSetPassFailScore,
  useStudentItemScores,
} from "@/hooks/useScoreRecording";
import { useDepartmentSettings } from "@/hooks/useSettings";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { useDepartmentTeachingAssignments } from "@/hooks/useTeachingLoad";
import type {
  GradeStatusCode,
  ScoreItem,
  ScoreItemKind,
  Student,
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
  const [term, setTerm] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<TeachingAssignment | null>(null);

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";

  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? new Date().getFullYear() + 543;
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
              setSelected(null);
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
        {splitsByTerm && (
          <div className="ml-auto inline-flex h-8 gap-1 rounded-lg border border-border p-0.5">
            {[1, 2].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTerm(t as 1 | 2);
                  setSelected(null);
                }}
                className={cn(
                  "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                  term === t
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                ภาคเรียน {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกด้านบนเพื่อดูรายวิชาที่สอน" />
        </div>
      ) : selected ? (
        <AssignmentPanel
          assignment={selected}
          subject={subjectById.get(selected.subject_id) ?? null}
          classroomLabel={(() => {
            const c = classroomById.get(selected.classroom_id);
            const g = c ? gradeLevelById.get(c.grade_level_id) : undefined;
            return c ? `${g ? gradeShortLabel(g.code) : "—"}/${c.name}` : "—";
          })()}
          departmentId={departmentId}
          onBack={() => setSelected(null)}
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
                      onClick={() => setSelected(a)}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← กลับ
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {subject?.code ?? "—"} · {subject?.name_th ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">{classroomLabel}</p>
        </div>
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
        <GradedPanel assignment={assignment} roster={roster} departmentId={departmentId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pass/fail

function PassFailPanel({ assignment, roster }: { assignment: TeachingAssignment; roster: Student[] }) {
  const { data: scores = [] } = usePassFailScores(assignment.id);
  const setScore = useSetPassFailScore();
  const byStudent = new Map(scores.map((s) => [s.student_id, s.passed]));

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
                    {s.first_name} {s.last_name}
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
    </div>
  );
}

// ----------------------------------------------------------------- graded

function GradedPanel({
  assignment,
  roster,
  departmentId,
}: {
  assignment: TeachingAssignment;
  roster: Student[];
  departmentId: string;
}) {
  const { data: deptSettings } = useDepartmentSettings(departmentId);
  const { data: items = [] } = useScoreItems(assignment.id);
  const { data: itemScores = [] } = useStudentItemScores(assignment.id);
  const { data: gradeStatuses = [] } = useGradeStatuses(assignment.id);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [openStudent, setOpenStudent] = useState<Student | null>(null);

  const pct = resolveScorePct(assignment, deptSettings);
  const statusByStudent = new Map(gradeStatuses.map((g) => [g.student_id, g.status]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-xs text-muted-foreground">
          สัดส่วนคะแนนเก็บ:สอบ = {pct ? `${pct.collectPct}:${pct.examPct}` : "ยังไม่ได้ตั้งค่า"}
        </p>
        <Button variant="outline" size="sm" onClick={() => setItemsOpen(true)}>
          จัดการรายการคะแนน
        </Button>
      </div>

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
                <th className="w-20 px-3 py-2" />
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
                      {s.first_name} {s.last_name}
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
                    <td className="px-3 py-2 text-center font-semibold">{status ?? scoreToGrade(total)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setOpenStudent(s)}>
                        กรอกคะแนน
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ItemManagerSheet
        open={itemsOpen}
        onClose={() => setItemsOpen(false)}
        assignment={assignment}
        items={items}
        pct={pct}
      />
      <StudentScoreSheet
        student={openStudent}
        assignment={assignment}
        items={items}
        itemScores={itemScores}
        status={openStudent ? (statusByStudent.get(openStudent.id) ?? null) : null}
        onClose={() => setOpenStudent(null)}
      />
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
}: {
  open: boolean;
  onClose: () => void;
  assignment: TeachingAssignment;
  items: ScoreItem[];
  pct: { collectPct: number; examPct: number } | null;
}) {
  const toast = useToast();
  const create = useCreateScoreItem();
  const del = useDeleteScoreItem();
  const savePct = useSaveAssignmentScorePct();
  const [collectCustom, setCollectCustom] = useState(String(assignment.score_collect_pct ?? ""));
  const [examCustom, setExamCustom] = useState(String(assignment.score_exam_pct ?? ""));
  const [splitExam, setSplitExam] = useState(assignment.split_exam_items);

  function savePctSettings() {
    const c = collectCustom.trim() === "" ? null : Number(collectCustom);
    const e = examCustom.trim() === "" ? null : Number(examCustom);
    if ((c === null) !== (e === null)) {
      toast("ต้องตั้งทั้งคู่ หรือเว้นว่างทั้งคู่", "error");
      return;
    }
    savePct.mutate(
      { id: assignment.id, score_collect_pct: c, score_exam_pct: e, split_exam_items: splitExam },
      { onSuccess: () => toast("บันทึกสำเร็จ"), onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error") },
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="จัดการรายการคะแนน" side="left">
      <div className="space-y-4">
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
          <Button size="sm" className="w-full" onClick={savePctSettings} disabled={savePct.isPending}>
            {savePct.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกสัดส่วน"}
          </Button>
        </div>

        <ItemKindSection
          title="คะแนนเก็บ"
          kind="collect"
          items={items.filter((i) => i.kind === "collect")}
          targetMax={pct?.collectPct ?? null}
          allowMultiple
          assignmentId={assignment.id}
          onCreate={(draft) => create.mutate(draft)}
          onDelete={(id) => del.mutate(id)}
        />
        <ItemKindSection
          title="คะแนนสอบ"
          kind="exam"
          items={items.filter((i) => i.kind === "exam")}
          targetMax={pct?.examPct ?? null}
          allowMultiple={splitExam}
          assignmentId={assignment.id}
          onCreate={(draft) => create.mutate(draft)}
          onDelete={(id) => del.mutate(id)}
        />
      </div>
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
}: {
  title: string;
  kind: ScoreItemKind;
  items: ScoreItem[];
  targetMax: number | null;
  allowMultiple: boolean;
  assignmentId: string;
  onCreate: (draft: { teaching_assignment_id: string; kind: ScoreItemKind; label: string; max_score: number }) => void;
  onDelete: (id: string) => void;
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
          <li key={i.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span>
              {i.label} <span className="text-muted-foreground">(เต็ม {i.max_score})</span>
            </span>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onDelete(i.id)}>
              ลบ
            </Button>
          </li>
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

// ------------------------------------------------------------ per-student entry

function StudentScoreSheet({
  student,
  assignment,
  items,
  itemScores,
  status,
  onClose,
}: {
  student: Student | null;
  assignment: TeachingAssignment;
  items: ScoreItem[];
  itemScores: { score_item_id: string; student_id: string; score: number }[];
  status: GradeStatusCode | null;
  onClose: () => void;
}) {
  const save = useSaveStudentItemScore();
  const setStatus = useSetGradeStatus();
  const clearStatus = useClearGradeStatus();

  const scoreByItem = useMemo(
    () => new Map(itemScores.filter((s) => s.student_id === student?.id).map((s) => [s.score_item_id, s.score])),
    [itemScores, student],
  );

  function onScoreChange(itemId: string, raw: string) {
    if (!student) return;
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) return;
    save.mutate({ score_item_id: itemId, student_id: student.id, score: n });
  }

  const total = items.reduce((s, i) => s + (scoreByItem.get(i.id) ?? 0), 0);

  return (
    <Sheet
      open={student !== null}
      onOpenChange={(o) => !o && onClose()}
      title="กรอกคะแนน"
      description={student ? `${student.first_name} ${student.last_name}` : undefined}
    >
      {student && (
        <div className="space-y-4">
          {(["collect", "exam"] as const).map((kind) => {
            const kindItems = items.filter((i) => i.kind === kind);
            if (kindItems.length === 0) return null;
            return (
              <div key={kind} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {kind === "collect" ? "คะแนนเก็บ" : "คะแนนสอบ"}
                </p>
                {kindItems.map((i) => (
                  <Field key={i.id} label={`${i.label} (เต็ม ${i.max_score})`}>
                    <Input
                      type="number"
                      min="0"
                      max={i.max_score}
                      defaultValue={scoreByItem.get(i.id) ?? ""}
                      onBlur={(e) => onScoreChange(i.id, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            );
          })}

          <div className="rounded-lg border border-border p-3 text-sm">
            <p>
              รวม: <span className="font-semibold">{total}</span> · เกรด:{" "}
              <span className="font-semibold">{status ?? scoreToGrade(total)}</span>
            </p>
          </div>

          <Field label="สถานะพิเศษ (ร/มส)">
            <div className="flex gap-2">
              {(["ร", "มส"] as const).map((code) => (
                <Button
                  key={code}
                  variant={status === code ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    setStatus.mutate({ teaching_assignment_id: assignment.id, student_id: student.id, status: code })
                  }
                >
                  {code}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                disabled={!status}
                onClick={() =>
                  clearStatus.mutate({ teachingAssignmentId: assignment.id, studentId: student.id })
                }
              >
                ล้าง
              </Button>
            </div>
          </Field>
        </div>
      )}
    </Sheet>
  );
}
