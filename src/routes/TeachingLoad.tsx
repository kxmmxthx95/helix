import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useProfiles, type ProfileRow } from "@/hooks/useProfiles";
import { useDepartmentSettings } from "@/hooks/useSettings";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import {
  useCreateTeachingAssignment,
  useDeleteTeachingAssignment,
  useDepartmentTeachingAssignments,
  useLinkAssignmentGroup,
  useUnlinkAssignmentGroup,
} from "@/hooks/useTeachingLoad";
import { profileFullName, type TeachingAssignment } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TERM_LABEL: Record<number, string> = { 1: "ภาคเรียน 1", 2: "ภาคเรียน 2" };

export function TeachingLoad() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [term, setTerm] = useState<1 | 2>(1);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";

  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? new Date().getFullYear() + 543;
  const { data: deptSettings } = useDepartmentSettings(departmentId || null);

  if (!me || (!orgWide && !me.roles.includes("dept_head"))) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  return (
    <div className="space-y-4">
      {orgWide && departments.length > 0 && (
        <div className="inline-flex h-8 max-w-full gap-1 overflow-x-auto rounded-lg border border-border p-0.5">
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setPickedDept(d.id);
                setSelectedTeacherId("");
              }}
              className={cn(
                "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                pickedDept === d.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {splitsByTerm && (
        <div className="inline-flex h-8 gap-1 rounded-lg border border-border p-0.5">
          {[1, 2].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerm(t as 1 | 2)}
              className={cn(
                "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                term === t
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {TERM_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {departmentId && (
        <TeachingLoadBoard
          departmentId={departmentId}
          academicYear={academicYear}
          term={splitsByTerm ? term : null}
          minPeriods={deptSettings?.min_periods_per_week ?? null}
          maxPeriods={deptSettings?.max_periods_per_week ?? null}
          mayEdit={mayEdit}
          selectedTeacherId={selectedTeacherId}
          onSelectTeacher={setSelectedTeacherId}
        />
      )}
    </div>
  );
}

function loadStatus(total: number, min: number | null, max: number | null): "low" | "high" | "ok" {
  if (min !== null && total < min) return "low";
  if (max !== null && total > max) return "high";
  return "ok";
}

function LoadBadge({ total, min, max }: { total: number; min: number | null; max: number | null }) {
  const status = loadStatus(total, min, max);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs",
        status === "ok" ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning",
      )}
    >
      {total} คาบ/สัปดาห์
    </span>
  );
}

function TeachingLoadBoard({
  departmentId,
  academicYear,
  term,
  minPeriods,
  maxPeriods,
  mayEdit,
  selectedTeacherId,
  onSelectTeacher,
}: {
  departmentId: string;
  academicYear: number;
  term: number | null;
  minPeriods: number | null;
  maxPeriods: number | null;
  mayEdit: boolean;
  selectedTeacherId: string;
  onSelectTeacher: (id: string) => void;
}) {
  const { data: teachers = [] } = useProfiles({ search: "", departmentId, role: "teacher", active: "true" });
  const { data: assignments = [], isLoading } = useDepartmentTeachingAssignments(
    departmentId,
    academicYear,
    term,
  );
  const del = useDeleteTeachingAssignment();

  const totalByTeacher = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of assignments) totals.set(a.teacher_id, (totals.get(a.teacher_id) ?? 0) + a.periods_per_week);
    return totals;
  }, [assignments]);

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);
  const rows = assignments.filter((a) => a.teacher_id === selectedTeacherId);

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Card className="space-y-3 p-0">
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto text-sm">
          {teachers.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelectTeacher(t.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors",
                  selectedTeacherId === t.id ? "bg-foreground/10" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{profileFullName(t)}</span>
                  {t.teacher_code && (
                    <span className="text-xs text-muted-foreground">{t.teacher_code}</span>
                  )}
                </span>
                <LoadBadge total={totalByTeacher.get(t.id) ?? 0} min={minPeriods} max={maxPeriods} />
              </button>
            </li>
          ))}
          {isLoading && (
            <li className="flex justify-center py-8">
              <Spinner className="h-5 w-5 text-muted-foreground" />
            </li>
          )}
          {!isLoading && teachers.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">ยังไม่มีครูในแผนกนี้</li>
          )}
        </ul>
      </Card>

      {selectedTeacher ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{profileFullName(selectedTeacher)}</h3>
            <LoadBadge total={totalByTeacher.get(selectedTeacher.id) ?? 0} min={minPeriods} max={maxPeriods} />
          </div>

          <ul className="divide-y divide-border text-sm">
            {rows.map((a) => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                allAssignments={assignments}
                teachers={teachers}
                departmentId={departmentId}
                mayEdit={mayEdit}
                onDelete={() => del.mutate(a.id)}
              />
            ))}
            {rows.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">ยังไม่มีวิชาที่มอบหมาย</p>
            )}
          </ul>

          {mayEdit && (
            <NewAssignmentForm
              departmentId={departmentId}
              teacherId={selectedTeacher.id}
              academicYear={academicYear}
              term={term}
            />
          )}
        </Card>
      ) : (
        <Card className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          เลือกครูทางซ้ายเพื่อดู/มอบหมายภาระงานสอน
        </Card>
      )}
    </div>
  );
}

