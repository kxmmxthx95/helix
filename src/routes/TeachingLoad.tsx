import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus, Users, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, EmptyState, Field, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useSubjects } from "@/hooks/useCurriculum";
import { useCurriculumSubjectsAtGrade, useGradeLevels } from "@/hooks/useCurriculumStructure";
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
import { gradeShortLabel } from "@/lib/gradeLevels";
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
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {orgWide && departments.length > 0 && (
          <Select
            className="w-auto min-w-[10rem]"
            value={pickedDept}
            onChange={(e) => {
              setPickedDept(e.target.value);
              setSelectedTeacherId("");
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
      </div>

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูภาระงานสอน" icon={Users} />
        </div>
      ) : (
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

type TeacherSortKey = "name" | "code" | "load";

function SortTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: TeacherSortKey;
  sortKey: TeacherSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: TeacherSortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th
      className="px-3 py-2 font-medium"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="tappable inline-flex items-center gap-1 text-left hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        <span className={active ? "text-foreground" : "text-muted-foreground/40"} aria-hidden>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
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
  const [sortKey, setSortKey] = useState<TeacherSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const totalByTeacher = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of assignments) totals.set(a.teacher_id, (totals.get(a.teacher_id) ?? 0) + a.periods_per_week);
    return totals;
  }, [assignments]);

  const sortedTeachers = useMemo(() => {
    const list = [...teachers];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = profileFullName(a).localeCompare(profileFullName(b), "th");
          break;
        case "code":
          cmp = (a.teacher_code ?? "").localeCompare(b.teacher_code ?? "", "th", { numeric: true });
          break;
        case "load":
          cmp = (totalByTeacher.get(a.id) ?? 0) - (totalByTeacher.get(b.id) ?? 0);
          break;
      }
      return cmp * dir;
    });
    return list;
  }, [teachers, sortKey, sortDir, totalByTeacher]);

  function onSort(key: TeacherSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);
  const rows = assignments.filter((a) => a.teacher_id === selectedTeacherId);

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:items-stretch">
      <div className="table-panel">
        <div className="table-panel-scroll">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <SortTh label="รายชื่อ" column="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="รหัส" column="code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="ภาระงานสอน" column="load" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {sortedTeachers.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onSelectTeacher(t.id)}
                  className={cn(
                    "cursor-pointer border-t border-border",
                    selectedTeacherId === t.id ? "bg-foreground/10" : "hover:bg-muted active:bg-muted",
                  )}
                >
                  <td className="px-3 py-2 font-medium">{profileFullName(t)}</td>
                  <td className="px-3 py-2">{t.teacher_code || "—"}</td>
                  <td className="px-3 py-2">
                    <LoadBadge total={totalByTeacher.get(t.id) ?? 0} min={minPeriods} max={maxPeriods} />
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr role="status" aria-label="กำลังโหลด">
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-24" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-3 w-12" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-20 rounded-full" />
                  </td>
                </tr>
              )}
              {!isLoading && teachers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    ยังไม่มีครูในแผนกนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTeacher ? (
        <div className="flex min-h-0 flex-col gap-3">
          <h3 className="shrink-0 text-sm font-semibold">{profileFullName(selectedTeacher)}</h3>

          {mayEdit && (
            <NewAssignmentForm
              departmentId={departmentId}
              teacherId={selectedTeacher.id}
              academicYear={academicYear}
              term={term}
              existingAssignments={rows}
            />
          )}

          {rows.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState title="ยังไม่มีวิชาที่มอบหมาย" description="กดเพิ่มรายวิชาเพื่อมอบหมายภาระงานสอน" />
            </div>
          ) : (
            <div className="table-panel">
              <div className="table-panel-scroll">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">วิชา</th>
                      <th className="px-3 py-2 font-medium">ห้อง</th>
                      <th className="px-3 py-2 font-medium">คาบ/สัปดาห์</th>
                      {mayEdit && <th className="w-px px-3 py-2 font-medium" />}
                    </tr>
                  </thead>
                  <tbody>
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
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="table-panel">
          <div className="flex flex-1 items-center justify-center px-3 py-8 text-sm text-muted-foreground">
            เลือกครูทางซ้ายเพื่อดู/มอบหมายภาระงานสอน
          </div>
        </div>
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
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const unlink = useUnlinkAssignmentGroup();
  const [linking, setLinking] = useState(false);

  const subject = subjects.find((s) => s.id === assignment.subject_id);
  const classroom = classrooms.find((c) => c.id === assignment.classroom_id);
  const gradeLevel = gradeLevels.find((g) => g.id === classroom?.grade_level_id);
  const gradeLabel = gradeLevel ? gradeShortLabel(gradeLevel.code) : null;

  const groupMates = assignment.group_id
    ? allAssignments.filter((a) => a.id !== assignment.id && a.group_id === assignment.group_id)
    : [];

  function label(a: TeachingAssignment) {
    const s = subjects.find((x) => x.id === a.subject_id);
    const c = classrooms.find((x) => x.id === a.classroom_id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id);
    const gLabel = g ? gradeShortLabel(g.code) : null;
    const t = teachers.find((x) => x.id === a.teacher_id);
    return `${t ? profileFullName(t) : "—"} · ${s ? s.code : "—"} · ${c ? `${gLabel ?? "—"}/${c.name}` : "—"}`;
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">
        <span className="block font-medium">{subject?.code ?? "—"}</span>
        {subject && <span className="block text-muted-foreground">{subject.name_th}</span>}
        {groupMates.length > 0 && (
          <span className="mt-0.5 block text-[10px] text-accent">
            เรียนรวม/แบ่งคาบกับ {groupMates.map(label).join(", ")}
          </span>
        )}
      </td>
      <td className="px-3 py-2">{classroom ? `${gradeLabel ?? "—"}/${classroom.name}` : "—"}</td>
      <td className="px-3 py-2">{assignment.periods_per_week}</td>
      {mayEdit && (
        <td className="px-3 py-2">
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {assignment.group_id ? (
              <Button variant="outline" size="sm" onClick={() => unlink.mutate(assignment.id)}>
                ยกเลิกผูก
              </Button>
            ) : (
              <Button variant="ghost" size="icon" aria-label="ผูกกลุ่ม" onClick={() => setLinking(true)}>
                <Users className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="ลบ" onClick={onDelete}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <GroupLinkSheet
            open={linking}
            assignment={assignment}
            candidates={allAssignments.filter((a) => a.id !== assignment.id)}
            label={label}
            onClose={() => setLinking(false)}
          />
        </td>
      )}
    </tr>
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
  existingAssignments,
}: {
  departmentId: string;
  teacherId: string;
  academicYear: number;
  term: number | null;
  existingAssignments: TeachingAssignment[];
}) {
  const [open, setOpen] = useState(false);
  const [classroomId, setClassroomId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [periods, setPeriods] = useState("");

  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: false,
  });
  const create = useCreateTeachingAssignment();

  const classroom = classrooms.find((c) => c.id === classroomId);
  const gradeLevelId = classroom?.grade_level_id ?? null;
  const { data: curriculumRows = [] } = useCurriculumSubjectsAtGrade(gradeLevelId);

  const termRows = useMemo(
    () => curriculumRows.filter((r) => (term === null ? r.term === null : r.term === term)),
    [curriculumRows, term],
  );

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const assignedSubjectIds = useMemo(() => {
    if (!classroomId) return new Set<string>();
    return new Set(
      existingAssignments.filter((a) => a.classroom_id === classroomId).map((a) => a.subject_id),
    );
  }, [existingAssignments, classroomId]);

  const availableSubjects = useMemo(() => {
    if (!classroomId) return [];
    const seen = new Set<string>();
    const out: { id: string; code: string; name_th: string; hours_per_week: number }[] = [];
    for (const r of termRows) {
      if (assignedSubjectIds.has(r.subject_id) || seen.has(r.subject_id)) continue;
      seen.add(r.subject_id);
      const s = subjectById.get(r.subject_id);
      if (!s) continue;
      out.push({ id: s.id, code: s.code, name_th: s.name_th, hours_per_week: s.hours_per_week });
    }
    out.sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
    return out;
  }, [classroomId, termRows, assignedSubjectIds, subjectById]);

  useEffect(() => {
    setClassroomId("");
    setSubjectId("");
    setPeriods("");
  }, [teacherId]);

  useEffect(() => {
    setSubjectId("");
    setPeriods("");
  }, [classroomId]);

  function selectSubject(id: string, hours: number) {
    setSubjectId(id);
    setPeriods(String(hours));
  }

  function submit() {
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
      {
        onSuccess: () => {
          setSubjectId("");
          setPeriods("");
        },
      },
    );
  }

  const gradeLevelName = useMemo(
    () => new Map(gradeLevels.map((g) => [g.id, gradeShortLabel(g.code)])),
    [gradeLevels],
  );
  const gradeSort = useMemo(
    () => new Map(gradeLevels.map((g) => [g.id, g.sort_order])),
    [gradeLevels],
  );
  const sortedClassrooms = useMemo(() => {
    return [...classrooms].sort((a, b) => {
      const ga = gradeSort.get(a.grade_level_id) ?? 0;
      const gb = gradeSort.get(b.grade_level_id) ?? 0;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name, "th", { numeric: true });
    });
  }, [classrooms, gradeSort]);

  const selectedSubject = availableSubjects.find((s) => s.id === subjectId);

  return (
    <>
      <Button className="w-full shrink-0" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        เพิ่มรายวิชา
      </Button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setSubjectId("");
            setPeriods("");
          }
        }}
        side="left"
        title="เพิ่มรายวิชา"
        footer={
          selectedSubject ? (
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                placeholder="คาบ/สัปดาห์"
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
                className="flex-1"
                aria-label="คาบต่อสัปดาห์"
              />
              <Button onClick={submit} disabled={!periods || create.isPending}>
                {create.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <Field label="ห้อง">
            <Select value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
              <option value="">— เลือกห้อง —</option>
              {sortedClassrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {gradeLevelName.get(c.grade_level_id) ?? "—"}/{c.name}
                </option>
              ))}
            </Select>
          </Field>

          {!classroomId && (
            <p className="py-6 text-center text-sm text-muted-foreground">เลือกห้องเพื่อดูรายวิชา</p>
          )}
          {classroomId && availableSubjects.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีรายวิชาให้มอบหมาย</p>
          )}
          {classroomId && availableSubjects.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border text-xs">
              {availableSubjects.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => selectSubject(s.id, s.hours_per_week)}
                    className={cn(
                      "flex w-full flex-col px-3 py-2 text-left transition-colors",
                      subjectId === s.id ? "bg-foreground/10" : "hover:bg-muted",
                    )}
                  >
                    <span className="font-medium">{s.code}</span>
                    <span className="text-[10px] text-muted-foreground">{s.name_th}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}
