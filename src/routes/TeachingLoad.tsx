import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useAuth } from "@/auth/AuthProvider";
import {
  BookIcon,
  CalendarIcon,
  Plus,
  Search,
  Users,
  X,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Spinner,
} from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useLearningAreas, useSubjects } from "@/hooks/useCurriculum";
import {
  useCurriculumSubjectsAtGrade,
  useGradeLevels,
} from "@/hooks/useCurriculumStructure";
import {
  useDepartments,
  useProfiles,
  type ProfileRow,
} from "@/hooks/useProfiles";
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

const AREA_TONES = [
  "bg-accent/10 text-accent",
  "bg-success/15 text-success",
  "bg-purple-500/10 text-purple-500",
  "bg-warning/15 text-warning",
  "bg-pink-500/10 text-pink-500",
];

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
    return (
      <Card className="text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงเมนูนี้
      </Card>
    );
  }

  return (
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <BookIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl font-semibold">ภาระงานสอน</h2>
          <p className="text-xs text-muted-foreground">
            จัดการภาระงานสอนของครู แสดงรายวิชาที่รับผิดชอบและจำนวนคาบตามภาคเรียน
          </p>
        </div>

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

        {splitsByTerm ? (
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
                {TERM_LABEL[t]}/{academicYear}
              </button>
            ))}
          </div>
        ) : (
          departmentId && (
            <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              ปีการศึกษา {academicYear}
            </span>
          )
        )}
      </div>

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="เลือกแผนก"
            description="เลือกแผนกเพื่อดูภาระงานสอน"
            icon={Users}
          />
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

function loadStatus(
  total: number,
  min: number | null,
  max: number | null,
): "low" | "high" | "ok" {
  if (min !== null && total < min) return "low";
  if (max !== null && total > max) return "high";
  return "ok";
}