function AssignmentRow({
  assignment,
  allAssignments,
  teachers,
  departmentId,
  mayEdit,
  onDelete,
}: {
  assignment: TeachingAssignment;
  allAssignments: TeachingAssignment[];
  teachers: ProfileRow[];
  departmentId: string;
  mayEdit: boolean;
  onDelete: () => void;
}) {
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const unlink = useUnlinkAssignmentGroup();
  const [linking, setLinking] = useState(false);

  const subject = subjects.find((s) => s.id === assignment.subject_id);
  const classroom = classrooms.find((c) => c.id === assignment.classroom_id);
  const gradeLevelName = gradeLevels.find((g) => g.id === classroom?.grade_level_id)?.name;

  const groupMates = assignment.group_id
    ? allAssignments.filter((a) => a.id !== assignment.id && a.group_id === assignment.group_id)
    : [];

  function label(a: TeachingAssignment) {
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.name;
    const t = teachers.find((x) => x.id === a.teacher_id);
    return `${t ? profileFullName(t) : "—"} · ${s ? s.code : "—"} · ${c ? `${g ?? "—"}/${c.name}` : "—"}`;
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{subject ? `${subject.code} · ${subject.name_th}` : "—"}</span>
        <span className="text-xs text-muted-foreground">
          {classroom ? `${gradeLevelName ?? "—"}/${classroom.name}` : "—"} · {assignment.periods_per_week}{" "}
          คาบ/สัปดาห์
        </span>
        {groupMates.length > 0 && (
          <span className="mt-0.5 block text-xs text-accent">
            เรียนรวม/แบ่งคาบกับ {groupMates.map(label).join(", ")}
          </span>
        )}
      </span>
      {mayEdit && (
        <div className="flex shrink-0 items-center gap-1.5">
          {assignment.group_id ? (
            <Button variant="outline" size="sm" onClick={() => unlink.mutate(assignment.id)}>
              ยกเลิกผูก
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setLinking(true)}>
              ผูกกลุ่ม
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDelete}>
            ลบ
          </Button>
        </div>
      )}
      <GroupLinkSheet
        open={linking}
        assignment={assignment}
        candidates={allAssignments.filter((a) => a.id !== assignment.id)}
        label={label}
        onClose={() => setLinking(false)}
      />
    </li>
  );
}

/** Picks another assignment to tag with a shared group_id — เรียนรวม (same teacher, same slot, different classroom) or แบ่งคาบ (same classroom, different subject/teacher). See migration 0019. */
function GroupLinkSheet({
  open,
  assignment,
  candidates,
  label,
  onClose,
}: {
  open: boolean;
  assignment: TeachingAssignment;
  candidates: TeachingAssignment[];
  label: (a: TeachingAssignment) => string;
  onClose: () => void;
}) {
  const link = useLinkAssignmentGroup();

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="ผูกกลุ่ม (เรียนรวม/แบ่งคาบ)"
      description="เลือกภาระงานสอนที่เกิดขึ้นพร้อมกัน — จะไม่ถูกนับว่าครู/ห้องชนกันในตารางสอน"
    >
      <ul className="divide-y divide-border text-sm">
        {candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => link.mutate({ assignmentId: assignment.id, targetId: c.id }, { onSuccess: onClose })}
              className="w-full py-2 text-left hover:text-accent"
            >
              {label(c)}
              {c.group_id && <span className="ml-1 text-xs text-muted-foreground">(อยู่ในกลุ่มแล้ว)</span>}
            </button>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">ไม่มีภาระงานสอนอื่นให้ผูก</li>
        )}
      </ul>
    </Sheet>
  );
}

function NewAssignmentForm({
  departmentId,
  teacherId,
  academicYear,
  term,
}: {
  departmentId: string;
  teacherId: string;
  academicYear: number;
  term: number | null;
}) {
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    subjectType: "",
    includeInactive: false,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const gradeLevelName = new Map(gradeLevels.map((g) => [g.id, g.name]));
  const create = useCreateTeachingAssignment();

  const [subjectId, setSubjectId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [periods, setPeriods] = useState("");

  useEffect(() => {
    setSubjectId("");
    setClassroomId("");
    setPeriods("");
  }, [teacherId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const periodsPerWeek = Number(periods);
    if (!subjectId || !classroomId || !periodsPerWeek) return;
    create.mutate(
      {
        teacher_id: teacherId,
        subject_id: subjectId,
        classroom_id: classroomId,
        academic_year: academicYear,
        term,
        periods_per_week: periodsPerWeek,
      },
      { onSuccess: () => setSubjectId("") },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="วิชา">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">— เลือกวิชา —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name_th}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ห้อง">
          <Select value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
            <option value="">— เลือกห้อง —</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {gradeLevelName.get(c.grade_level_id) ?? "—"}/{c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          placeholder="คาบ/สัปดาห์"
          value={periods}
          onChange={(e) => setPeriods(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={!subjectId || !classroomId || !periods || create.isPending}>
          {create.isPending ? <Spinner className="h-3 w-3" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </form>
  );
}