type TeacherSortKey = "name" | "code" | "load";

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
  const { data: teachers = [] } = useProfiles({
    search: "",
    departmentId,
    role: "teacher",
    active: "true",
  });
  const { data: assignments = [], isLoading } =
    useDepartmentTeachingAssignments(departmentId, academicYear, term);
  const del = useDeleteTeachingAssignment();
  const { data: learningAreas = [] } = useLearningAreas();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<TeacherSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const totalByTeacher = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of assignments)
      totals.set(
        a.teacher_id,
        (totals.get(a.teacher_id) ?? 0) + a.periods_per_week,
      );
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
          cmp = (a.teacher_code ?? "").localeCompare(
            b.teacher_code ?? "",
            "th",
            { numeric: true },
          );
          break;
        case "load":
          cmp =
            (totalByTeacher.get(a.id) ?? 0) - (totalByTeacher.get(b.id) ?? 0);
          break;
      }
      return cmp * dir;
    });
    return list;
  }, [teachers, sortKey, sortDir, totalByTeacher]);

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: allSubjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  // ระดับชั้น → ห้อง → รหัสวิชา
  const rows = useMemo(() => {
    const classroomById = new Map(classrooms.map((c) => [c.id, c]));
    const gradeOrder = new Map(gradeLevels.map((g) => [g.id, g.sort_order]));
    const code = new Map(allSubjects.map((x) => [x.id, x.code]));
    const key = (a: TeachingAssignment) => {
      const c = classroomById.get(a.classroom_id);
      return [
        gradeOrder.get(c?.grade_level_id ?? "") ?? 0,
        c?.name ?? "",
        code.get(a.subject_id) ?? "",
      ] as const;
    };
    return assignments
      .filter((a) => a.teacher_id === selectedTeacherId)
      .sort((x, y) => {
        const [gx, cx, sx] = key(x);
        const [gy, cy, sy] = key(y);
        return (
          gx - gy ||
          cx.localeCompare(cy, "th", { numeric: true }) ||
          sx.localeCompare(sy, "th", { numeric: true })
        );
      });
  }, [assignments, selectedTeacherId, classrooms, gradeLevels, allSubjects]);
  const areaName = (t: ProfileRow) =>
    learningAreas.find((l) => l.id === t.learning_area_id)?.name ?? "—";

  const subjectCountByTeacher = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assignments)
      counts.set(a.teacher_id, (counts.get(a.teacher_id) ?? 0) + 1);
    return counts;
  }, [assignments]);

  const q = search.trim().toLowerCase();
  const visibleTeachers = q
    ? sortedTeachers.filter((t) =>
        `${profileFullName(t)} ${t.teacher_code ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : sortedTeachers;

  const totalPeriods = rows.reduce((sum, a) => sum + a.periods_per_week, 0);
  const classroomCount = new Set(rows.map((a) => a.classroom_id)).size;
  const loadState = loadStatus(totalPeriods, minPeriods, maxPeriods);

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-stretch">
      <div className="table-panel">
        <div className="shrink-0 space-y-3 border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="ค้นหาชื่อครู..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="ค้นหาครู"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>ครูทั้งหมด {teachers.length} คน</span>
            <Select
              className="w-auto min-w-[8.5rem]"
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => {
                const [k, d] = e.target.value.split(":");
                setSortKey(k as TeacherSortKey);
                setSortDir(d as "asc" | "desc");
              }}
              aria-label="เรียงลำดับ"
            >
              <option value="name:asc">เรียงตาม ชื่อ A-Z</option>
              <option value="name:desc">เรียงตาม ชื่อ Z-A</option>
              <option value="code:asc">เรียงตาม รหัส</option>
              <option value="load:desc">ภาระงานมาก-น้อย</option>
              <option value="load:asc">ภาระงานน้อย-มาก</option>
            </Select>
          </div>
        </div>

        <ul className="table-panel-scroll space-y-1 p-2">
          {visibleTeachers.map((t) => {
            const active = selectedTeacherId === t.id;
            const status = loadStatus(
              totalByTeacher.get(t.id) ?? 0,
              minPeriods,
              maxPeriods,
            );
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelectTeacher(t.id)}
                  aria-current={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border-l-4 px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-accent bg-accent/10"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <Avatar
                    name={profileFullName(t)}
                    src={avatarUrl(t)}
                    className="h-10 w-10"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {profileFullName(t)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {areaName(t)}
                    </span>
                  </span>
                  <span
                    title={`${totalByTeacher.get(t.id) ?? 0} คาบ/สัปดาห์`}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs",
                      active
                        ? "bg-accent/15 font-medium text-accent"
                        : status === "ok"
                          ? "bg-muted text-muted-foreground"
                          : "bg-warning/15 text-warning",
                    )}
                  >
                    {subjectCountByTeacher.get(t.id) ?? 0} รายวิชา
                  </span>
                </button>
              </li>
            );
          })}
          {isLoading && (
            <li
              role="status"
              aria-label="กำลังโหลด"
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </li>
          )}
          {!isLoading && visibleTeachers.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              {teachers.length === 0
                ? "ยังไม่มีครูในแผนกนี้"
                : "ไม่พบครูที่ค้นหา"}
            </li>
          )}
        </ul>

        <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          แสดง {visibleTeachers.length} จาก {teachers.length} คน
        </div>
      </div>

      {selectedTeacher ? (
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          <Card className="shrink-0 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar
                name={profileFullName(selectedTeacher)}
                src={avatarUrl(selectedTeacher)}
                className="h-16 w-16 text-lg"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-heading truncate text-lg font-semibold">
                  {profileFullName(selectedTeacher)}
                </h3>
                <p className="truncate text-sm text-muted-foreground">
                  {areaName(selectedTeacher)}
                </p>
              </div>
              {mayEdit && (
                <NewAssignmentForm
                  departmentId={departmentId}
                  teacherId={selectedTeacher.id}
                  academicYear={academicYear}
                  term={term}
                  existingAssignments={rows}
                />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                icon={BookIcon}
                tone="bg-accent/10 text-accent"
                label="รายวิชาที่รับผิดชอบ"
                value={rows.length}
                unit="รายวิชา"
              />
              <StatTile
                icon={Users}
                tone="bg-success/15 text-success"
                label="รวมคาบสอน"
                value={totalPeriods}
                unit="คาบ/สัปดาห์"
                warn={
                  loadState !== "ok"
                    ? loadState === "low"
                      ? `ต่ำกว่า ${minPeriods}`
                      : `เกิน ${maxPeriods}`
                    : undefined
                }
              />
              <StatTile
                icon={CalendarIcon}
                tone="bg-purple-500/10 text-purple-500"
                label="ห้องเรียนที่สอน"
                value={classroomCount}
                unit="ห้องเรียน"
              />
            </div>
          </Card>

          <div className="table-panel min-h-[12rem] shrink-0 lg:flex-1">
            <div className="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold">
              รายวิชาที่รับผิดชอบ ({rows.length} รายวิชา)
            </div>
            {rows.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  title="ยังไม่มีวิชาที่มอบหมาย"
                  description="กดเพิ่มรายวิชาเพื่อมอบหมายภาระงานสอน"
                />
              </div>
            ) : (
              <div className="table-panel-scroll">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">รายวิชา</th>
                      <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                      <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                      <th className="px-3 py-2 font-medium">ห้องเรียน</th>
                      <th className="px-3 py-2 text-center font-medium">
                        คาบ/สัปดาห์
                      </th>
                      {mayEdit && (
                        <th className="w-px px-3 py-2 font-medium">จัดการ</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a, i) => (
                      <AssignmentRow
                        key={a.id}
                        index={i + 1}
                        assignment={a}
                        allAssignments={assignments}
                        teachers={teachers}
                        departmentId={departmentId}
                        mayEdit={mayEdit}
                        onDelete={() => del.mutate(a.id)}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted font-semibold">
                      <td className="px-3 py-2.5" colSpan={5}>
                        รวม
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {totalPeriods}
                      </td>
                      {mayEdit && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
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

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  warn,
}: {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  value: number;
  unit: string;
  warn?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          tone,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        <p
          className={cn(
            "truncate text-xs",
            warn ? "text-warning" : "text-muted-foreground",
          )}
        >
          {warn ? `${unit} · ${warn}` : unit}
        </p>
      </div>
    </div>
  );
}

function AssignmentRow({
  index,
  assignment,
  allAssignments,
  teachers,
  departmentId,
  mayEdit,
  onDelete,
}: {
  index: number;
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
  const gradeLevel = gradeLevels.find(
    (g) => g.id === classroom?.grade_level_id,
  );
  const gradeLabel = gradeLevel ? gradeShortLabel(gradeLevel.code) : null;

  const groupMates = assignment.group_id
    ? allAssignments.filter(
        (a) => a.id !== assignment.id && a.group_id === assignment.group_id,
      )
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
      <td className="px-3 py-2.5 text-muted-foreground">{index}</td>
      <td className="px-3 py-2.5">
        <span className="block font-medium">{subject?.name_th ?? "—"}</span>
        {groupMates.length > 0 && (
          <span className="mt-0.5 block text-[10px] text-accent">
            เรียนรวม/แบ่งคาบกับ {groupMates.map(label).join(", ")}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {subject?.code ?? "—"}
      </td>
      <td className="px-3 py-2.5">{gradeLabel ?? "—"}</td>
      <td className="px-3 py-2.5">
        {classroom ? `${gradeLabel ?? "—"}/${classroom.name}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-center">{assignment.periods_per_week}</td>
      {mayEdit && (
        <td className="px-3 py-2.5">
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {assignment.group_id ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => unlink.mutate(assignment.id)}
              >
                ยกเลิกผูก
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="ผูกกลุ่ม"
                onClick={() => setLinking(true)}
              >
                <Users className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="ลบ"
              onClick={onDelete}
            >
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
              onClick={() =>
                link.mutate(
                  { assignmentId: assignment.id, targetId: c.id },
                  { onSuccess: onClose },
                )
              }
              className="w-full py-2 text-left hover:text-accent"
            >
              {label(c)}
              {c.group_id && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (อยู่ในกลุ่มแล้ว)
                </span>
              )}
            </button>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">
            ไม่มีภาระงานสอนอื่นให้ผูก
          </li>
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
  // subject id -> periods/week (string, editable); presence = selected
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [areaId, setAreaId] = useState("");
  const { data: learningAreas = [] } = useLearningAreas();

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
  const { data: curriculumRows = [] } =
    useCurriculumSubjectsAtGrade(gradeLevelId);

  const termRows = useMemo(
    () =>
      curriculumRows.filter((r) =>
        term === null ? r.term === null : r.term === term,
      ),
    [curriculumRows, term],
  );

  const subjectById = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );

  const assignedSubjectIds = useMemo(() => {
    if (!classroomId) return new Set<string>();
    return new Set(
      existingAssignments
        .filter((a) => a.classroom_id === classroomId)
        .map((a) => a.subject_id),
    );
  }, [existingAssignments, classroomId]);

  const availableSubjects = useMemo(() => {
    if (!classroomId) return [];
    const seen = new Set<string>();
    const out: {
      id: string;
      code: string;
      name_th: string;
      hours_per_week: number;
      learning_area_id: string;
    }[] = [];
    for (const r of termRows) {
      if (assignedSubjectIds.has(r.subject_id) || seen.has(r.subject_id))
        continue;
      seen.add(r.subject_id);
      const s = subjectById.get(r.subject_id);
      if (!s) continue;
      out.push({
        id: s.id,
        code: s.code,
        name_th: s.name_th,
        hours_per_week: s.hours_per_week,
        learning_area_id: s.learning_area_id,
      });
    }
    out.sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
    return out;
  }, [classroomId, termRows, assignedSubjectIds, subjectById]);

  useEffect(() => {
    setClassroomId("");
    setPicked({});
  }, [teacherId]);

  useEffect(() => {
    setPicked({});
    setQuery("");
    setAreaId("");
  }, [classroomId]);

  function toggleSubject(id: string, hours: number) {
    setPicked((p) => {
      const { [id]: was, ...rest } = p;
      return was === undefined ? { ...p, [id]: String(hours) } : rest;
    });
  }

  const chosen = availableSubjects.filter((s) => picked[s.id] !== undefined);

  async function submit() {
    if (!classroomId || chosen.length === 0) return;
    try {
      for (const s of chosen) {
        await create.mutateAsync({
          teacher_id: teacherId,
          subject_id: s.id,
          classroom_id: classroomId,
          academic_year: academicYear,
          term,
          periods_per_week: Number(picked[s.id]),
        });
      }
      setPicked({});
      setOpen(false);
    } catch {
      // already-saved subjects drop out of the list on refetch; the rest stay selected
    }
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

  const areaName = new Map(learningAreas.map((l) => [l.id, l.name]));
  const areaIds = [
    ...new Set(availableSubjects.map((s) => s.learning_area_id)),
  ];
  const q = query.trim().toLowerCase();
  const shownSubjects = availableSubjects.filter(
    (s) =>
      (!areaId || s.learning_area_id === areaId) &&
      (!q || `${s.code} ${s.name_th}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <Button className="shrink-0" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        เพิ่มรายวิชา
      </Button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPicked({});
        }}
        side="left"
        title="เพิ่มรายวิชา"
        description="เลือกรายวิชา และห้องเรียนเพื่อเพิ่มในภาระงานสอน"
        footer={
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              เลือกแล้ว {chosen.length} รายวิชา
            </span>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={submit}
              disabled={
                chosen.length === 0 ||
                chosen.some((s) => !Number(picked[s.id])) ||
                create.isPending
              }
            >
              {create.isPending ? (
                <Spinner className="h-3 w-3" />
              ) : (
                "เพิ่มรายวิชา"
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="ห้องเรียน" required>
            <Select
              value={classroomId}
              onChange={(e) => setClassroomId(e.target.value)}
            >
              <option value="">— เลือกห้อง —</option>
              {sortedClassrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {gradeLevelName.get(c.grade_level_id) ?? "—"}/{c.name}
                </option>
              ))}
            </Select>
          </Field>

          {!classroomId && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              เลือกห้องเพื่อดูรายวิชา
            </p>
          )}
          {classroomId && availableSubjects.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              ไม่มีรายวิชาให้มอบหมาย
            </p>
          )}
          {classroomId && availableSubjects.length > 0 && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="ค้นหารหัสวิชา หรือชื่อรายวิชา..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="ค้นหารายวิชา"
                />
              </div>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {[
                  ["", "ทั้งหมด"],
                  ...areaIds.map((id) => [id, areaName.get(id) ?? "—"]),
                ].map(([id, name]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAreaId(id!)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                      areaId === id
                        ? "border-accent bg-accent/10 font-medium text-accent"
                        : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <ul className="space-y-2">
                {shownSubjects.map((s) => {
                  const active = picked[s.id] !== undefined;
                  const tone =
                    AREA_TONES[
                      Math.max(areaIds.indexOf(s.learning_area_id), 0) %
                        AREA_TONES.length
                    ];
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "rounded-xl border transition-colors",
                        active
                          ? "border-accent bg-accent/10"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        onClick={() => toggleSubject(s.id, s.hours_per_week)}
                        className="flex w-full items-center gap-3 p-3 text-left"
                      >
                        <span
                          className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                            tone,
                          )}
                        >
                          <BookIcon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="block font-medium">{s.code}</span>
                          <span className="block truncate text-sm font-semibold">
                            {s.name_th}
                          </span>
                          <span className="block truncate text-muted-foreground">
                            {areaName.get(s.learning_area_id) ?? "—"}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] leading-none",
                            active
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border",
                          )}
                        >
                          {active && "✓"}
                        </span>
                      </button>
                      {active && (
                        <label className="flex items-center justify-end gap-2 px-3 pb-3 text-xs text-muted-foreground">
                          คาบ/สัปดาห์
                          <Input
                            type="number"
                            min={1}
                            value={picked[s.id]}
                            onChange={(e) =>
                              setPicked((p) => ({
                                ...p,
                                [s.id]: e.target.value,
                              }))
                            }
                            className="w-20"
                          />
                        </label>
                      )}
                    </li>
                  );
                })}
                {shownSubjects.length === 0 && (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    ไม่พบรายวิชาที่ค้นหา
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
