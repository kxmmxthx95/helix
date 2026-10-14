import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useProfilesByIds } from "@/hooks/usePractice";
import {
  BookIcon,
  CalendarIcon,
  CheckboxIcon,
  ChevronBack,
  ChevronForward,
  CheckmarkCircleIcon,
  GraduationCap,
  InfoIcon,
  PencilIcon,
  Plus,
  RestaurantIcon,
  Search,
  SettingsIcon,
  SquareIcon,
  TimeIcon,
  TimetableIcon,
  TrashIcon,
  Users,
  X,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Field, Input, Select, Skeleton, Spinner, Switch, Avatar } from "@/components/ui";
import { useActiveAcademicYear, useCurrentTerm } from "@/hooks/useAcademicTerms";
import { avatarUrl } from "@/hooks/useAvatar";
import { useMyClassroom } from "@/hooks/useAttendance";
import {
  useDepartmentPeriods,
  useDepartmentScheduledSlots,
  useGeneratePeriods,
  useGradesWithPeriodOverride,
  usePeriodsForGrade,
} from "@/hooks/usePeriodDefinitions";
import { useLearningAreas, useSubjects } from "@/hooks/useCurriculum";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useProfiles, type ProfileRow } from "@/hooks/useProfiles";
import { useClassroomsByDepartment, useCurrentClassroomEnrollmentsByDepartment } from "@/hooks/useStatusManagement";
import { useDepartmentTeachingAssignments } from "@/hooks/useTeachingLoad";
import {
  useClassroomSchedule,
  useCreateScheduleEntry,
  useDeleteScheduleEntry,
  fetchDepartmentSchedule,
  useDepartmentSchedule,
  useMoveScheduleEntry,
  useTeacherSchedule,
  type ScheduleEntryRow,
} from "@/hooks/useSchedule";
import { generatePeriods } from "@/lib/periodGenerator";
import {
  profileFullName,
  type Classroom,
  type GradeLevel,
  type PeriodDefinition,
  type PeriodType,
  type TeachingAssignment,
} from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { SUBJECT_TYPE_BADGE, SUBJECT_TYPE_LABEL } from "@/lib/subjectColor";
import { canManage, isOrgWide, isSelfScoped } from "@/lib/roles";
import { cn } from "@/lib/utils";

const DAY_LABEL: Record<number, string> = {
  1: "จันทร์",
  2: "อังคาร",
  3: "พุธ",
  4: "พฤหัสบดี",
  5: "ศุกร์",
  6: "เสาร์",
};
const TERM_LABEL: Record<number, string> = { 1: "ภาคเรียน 1", 2: "ภาคเรียน 2" };

type View = "classroom" | "teacher";

export function Timetable() {
  const { profile: me, myStudent } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;
  const isStudent = me ? isSelfScoped(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [view, setView] = useState<View | "">("");
  const [periodSettingsOpen, setPeriodSettingsOpen] = useState(false);

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const { data: currentTerm } = useCurrentTerm(departmentId || null);
  const [pickedTerm, setTerm] = useState<1 | 2 | null>(null);
  const term = pickedTerm ?? currentTerm?.term ?? 1;
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";

  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? new Date().getFullYear() + 543;
  const scheduleTerm = splitsByTerm ? term : null;

  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId || null);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const { data: teachers = [] } = useProfiles({ search: "", departmentId, role: "teacher", active: "true" });

  // student path: locked to their own classroom, no picker (mirrors Attendance.tsx).
  const { data: myClassroom } = useMyClassroom(isStudent ? (myStudent?.id ?? null) : null, academicYear);

  useEffect(() => {
    if (isStudent) return;
  }, [departmentId, isStudent]);

  if (!me) return null;

  if (isStudent) {
    return myClassroom ? (
      <div className="space-y-4 pb-8">
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
        <ClassroomTimetable
          departmentId={departmentId}
          classroomId={myClassroom.id}
          academicYear={academicYear}
          term={scheduleTerm}
          mayEdit={false}
          classrooms={classrooms}
          gradeLevels={gradeLevels}
          teachers={teachers}
        />
      </div>
    ) : (
      <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีห้องเรียนในปีการศึกษานี้" />
    );
  }

  return (
    <div className="page-fill shrink-0 pb-8">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select
          className="h-8 w-auto min-w-[10rem] shrink-0"
          value={view}
          onChange={(e) => {
            setView(e.target.value as View);
          }}
          aria-label="เลือกตาราง"
          placeholder="เลือกตาราง"
        >
          <option value="classroom">ตารางเรียน</option>
          <option value="teacher">ตารางสอน</option>
        </Select>

        {orgWide && departments.length > 0 && (
          <Select
            className="h-8 w-auto min-w-[10rem]"
            value={pickedDept}
            onChange={(e) => setPickedDept(e.target.value)}
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

        {departmentId && splitsByTerm && (
          <Select
            className="ml-auto h-8 w-auto min-w-[10rem] shrink-0"
            value={String(term)}
            onChange={(e) => setTerm(Number(e.target.value) as 1 | 2)}
            aria-label="ภาคเรียน"
          >
            {([1, 2] as const).map((t) => (
              <option key={t} value={t}>
                {TERM_LABEL[t]}
              </option>
            ))}
          </Select>
        )}

        {departmentId && mayEdit && (
          <Button
            size="sm"
            variant="outline"
            className={cn("h-8 shrink-0", !splitsByTerm && "ml-auto")}
            onClick={() => setPeriodSettingsOpen(true)}
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            ตั้งค่าคาบเวลา
          </Button>
        )}
      </div>

      {departmentId && (
        <PeriodSettingsSheet
          open={periodSettingsOpen}
          onOpenChange={setPeriodSettingsOpen}
          departmentId={departmentId}
          academicYear={academicYear}
        />
      )}

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูตารางเรียน" icon={TimetableIcon} />
        </div>
      ) : !view ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกตาราง" description="เลือกตารางเรียนหรือตารางสอน" icon={TimetableIcon} />
        </div>
      ) : (
        <>
          {view === "classroom" && (
            <ClassroomWorkspace
              departmentId={departmentId}
              academicYear={academicYear}
              term={scheduleTerm}
              mayEdit={mayEdit}
              classrooms={classrooms}
              gradeLevels={gradeLevels}
              teachers={teachers}
            />
          )}

          {view === "teacher" && (
            <TeacherWorkspace
              departmentId={departmentId}
              academicYear={academicYear}
              term={scheduleTerm}
              mayEdit={mayEdit}
              classrooms={classrooms}
              gradeLevels={gradeLevels}
              teachers={teachers}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Master-detail: classroom list on the left, the picked room's schedule on the right. */
function ClassroomWorkspace({
  departmentId,
  academicYear,
  term,
  mayEdit,
  classrooms,
  gradeLevels,
  teachers,
}: {
  departmentId: string;
  academicYear: number;
  term: number | null;
  mayEdit: boolean;
  classrooms: Classroom[];
  gradeLevels: GradeLevel[];
  teachers: ProfileRow[];
}) {
  const [pickedId, setPickedId] = useState("");
  const [showOthers, setShowOthers] = useShowOthers();
  const { data: deptEntries = [] } = useDepartmentSchedule(departmentId, academicYear, term, showOthers);
  const { data: assignments = [] } = useDepartmentTeachingAssignments(departmentId, academicYear, term);
  const { data: enrollments = [] } = useCurrentClassroomEnrollmentsByDepartment(departmentId);

  const label = (c: Classroom) => classroomLabelOf(c, gradeLevels);
  const sorted = useMemo(
    () =>
      [...classrooms].sort((a, b) => {
        const byGrade =
          gradeLevels.findIndex((g) => g.id === a.grade_level_id) -
          gradeLevels.findIndex((g) => g.id === b.grade_level_id);
        return byGrade !== 0 ? byGrade : a.name.localeCompare(b.name, undefined, { numeric: true });
      }),
    [classrooms, gradeLevels],
  );
  const studentCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of enrollments) map.set(e.classroom_id, (map.get(e.classroom_id) ?? 0) + 1);
    return map;
  }, [enrollments]);

  const room = sorted.find((c) => c.id === pickedId) ?? sorted[0];
  const { data: roomEntries = [] } = useClassroomSchedule(room?.id ?? null, academicYear, term);
  const { data: defaultPeriods = [] } = useDepartmentPeriods(departmentId);
  const { data: gradePeriods = [] } = usePeriodsForGrade(departmentId, room?.grade_level_id ?? null);
  if (!room) return <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีห้องเรียนในแผนกนี้" />;

  const mine = assignments.filter((a) => a.classroom_id === room.id);
  const students = studentCount.get(room.id) ?? 0;
  const roomTeachers = new Set(mine.map((a) => a.teacher_id));
  // Teachers of this room who are busy teaching another room at the same time.
  const ghostEntries = showOthers
    ? deptEntries.filter(
        (e) => e.teaching_assignment.classroom_id !== room.id && roomTeachers.has(e.teaching_assignment.teacher_id),
      )
    : [];

  return (
    <div className="grid flex-1 items-start gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <PickerList
        title="ห้องเรียน"
        unit="ห้อง"
        searchPlaceholder="ค้นหาห้องเรียน..."
        selectedId={room.id}
        onSelect={setPickedId}
        items={sorted.map((c) => ({
          id: c.id,
          name: label(c),
          subtitle: `นักเรียน ${studentCount.get(c.id) ?? 0} คน`,
          subjects: new Set(assignments.filter((a) => a.classroom_id === c.id).map((a) => a.subject_id)).size,
          search: label(c),
        }))}
      />

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Users className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1 font-sarabun">
            <p className="truncate text-base font-semibold text-foreground">{label(room)}</p>
            <p className="truncate text-xs text-muted-foreground">
              นักเรียน {students} คน{term ? ` | ภาคเรียนที่ ${term}` : ""} | ปีการศึกษา {academicYear}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatChip
              icon={BookIcon}
              tint="bg-sky-100 text-sky-600 dark:bg-sky-500/20"
              value={new Set(mine.map((a) => a.subject_id)).size}
              label="รายวิชา"
            />
            <StatChip
              icon={TimeIcon}
              tint="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20"
              value={`${roomEntries.length}/${countTeachingSlots(mergePeriods(defaultPeriods, gradePeriods))}`}
              label="คาบที่จัดแล้ว"
            />
            <StatChip
              icon={Users}
              tint="bg-violet-100 text-violet-600 dark:bg-violet-500/20"
              value={students}
              label="นักเรียน"
            />
          </div>
          <label className="flex w-full cursor-pointer items-center justify-end gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <Switch checked={showOthers} onChange={setShowOthers} size="sm" />
            แสดงคาบครูคนอื่น (ครูของห้องนี้ที่ติดสอนห้องอื่น)
          </label>
        </div>

        <ClassroomTimetable
          key={room.id}
          departmentId={departmentId}
          classroomId={room.id}
          academicYear={academicYear}
          term={term}
          mayEdit={mayEdit}
          classrooms={classrooms}
          gradeLevels={gradeLevels}
          teachers={teachers}
          ghostEntries={ghostEntries}
        />
      </section>
    </div>
  );
}

function ClassroomTimetable({
  departmentId,
  classroomId,
  academicYear,
  term,
  mayEdit,
  classrooms,
  gradeLevels,
  teachers,
  onBack,
  ghostEntries,
}: {
  departmentId: string;
  classroomId: string;
  ghostEntries?: ScheduleEntryRow[];
  academicYear: number;
  term: number | null;
  mayEdit: boolean;
  classrooms: Classroom[];
  gradeLevels: GradeLevel[];
  teachers: ProfileRow[];
  onBack?: () => void;
}) {
  const classroomGradeLevelId = classrooms.find((c) => c.id === classroomId)?.grade_level_id ?? null;
  const classroom = classrooms.find((c) => c.id === classroomId);
  const classroomLabel = classroom
    ? classroomLabelOf(classroom, gradeLevels)
    : "—";
  const { data: defaultPeriods = [], isLoading: loadingDefaultPeriods } = useDepartmentPeriods(departmentId);
  const { data: gradePeriods = [], isLoading: loadingGradePeriods } = usePeriodsForGrade(
    departmentId,
    classroomGradeLevelId,
  );
  const periods = useMemo(() => mergePeriods(defaultPeriods, gradePeriods), [defaultPeriods, gradePeriods]);
  const { data: entries = [], isLoading: loadingEntries } = useClassroomSchedule(classroomId, academicYear, term);
  const { data: assignments = [] } = useDepartmentTeachingAssignments(departmentId, academicYear, term);
  // The role-filtered `teachers` list can miss people the viewer can't read roles for; look up the card teachers by id too.
  const teacherIds = useMemo(
    () => [...new Set([...entries, ...(ghostEntries ?? [])].map((e) => e.teaching_assignment.teacher_id))].sort(),
    [entries, ghostEntries],
  );
  const { data: cardTeachers = [] } = useProfilesByIds(teacherIds);
  const findTeacher = (id: string) => teachers.find((x) => x.id === id) ?? cardTeachers.find((x) => x.id === id);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });

  const candidates = useMemo(
    () => assignments.filter((a) => a.classroom_id === classroomId),
    [assignments, classroomId],
  );
  const styling = useTimetableStyling(subjects, classrooms, gradeLevels);

  return (
    <>
      {onBack && <BackHeader label={classroomLabel} onBack={onBack} />}
      <TimetableGrid
        periods={periods}
        entries={entries}
        candidates={candidates}
        styling={styling}
        scope={{ departmentId, academicYear, term }}
        ghostEntries={ghostEntries}
        teacherLines={(id) => {
          const t = findTeacher(id);
          return t ? [`${"prefix" in t ? (t.prefix ?? "") : ""}${t.first_name}`, t.last_name] : ["—", ""];
        }}
        mode="classroom"
        mayEdit={mayEdit}
        isLoading={loadingDefaultPeriods || loadingGradePeriods || loadingEntries}
        subjectLabel={(id) => subjects.find((s) => s.id === id)?.code ?? "—"}
        subjectName={(id) => subjects.find((s) => s.id === id)?.name_th ?? ""}
        teacherLabel={(id) => {
          const t = findTeacher(id);
          return t ? `${t.first_name} ${t.last_name}` : "—";
        }}
        roomLabel={(id) => {
          const c = classrooms.find((x) => x.id === id);
          const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.code;
          return c ? `${g ? gradeShortLabel(g) : "—"}/${c.name}` : "—";
        }}
      />
    </>
  );
}

/** ม.1/1 — short grade code + room name (the full grade name is too long for cards and lists). */
function classroomLabelOf(c: Classroom, gradeLevels: GradeLevel[]) {
  const code = gradeLevels.find((g) => g.id === c.grade_level_id)?.code;
  return `${code ? gradeShortLabel(code) : "—"}/${c.name}`;
}

type TimetableStyling = {
  /** Class string for a subject's card: area hue, grade shade. */
  color: (subjectId: string, classroomId: string) => string;
  /** Same hue and shade as `color`, as a gradient — for the timetable grid cards. */
  gradient: (subjectId: string, classroomId: string) => string;
  typeLabel: (subjectId: string) => string;
  /** Pill classes for the subject-type badge. */
  typeBadge: (subjectId: string) => string;
  /** Shade class of an area's hue at a grade step, for the legend ramp (area id = any area id). */
  step: (areaId: string, step: 0 | 1 | 2) => string;
  /** Areas present among these subjects, for the legend. */
  legend: (subjectIds: string[]) => { id: string; name: string; dot: string }[];
};

function useTimetableStyling(
  subjects: { id: string; learning_area_id: string; subject_type: keyof typeof SUBJECT_TYPE_LABEL }[],
  classrooms: Classroom[],
  gradeLevels: GradeLevel[],
): TimetableStyling {
  const colors = useSubjectColors(gradeLevels);
  return useMemo(() => {
    const byId = new Map(subjects.map((s) => [s.id, s]));
    return {
      color: (subjectId, classroomId) =>
        colors.shade(byId.get(subjectId)?.learning_area_id, classrooms.find((c) => c.id === classroomId)?.grade_level_id),
      gradient: (subjectId, classroomId) =>
        colors.gradient(byId.get(subjectId)?.learning_area_id, classrooms.find((c) => c.id === classroomId)?.grade_level_id),
      typeLabel: (subjectId) => {
        const t = byId.get(subjectId)?.subject_type;
        return t ? SUBJECT_TYPE_LABEL[t] : "";
      },
      typeBadge: (subjectId) => {
        const t = byId.get(subjectId)?.subject_type;
        return t ? SUBJECT_TYPE_BADGE[t] : "";
      },
      step: (areaId, step) => colors.shadeAt(areaId, step),
      legend: (ids) => colors.legend(ids.map((id) => byId.get(id)?.learning_area_id)),
    };
  }, [colors, subjects, classrooms]);
}

type PickerItem = {
  id: string;
  name: string;
  /** Shown instead of `name` as two lines (e.g. first name / last name); `name` still drives search and sort. */
  nameLines?: [string, string];
  subtitle: string;
  /** Subjects taught / scheduled — shown as the pill and used for the second sort. */
  subjects: number;
  search: string;
  avatar?: React.ReactNode;
};

/** Search + sort + count list shared by the teacher and classroom pickers. */
function PickerList({
  items,
  selectedId,
  onSelect,
  searchPlaceholder,
  title,
  unit,
}: {
  items: PickerItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchPlaceholder: string;
  title: string;
  unit: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "subjects">("name");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? items.filter((i) => i.search.toLowerCase().includes(q)) : items;
    return sort === "subjects"
      ? [...list].sort((a, b) => b.subjects - a.subjects || a.name.localeCompare(b.name, "th", { numeric: true }))
      : [...list].sort((a, b) => a.name.localeCompare(b.name, "th", { numeric: true }));
  }, [items, search, sort]);

  return (
    <aside className="flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:sticky lg:top-0 lg:max-h-[calc(100dvh-10rem)]">
      <div className="shrink-0 space-y-3 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {title}ทั้งหมด {items.length} {unit}
          </p>
          <Select
            className="h-8 w-auto min-w-[8.5rem] text-xs"
            value={sort}
            onChange={(e) => setSort(e.target.value as "name" | "subjects")}
            aria-label="เรียงลำดับ"
          >
            <option value="name">เรียงตาม ชื่อ A-Z</option>
            <option value="subjects">เรียงตาม รายวิชา</option>
          </Select>
        </div>
      </div>
      <ul className="scrollbar-hidden min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
        {shown.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onSelect(i.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                i.id === selectedId ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              {i.avatar}
              <div className="min-w-0 flex-1 font-sarabun leading-tight">
                {i.nameLines ? (
                  i.nameLines.map((line, k) => (
                    <p key={k} className="truncate text-sm font-medium text-foreground">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
                )}
                <p className="truncate text-xs text-muted-foreground">{i.subtitle}</p>
              </div>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">ไม่พบรายการที่ค้นหา</li>}
      </ul>
      <p className="shrink-0 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        แสดง {shown.length} จาก {items.length} {unit}
      </p>
    </aside>
  );
}

function StatChip({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: (props: { className?: string }) => React.JSX.Element;
  tint: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", tint)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-base font-semibold text-foreground">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

const SHOW_OTHERS_KEY = "timetable.showOtherTeachers";

/** Per-viewer "show other teachers' periods" switch; storage can be blocked, so every access is guarded. */
function useShowOthers() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SHOW_OTHERS_KEY) !== "0";
    } catch {
      return true;
    }
  });
  function set(next: boolean) {
    setOn(next);
    try {
      localStorage.setItem(SHOW_OTHERS_KEY, next ? "1" : "0");
    } catch {
      /* preference just won't persist */
    }
  }
  return [on, set] as const;
}

type TeacherTab = "week" | "subjects" | "hours";
const TEACHER_TABS: [TeacherTab, string][] = [
  ["week", "ตารางสอนรายสัปดาห์"],
  ["subjects", "รายวิชาที่สอน"],
  ["hours", "สรุปชั่วโมง"],
];

/** Master-detail: teacher list on the left, the picked teacher's schedule on the right. */
function TeacherWorkspace({
  departmentId,
  academicYear,
  term,
  mayEdit,
  classrooms,
  gradeLevels,
  teachers,
}: {
  departmentId: string;
  academicYear: number;
  term: number | null;
  mayEdit: boolean;
  classrooms: Classroom[];
  gradeLevels: GradeLevel[];
  teachers: ProfileRow[];
}) {
  const [pickedId, setPickedId] = useState("");
  const [tab, setTab] = useState<TeacherTab>("week");

  const { data: assignments = [] } = useDepartmentTeachingAssignments(departmentId, academicYear, term);
  const { data: learningAreas = [] } = useLearningAreas();
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });

  const styling = useTimetableStyling(subjects, classrooms, gradeLevels);
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const areaById = useMemo(() => new Map(learningAreas.map((a) => [a.id, a])), [learningAreas]);
  const classroomLabel = (id: string) => {
    const c = classrooms.find((x) => x.id === id);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.code;
    return c ? `${g ? gradeShortLabel(g) : "—"}/${c.name}` : "—";
  };

  const summary = useMemo(() => {
    const map = new Map<string, { subjects: Set<string>; periods: number; assignments: TeachingAssignment[] }>();
    for (const a of assignments) {
      const cur = map.get(a.teacher_id) ?? { subjects: new Set<string>(), periods: 0, assignments: [] };
      cur.subjects.add(a.subject_id);
      cur.periods += a.periods_per_week;
      cur.assignments.push(a);
      map.set(a.teacher_id, cur);
    }
    return map;
  }, [assignments]);

  const teacher = teachers.find((t) => t.id === pickedId) ?? teachers[0];
  const teacherId = teacher?.id ?? "";
  const mine = summary.get(teacherId);
  const { data: entries = [] } = useTeacherSchedule(teacherId, academicYear, term);
  const { data: deptPeriods = [] } = useDepartmentPeriods(departmentId);

  const teacherArea = areaById.get(teacher?.learning_area_id ?? "");
  const areaText = (teacherArea?.parent_id ? areaById.get(teacherArea.parent_id) : teacherArea)?.name ?? "";

  const gradeRange = (() => {
    const idx = [...new Set((mine?.assignments ?? []).map((a) => classrooms.find((c) => c.id === a.classroom_id)?.grade_level_id))]
      .map((id) => gradeLevels.findIndex((g) => g.id === id))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    if (idx.length === 0) return "—";
    const lo = gradeShortLabel(gradeLevels[idx[0]!]!.code);
    const hi = gradeShortLabel(gradeLevels[idx[idx.length - 1]!]!.code);
    if (lo === hi) return lo;
    const prefix = lo.replace(/\d+$/, "");
    return hi.startsWith(prefix) ? `${lo}-${hi.slice(prefix.length)}` : `${lo}-${hi}`;
  })();

  if (teachers.length === 0) {
    return <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีครูในแผนกนี้" />;
  }

  const stats = [
    { icon: CalendarIcon, tint: "bg-sky-100 text-sky-600 dark:bg-sky-500/20", value: mine?.subjects.size ?? 0, label: "รายวิชา" },
    {
      icon: TimeIcon,
      tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20",
      value: `${entries.length}/${countTeachingSlots(deptPeriods)}`,
      label: "คาบที่จัดแล้ว",
    },
    { icon: GraduationCap, tint: "bg-violet-100 text-violet-600 dark:bg-violet-500/20", value: gradeRange, label: "ระดับที่สอน" },
  ];

  const perDay = [1, 2, 3, 4, 5, 6].map((d) => ({ day: d, count: entries.filter((e) => e.day_of_week === d).length }));
  const shownDays = perDay.filter((x) => x.day <= 5 || x.count > 0);
  const maxDay = Math.max(1, ...shownDays.map((x) => x.count));

  return (
    <div className="grid flex-1 items-start gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <PickerList
        title="ครู"
        unit="คน"
        searchPlaceholder="ค้นหาชื่อครู..."
        selectedId={teacherId}
        onSelect={setPickedId}
        items={teachers.map((t) => {
          const area = areaById.get(t.learning_area_id ?? "");
          return {
            id: t.id,
            name: profileFullName(t),
            nameLines: [`${t.prefix ?? ""}${t.first_name}`, t.last_name],
            subtitle: (area?.parent_id ? areaById.get(area.parent_id) : area)?.name ?? "—",
            subjects: summary.get(t.id)?.subjects.size ?? 0,
            search: [profileFullName(t), t.teacher_code ?? ""].join(" "),
            avatar: (
              <Avatar
                name={`${t.first_name} ${t.last_name}`}
                src={avatarUrl(t)}
                className="h-11 w-11 text-xs ring-2 ring-sky-200 dark:ring-sky-500/40"
              />
            ),
          };
        })}
      />

      <section className="min-w-0 space-y-3">
        {teacher && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
              <Avatar name={`${teacher.first_name} ${teacher.last_name}`} src={avatarUrl(teacher)} className="h-14 w-14 text-base" />
              <div className="min-w-0 flex-1 font-sarabun">
                <p className="truncate text-base font-semibold text-foreground">{profileFullName(teacher)}</p>
                <p className="truncate text-xs text-muted-foreground">{areaText ? `กลุ่มสาระการเรียนรู้ ${areaText}` : "ยังไม่ระบุกลุ่มสาระ"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.map((st) => (
                  <StatChip key={st.label} {...st} />
                ))}
              </div>
            </div>

            <div className="flex w-full border-b border-border" role="tablist">
              {TEACHER_TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={lineTab(tab === key, true)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "week" && (
              <TeacherTimetable
                departmentId={departmentId}
                teacherId={teacherId}
                academicYear={academicYear}
                term={term}
                mayEdit={mayEdit}
                classrooms={classrooms}
                gradeLevels={gradeLevels}
                teachers={teachers}
              />
            )}

            {tab === "subjects" && (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[32rem] text-xs">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">รหัส</th>
                      <th className="px-3 py-2 font-medium">วิชา</th>
                      <th className="px-3 py-2 font-medium">ห้อง</th>
                      <th className="px-3 py-2 text-right font-medium">คาบ/สัปดาห์</th>
                      <th className="px-3 py-2 text-right font-medium">จัดในตารางแล้ว</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mine?.assignments ?? []).map((a) => {
                      const placed = entries.filter((e) => e.teaching_assignment_id === a.id).length;
                      return (
                        <tr key={a.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", styling.color(a.subject_id, a.classroom_id))}>
                              {subjectById.get(a.subject_id)?.code ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2">{subjectById.get(a.subject_id)?.name_th ?? "—"}</td>
                          <td className="px-3 py-2">{classroomLabel(a.classroom_id)}</td>
                          <td className="px-3 py-2 text-right">{a.periods_per_week}</td>
                          <td className={cn("px-3 py-2 text-right", placed < a.periods_per_week && "text-warning")}>
                            {placed}/{a.periods_per_week}
                          </td>
                        </tr>
                      );
                    })}
                    {(mine?.assignments.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          ยังไม่มีภาระงานสอน
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "hours" && (
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  จัดลงตารางแล้ว <span className="font-semibold text-foreground">{entries.length}</span> จาก{" "}
                  <span className="font-semibold text-foreground">{mine?.periods ?? 0}</span> คาบ/สัปดาห์
                </p>
                <ul className="space-y-2">
                  {shownDays.map(({ day, count }) => (
                    <li key={day} className="flex items-center gap-3 text-xs">
                      <span className="w-16 shrink-0 text-muted-foreground">{DAY_LABEL[day]}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(count / maxDay) * 100}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right">{count} คาบ</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function TeacherTimetable({
  departmentId,
  teacherId,
  academicYear,
  term,
  mayEdit,
  classrooms,
  gradeLevels,
  teachers,
}: {
  departmentId: string;
  teacherId: string;
  academicYear: number;
  term: number | null;
  mayEdit: boolean;
  classrooms: Classroom[];
  gradeLevels: GradeLevel[];
  teachers: ProfileRow[];
}) {
  const { data: periods = [], isLoading: loadingPeriods } = useDepartmentPeriods(departmentId);
  const { data: entries = [], isLoading: loadingEntries } = useTeacherSchedule(teacherId, academicYear, term);
  const { data: assignments = [] } = useDepartmentTeachingAssignments(departmentId, academicYear, term);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });

  const candidates = useMemo(
    () => assignments.filter((a) => a.teacher_id === teacherId),
    [assignments, teacherId],
  );
  const styling = useTimetableStyling(subjects, classrooms, gradeLevels);

  return (
    <>
      <TimetableGrid
        periods={periods}
        entries={entries}
        candidates={candidates}
        styling={styling}
        scope={{ departmentId, academicYear, term }}
        mode="teacher"
        mayEdit={mayEdit}
        isLoading={loadingPeriods || loadingEntries}
        subjectLabel={(id) => subjects.find((s) => s.id === id)?.code ?? "—"}
        subjectName={(id) => subjects.find((s) => s.id === id)?.name_th ?? ""}
        teacherLabel={(id) => {
          const t = teachers.find((x) => x.id === id);
          return t ? profileFullName(t) : "—";
        }}
        roomLabel={(id) => {
          const c = classrooms.find((x) => x.id === id);
          const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.code;
          return c ? `${g ? gradeShortLabel(g) : "—"}/${c.name}` : "—";
        }}
      />
    </>
  );
}

function BackHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="mb-2 flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-foreground hover:bg-muted"
      >
        <ChevronBack className="h-3.5 w-3.5" />
        {label}
      </button>
    </div>
  );
}

const hhmm = (t: string) => t.slice(0, 5);

/** Grade-specific rows (0031) override the department default at the same day+period_no. */
function mergePeriods(defaults: PeriodDefinition[], grade: PeriodDefinition[]) {
  const map = new Map(defaults.map((p) => [`${p.day_of_week}-${p.period_no}`, p]));
  for (const p of grade) map.set(`${p.day_of_week}-${p.period_no}`, p);
  return [...map.values()];
}

const countTeachingSlots = (periods: PeriodDefinition[]) => periods.filter((p) => p.period_type === "teaching").length;

/** Breaks share period_no's sequence in the DB but aren't "คาบ" — this is the number users see (teaching periods only). */
function teachingOrdinal(periods: { day_of_week: number; period_no: number; period_type: PeriodType }[], day: number, periodNo: number) {
  return periods.filter((p) => p.day_of_week === day && p.period_type === "teaching" && p.period_no <= periodNo).length;
}

function TimetableGrid({
  periods,
  entries,
  candidates,
  mode,
  mayEdit,
  isLoading,
  subjectLabel,
  subjectName,
  teacherLabel,
  roomLabel,
  teacherLines,
  styling,
  scope,
  ghostEntries = [],
}: {
  periods: PeriodDefinition[];
  entries: ScheduleEntryRow[];
  candidates: TeachingAssignment[];
  /** Faint, read-only entries of other teachers (same rooms) — context only. */
  ghostEntries?: ScheduleEntryRow[];
  mode: "classroom" | "teacher";
  mayEdit: boolean;
  isLoading: boolean;
  subjectLabel: (id: string) => string;
  subjectName: (id: string) => string;
  teacherLabel: (id: string) => string;
  roomLabel: (id: string) => string;
  /** First name / last name as two lines, for the classroom view where the teacher is the card's last line. */
  teacherLines?: (id: string) => [string, string];
  styling: TimetableStyling;
  /** Where these entries live — used to look up what a rejected placement collided with. */
  scope: { departmentId: string; academicYear: number; term: number | null };
}) {
  const del = useDeleteScheduleEntry();
  const move = useMoveScheduleEntry();
  const toast = useToast();
  const [drag, setDrag] = useState<{ id: string; day: number; periodNo: number } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ day: number; periodNo: number } | null>(null);

  const days = useMemo(() => [...new Set(periods.map((p) => p.day_of_week))].sort((a, b) => a - b), [periods]);
  const maxPeriodNo = periods.reduce((m, p) => Math.max(m, p.period_no), 0);

  const ghostAt = useMemo(() => {
    const map = new Map<string, ScheduleEntryRow[]>();
    for (const e of ghostEntries) {
      const key = `${e.day_of_week}-${e.period_no}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [ghostEntries]);

  const displayNo = (periodNo: number) => {
    let n = 0;
    for (let i = 1; i <= periodNo; i++) {
      if (days.some((d) => periodAt.get(`${d}-${i}`)?.period_type === "teaching")) n++;
    }
    return n;
  };

  /** Thai explanation for a rejected place/move; for a clash, names what already occupies the slot. */
  async function explainFailure(
    err: unknown,
    a: Pick<TeachingAssignment, "teacher_id" | "classroom_id" | "group_id">,
    day: number,
    periodNo: number,
    selfEntryId?: string,
  ): Promise<string> {
    const raw = err instanceof Error ? err.message : "";
    const where = `${DAY_LABEL[day] ?? day} คาบ ${displayNo(periodNo)}`;
    if (/not teaching/.test(raw)) return `${where} เป็นช่วงพัก ไม่ใช่คาบเรียน`;
    if (/locked\/archived/.test(raw)) return "ภาคเรียนนี้ถูกล็อกหรือเก็บถาวรแล้ว แก้ตารางไม่ได้";
    if (/no period_definitions/.test(raw)) return `ยังไม่ได้ตั้งค่าเวลาของ ${where}`;
    if (!/schedule conflict/.test(raw)) return raw || "ไม่สำเร็จ";

    const all = await fetchDepartmentSchedule(scope.departmentId, scope.academicYear, scope.term).catch(() => []);
    const lines = all
      .filter(
        (e) =>
          e.id !== selfEntryId &&
          e.day_of_week === day &&
          e.period_no === periodNo &&
          (e.teaching_assignment.teacher_id === a.teacher_id || e.teaching_assignment.classroom_id === a.classroom_id) &&
          !(a.group_id && e.teaching_assignment.group_id === a.group_id),
      )
      .map((e) => {
        const t = e.teaching_assignment;
        const why = [t.teacher_id === a.teacher_id && "ครูมีคาบนี้แล้ว", t.classroom_id === a.classroom_id && "ห้องมีคาบนี้แล้ว"]
          .filter(Boolean)
          .join(" และ ");
        return `• ${subjectLabel(t.subject_id)} ${subjectName(t.subject_id)} · ${teacherLabel(t.teacher_id)} · ${roomLabel(t.classroom_id)} (${why})`;
      });
    return lines.length
      ? `ชนกับคาบที่จัดไว้แล้ว — ${where}\n${lines.join("\n")}`
      : `${where}: ครูหรือห้องมีคาบนี้แล้ว`;
  }

  const periodAt = useMemo(() => {
    const map = new Map<string, PeriodDefinition>();
    for (const p of periods) map.set(`${p.day_of_week}-${p.period_no}`, p);
    return map;
  }, [periods]);

  const entriesAt = useMemo(() => {
    const map = new Map<string, ScheduleEntryRow[]>();
    for (const e of entries) {
      const key = `${e.day_of_week}-${e.period_no}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [entries]);

  if (isLoading) {
    const skeletonDays = [1, 2, 3, 4, 5];
    return (
      <div
        className="overflow-x-auto rounded-lg border border-border bg-card"
        role="status"
        aria-label="กำลังโหลด"
      >
        <table className="w-full min-w-[40rem] table-fixed text-xs">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-2 py-2 font-medium">คาบ</th>
              {skeletonDays.map((d) => (
                <th key={d} className="px-2 py-2 text-center font-medium">
                  {DAY_LABEL[d] ?? d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((periodNo) => (
              <tr key={periodNo} className="border-t border-border align-top">
                <td className="px-2 py-2 text-center">
                  <Skeleton className="mx-auto h-3 w-4" />
                </td>
                {skeletonDays.map((d) => (
                  <td key={d} className="px-1 py-1">
                    <Skeleton className="h-6 rounded" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <EmptyState
        title="ไม่พบข้อมูล"
        description="ยังไม่ได้ตั้งค่าคาบเวลาของแผนกนี้ — ไปที่ตั้งค่าระบบ"
      />
    );
  }

  return (
    <div className="space-y-2">
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[48rem] table-fixed border-collapse text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="w-28 px-2 py-3 text-center font-medium">คาบ / เวลา</th>
            {days.map((d) => (
              <th key={d} className="border-l border-border px-2 py-3 text-center font-medium">
                {DAY_LABEL[d] ?? d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxPeriodNo }, (_, i) => i + 1).map((periodNo) => {
            const slots = days.map((d) => periodAt.get(`${d}-${periodNo}`));
            const first = slots.find(Boolean);
            const allBreak = slots.every((pd) => !pd || pd.period_type === "break");

            if (first && allBreak) {
              return (
                <tr key={periodNo} className="border-t border-border bg-muted/60">
                  <td colSpan={days.length + 1} className="px-2 py-2 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <RestaurantIcon className="h-3.5 w-3.5" />
                      {first.label} {hhmm(first.start_time)} – {hhmm(first.end_time)}
                    </span>
                  </td>
                </tr>
              );
            }

            return (
              <tr key={periodNo} className="border-t border-border align-top">
                <td className="bg-muted/40 px-2 py-2 text-center">
                  <p className="text-base font-semibold text-foreground">
                    {slots.some((pd) => pd?.period_type === "teaching") ? displayNo(periodNo) : "—"}
                  </p>
                  {first && (
                    <p className="text-[11px] text-muted-foreground">
                      {hhmm(first.start_time)} – {hhmm(first.end_time)}
                    </p>
                  )}
                </td>
                {days.map((day, i) => {
                  const pd = slots[i];
                  const cellEntries = entriesAt.get(`${day}-${periodNo}`) ?? [];

                  if (!pd) return <td key={day} className="border-l border-border p-1" />;

                  if (pd.period_type === "break") {
                    return (
                      <td key={day} className="border-l border-border p-1">
                        <div className="rounded-lg bg-muted px-1.5 py-3 text-center text-muted-foreground">
                          {pd.label}
                        </div>
                      </td>
                    );
                  }

                  const cellKey = `${day}-${periodNo}`;
                  const canDrop = !!drag && (drag.day !== day || drag.periodNo !== periodNo);
                  return (
                    <td
                      key={day}
                      className={cn("border-l border-border p-1 transition-colors", canDrop && overKey === cellKey && "bg-accent/15")}
                      onDragOver={(ev) => {
                        if (!canDrop) return;
                        ev.preventDefault();
                        setOverKey(cellKey);
                      }}
                      onDragLeave={() => setOverKey((k) => (k === cellKey ? null : k))}
                      onDrop={(ev) => {
                        ev.preventDefault();
                        if (!drag || !canDrop) return;
                        const id = drag.id;
                        setDrag(null);
                        setOverKey(null);
                        const moved = entries.find((x) => x.id === id)?.teaching_assignment;
                        move.mutate(
                          { id, day_of_week: day, period_no: periodNo },
                          {
                            onError: (err) =>
                              void (moved ? explainFailure(err, moved, day, periodNo, id) : Promise.resolve(err.message)).then((msg) =>
                                toast(`ย้ายคาบไม่ได้ — ${msg}`, "error", { durationMs: 8000 }),
                              ),
                          },
                        );
                      }}
                    >
                      <div className="space-y-1">
                        {cellEntries.map((e) => {
                          const subjectId = e.teaching_assignment.subject_id;
                          return (
                            <div
                              key={e.id}
                              draggable={mayEdit}
                              onDragStart={(ev) => {
                                ev.dataTransfer.effectAllowed = "move";
                                ev.dataTransfer.setData("text/plain", e.id);
                                setDrag({ id: e.id, day, periodNo });
                              }}
                              onDragEnd={() => {
                                setDrag(null);
                                setOverKey(null);
                              }}
                              className={cn(
                                "relative space-y-0.5 rounded-lg px-3 py-2.5 leading-snug",
                                mayEdit && "cursor-grab active:cursor-grabbing",
                                drag?.id === e.id && "opacity-40",
                                styling.gradient(subjectId, e.teaching_assignment.classroom_id),
                              )}
                            >
                              <p className="pr-5 text-sm font-semibold">{subjectLabel(subjectId)}</p>
                              <p className="truncate">{subjectName(subjectId)}</p>
                              <div
                                className={cn(
                                  "mt-1.5 text-[11px]",
                                  // Teacher names are long: full width on the last line, badge above them.
                                  mode === "classroom" ? "flex flex-col-reverse items-start gap-1" : "flex items-center justify-between gap-2",
                                )}
                              >
                                <span className={cn("min-w-0 opacity-70", mode === "classroom" ? "break-words" : "truncate")}>
                                  {mode === "classroom" ? (
                                    teacherLines ? (
                                      teacherLines(e.teaching_assignment.teacher_id).map((line, k) => (
                                        <span key={k} className="block">
                                          {line}
                                        </span>
                                      ))
                                    ) : (
                                      teacherLabel(e.teaching_assignment.teacher_id)
                                    )
                                  ) : (
                                    roomLabel(e.teaching_assignment.classroom_id)
                                  )}
                                </span>
                                <span className={cn("shrink-0 rounded-full px-2 py-px text-[10px] leading-4", styling.typeBadge(subjectId))}>
                                  {styling.typeLabel(subjectId)}
                                </span>
                              </div>
                              {mayEdit && (
                                <button
                                  type="button"
                                  aria-label="ลบคาบนี้"
                                  onClick={() => {
                                    if (confirm(`ลบคาบนี้ออกจากตาราง?`)) del.mutate(e.id);
                                  }}
                                  className="absolute right-2 top-2 opacity-60 hover:text-destructive hover:opacity-100"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {(ghostAt.get(cellKey) ?? []).map((g) => (
                          <div
                            key={g.id}
                            title={`${subjectName(g.teaching_assignment.subject_id)} — ${teacherLabel(g.teaching_assignment.teacher_id)}`}
                            className="truncate rounded-lg border border-dashed border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground opacity-60"
                          >
                            {subjectLabel(g.teaching_assignment.subject_id)} · {teacherLabel(g.teaching_assignment.teacher_id)} ·{" "}
                            {roomLabel(g.teaching_assignment.classroom_id)}
                          </div>
                        ))}
                        {mayEdit ? (
                          <button
                            type="button"
                            onClick={() => setPlacing({ day, periodNo })}
                            className="flex w-full items-center justify-center rounded-lg border border-dashed border-border py-1 text-muted-foreground hover:bg-muted"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        ) : (
                          cellEntries.length === 0 &&
                          !ghostAt.has(cellKey) && (
                            <p className="py-4 text-center text-muted-foreground">—</p>
                          )
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <PlaceSheet
        open={placing !== null}
        day={placing?.day ?? 0}
        periodNo={placing?.periodNo ?? 0}
        periodLabel={placing ? displayNo(placing.periodNo) : 0}
        subjectName={subjectName}
        styling={styling}
        explainFailure={explainFailure}
        candidates={candidates}
        entries={entries}
        mode={mode}
        subjectLabel={subjectLabel}
        teacherLabel={teacherLabel}
        roomLabel={roomLabel}
        onClose={() => setPlacing(null)}
      />
    </div>
    <TimetableLegend styling={styling} subjectIds={[...new Set(entries.map((e) => e.teaching_assignment.subject_id))]} />
    </div>
  );
}

/** Colour key under the grid: the areas in view, the shade ramp for grade, and the subject-type labels. */
function TimetableLegend({ styling, subjectIds }: { styling: TimetableStyling; subjectIds: string[] }) {
  const areas = styling.legend(subjectIds);
  if (areas.length === 0) return null;
  const sample = areas[0]!.id;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">สีการ์ด</span>
      {areas.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full", a.dot)} />
          {a.name}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        ความเข้ม: ชั้นต่ำ
        <span className="flex overflow-hidden rounded">
          {([0, 1, 2] as const).map((step) => (
            <span key={step} className={cn("h-3 w-5", styling.step(sample, step))} />
          ))}
        </span>
        ชั้นสูง
      </span>
      <span className="inline-flex items-center gap-1.5">
        ป้ายประเภท:
        {(Object.keys(SUBJECT_TYPE_LABEL) as (keyof typeof SUBJECT_TYPE_LABEL)[]).map((t) => (
          <span key={t} className={cn("rounded-full px-2 py-px text-[10px] leading-4", SUBJECT_TYPE_BADGE[t])}>
            {SUBJECT_TYPE_LABEL[t]}
          </span>
        ))}
      </span>
    </div>
  );
}

type PlaceFilter = "all" | "open" | "done";

function PlaceSheet({
  open,
  day,
  periodNo,
  periodLabel,
  candidates,
  entries,
  mode,
  subjectLabel,
  subjectName,
  teacherLabel,
  roomLabel,
  styling,
  explainFailure,
  onClose,
}: {
  open: boolean;
  day: number;
  periodNo: number;
  /** Number shown to the user (teaching periods only); periodNo is the DB slot. */
  periodLabel: number;
  candidates: TeachingAssignment[];
  entries: ScheduleEntryRow[];
  mode: "classroom" | "teacher";
  subjectLabel: (id: string) => string;
  subjectName: (id: string) => string;
  teacherLabel: (id: string) => string;
  roomLabel: (id: string) => string;
  styling: TimetableStyling;
  explainFailure: (
    err: unknown,
    a: Pick<TeachingAssignment, "teacher_id" | "classroom_id" | "group_id">,
    day: number,
    periodNo: number,
  ) => Promise<string>;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateScheduleEntry();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PlaceFilter>("all");
  const [sort, setSort] = useState<"code" | "left">("code");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setFilter("all");
    setSelected(new Set());
  }, [open]);

  const countOf = (assignmentId: string) => entries.filter((e) => e.teaching_assignment_id === assignmentId).length;
  const isDone = (a: TeachingAssignment) => countOf(a.id) >= a.periods_per_week;
  const doneCount = candidates.filter(isDone).length;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates
      .filter((a) => (filter === "all" ? true : filter === "done" ? isDone(a) : !isDone(a)))
      .filter((a) => !q || `${subjectLabel(a.subject_id)} ${subjectName(a.subject_id)}`.toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "left"
          ? b.periods_per_week - countOf(b.id) - (a.periods_per_week - countOf(a.id))
          : subjectLabel(a.subject_id).localeCompare(subjectLabel(b.subject_id), "th", { numeric: true }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, entries, search, filter, sort]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function placeSelected() {
    setPlacing(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) => create.mutateAsync({ teaching_assignment_id: id, day_of_week: day, period_no: periodNo })),
    );
    setPlacing(false);
    const failed = await Promise.all(
      results.flatMap((r, i) => {
        if (r.status !== "rejected") return [];
        const assignment = candidates.find((x) => x.id === ids[i])!;
        return [explainFailure(r.reason, assignment, day, periodNo).then((msg) => `${subjectLabel(assignment.subject_id)}: ${msg}`)];
      }),
    );
    if (failed.length === 0) {
      toast(`วางคาบสำเร็จ ${ids.length} รายวิชา`);
      onClose();
      return;
    }
    toast(`วางคาบไม่ได้\n${failed.join("\n\n")}`, "error", { durationMs: 8000 });
    // keep only the ones that failed selected so the user can fix and retry
    setSelected(new Set(ids.filter((_, i) => results[i]!.status === "rejected")));
  }

  const tabs: [PlaceFilter, string, number][] = [
    ["all", "ทั้งหมด", candidates.length],
    ["open", "ยังไม่ครบ", candidates.length - doneCount],
    ["done", "ครบแล้ว", doneCount],
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`วางคาบ — ${DAY_LABEL[day] ?? day} คาบ ${periodLabel}`}
      description="เลือกวิชาที่ต้องการวางคาบในวันและเวลาที่กำหนด"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">เลือกแล้ว {selected.size} รายวิชา</p>
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-accent hover:underline">
              ล้างการเลือก
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button onClick={placeSelected} disabled={selected.size === 0 || placing}>
              {placing ? <Spinner className="h-3 w-3" /> : (
                <>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  วางคาบที่เลือก
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหารหัสวิชา หรือชื่อวิชา..."
            aria-label="ค้นหาวิชา"
          />
        </div>

        <div className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            {tabs.map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                  filter === key
                    ? "border-accent bg-accent/10 font-medium text-accent"
                    : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {label} ({n})
              </button>
            ))}
        </div>
        <div>
          <Select
            className="w-full"
            value={sort}
            onChange={(e) => setSort(e.target.value as "code" | "left")}
            aria-label="เรียงลำดับ"
          >
            <option value="code">เรียงตาม รหัสวิชา</option>
            <option value="left">เรียงตาม คาบที่เหลือ</option>
          </Select>
        </div>

        <ul className="space-y-2">
          {shown.map((a) => {
            const count = countOf(a.id);
            const full = count >= a.periods_per_week;
            const checked = selected.has(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  aria-pressed={checked}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    checked ? "border-accent/50 bg-accent/5" : "border-border hover:bg-muted/50",
                  )}
                >
                  {checked ? (
                    <CheckboxIcon className="h-5 w-5 shrink-0 text-accent" />
                  ) : (
                    <SquareIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", styling.color(a.subject_id, a.classroom_id))}>
                    <BookIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1 font-sarabun leading-tight">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {subjectLabel(a.subject_id)}
                      <span className={cn("rounded-full px-1.5 py-px text-[10px]", styling.typeBadge(a.subject_id))}>
                        {styling.typeLabel(a.subject_id)}
                      </span>
                    </p>
                    <p className="truncate text-sm font-medium text-foreground">{subjectName(a.subject_id)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {mode === "classroom" ? teacherLabel(a.teacher_id) : roomLabel(a.classroom_id)}
                    </p>
                  </div>
                  <div className="shrink-0 text-center leading-tight">
                    <p
                      className={cn(
                        "rounded-lg px-3 py-1 text-sm font-semibold",
                        full ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
                      )}
                    >
                      {count}/{a.periods_per_week}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">วางแล้ว</p>
                  </div>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              {candidates.length === 0
                ? "ยังไม่มีภาระงานสอนให้วาง — ไปมอบหมายที่หน้าภาระงานสอนก่อน"
                : "ไม่พบวิชาที่ตรงเงื่อนไข"}
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}

type DraftRow = { type: PeriodType; label: string; start: string; end: string };

/** Row name for messages: teaching rows by their คาบ number, breaks by label. */
function rowName(list: DraftRow[], i: number) {
  const r = list[i]!;
  return r.type === "break" ? `ช่วงพัก${r.label ? ` "${r.label}"` : ""}` : `คาบที่ ${list.slice(0, i + 1).filter((x) => x.type === "teaching").length}`;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

function formatDuration(mins: number) {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} ชั่วโมง` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ");
}

/** period_definitions are per day; the editor works on one day's template and writes it to every day of the scope. */
function templateFrom(periods: PeriodDefinition[]): { rows: DraftRow[]; days: number[]; uniform: boolean } {
  const days = [...new Set(periods.map((p) => p.day_of_week))].sort((a, b) => a - b);
  const rowsOf = (d: number): DraftRow[] =>
    periods
      .filter((p) => p.day_of_week === d)
      .sort((a, b) => a.period_no - b.period_no)
      .map((p) => ({ type: p.period_type, label: p.label, start: p.start_time.slice(0, 5), end: p.end_time.slice(0, 5) }));
  const rows = days.length ? rowsOf(days[0]!) : [];
  const key = JSON.stringify(rows);
  return { rows, days, uniform: days.every((d) => JSON.stringify(rowsOf(d)) === key) };
}

const DEFAULT_ROWS: DraftRow[] = generatePeriods({
  startTime: "08:30",
  periodsPerDay: 7,
  minutesPerPeriod: 60,
  lunch: { enabled: true, afterPeriod: 3, minutes: 90, label: "พักกลางวัน" },
  days: [1],
}).map((r) => ({ type: r.period_type, label: r.label, start: r.start_time, end: r.end_time }));

const ALL_DAYS = [1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

function PeriodSettingsSheet({
  open,
  onOpenChange,
  departmentId,
  academicYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  academicYear: number;
}) {
  const toast = useToast();
  const generate = useGeneratePeriods();
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const [gradeTab, setGradeTab] = useState<string | null>(null);
  const [mode, setMode] = useState<"custom" | "inherit">("custom");
  const [rows, setRows] = useState<DraftRow[]>(DEFAULT_ROWS);
  const [breaksOpen, setBreaksOpen] = useState(false);
  const [days, setDays] = useState<number[]>(WEEKDAYS);

  const defaultQuery = useDepartmentPeriods(departmentId);
  const gradeQuery = usePeriodsForGrade(gradeTab ? departmentId : null, gradeTab);
  const scoped = gradeTab === null ? defaultQuery : gradeQuery;
  const scopePeriods = scoped.data ?? [];
  const scopeTpl = useMemo(() => templateFrom(scopePeriods), [scopePeriods]);
  const defaultTpl = useMemo(() => templateFrom(defaultQuery.data ?? []), [defaultQuery.data]);
  const hasOverride = scopePeriods.length > 0;
  const slotsQuery = useDepartmentScheduledSlots(departmentId, academicYear);
  const overrideGrades = useGradesWithPeriodOverride(departmentId).data;

  useEffect(() => {
    setGradeTab(null);
  }, [departmentId]);

  /** Seed the editor: this scope's rows, else the department default, else a stock day. */
  function reset() {
    const seed = hasOverride ? scopeTpl.rows : defaultTpl.rows.length ? defaultTpl.rows : DEFAULT_ROWS;
    setRows(seed.map((r) => ({ ...r })));
    setMode(gradeTab !== null && !hasOverride ? "inherit" : "custom");
    const seedDays = hasOverride ? scopeTpl.days : defaultTpl.days;
    setDays(seedDays.length ? seedDays : WEEKDAYS);
  }

  useEffect(() => {
    if (open && !scoped.isLoading && !defaultQuery.isLoading) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gradeTab, scoped.isLoading, scoped.dataUpdatedAt, defaultQuery.dataUpdatedAt]);

  const teaching = rows.filter((r) => r.type === "teaching");
  const breaks = rows.filter((r) => r.type === "break");
  const breakAfter = new Map<number, number>();
  rows.forEach((r, i) => {
    if (r.type === "break") breakAfter.set(i, rows.slice(0, i).filter((x) => x.type === "teaching").length);
  });
  const sum = (list: DraftRow[]) => list.reduce((t, r) => t + Math.max(0, toMin(r.end) - toMin(r.start)), 0);
  const first = rows[0];
  const last = rows[rows.length - 1];

  const error = (() => {
    if (rows.length === 0) return "ต้องมีอย่างน้อย 1 คาบ";
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      if (toMin(r.end) <= toMin(r.start)) return `${rowName(rows, i)}: เวลาสิ้นสุดต้องหลังเวลาเริ่ม`;
      if (i > 0 && toMin(r.start) < toMin(rows[i - 1]!.end)) return `${rowName(rows, i)}: เวลาเริ่มทับซ้อนกับแถวก่อนหน้า`;
      if (r.type === "break" && !r.label.trim()) return `${rowName(rows, i)}: กรุณาตั้งชื่อช่วงพัก`;
    }
    return "";
  })();

  function patch(i: number, change: Partial<DraftRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  }

  /** Move every row from index i on by delta minutes. */
  function shiftFrom(list: DraftRow[], i: number, delta: number) {
    return list.map((r, idx) =>
      idx < i ? r : { ...r, start: toHHMM(toMin(r.start) + delta), end: toHHMM(toMin(r.end) + delta) },
    );
  }

  function appendTeaching() {
    setRows((prev) => {
      const lastRow = prev[prev.length - 1];
      const lastTeaching = [...prev].reverse().find((r) => r.type === "teaching");
      const minutes = lastTeaching ? toMin(lastTeaching.end) - toMin(lastTeaching.start) : 50;
      const start = lastRow ? toMin(lastRow.end) : toMin("08:30");
      return [...prev, { type: "teaching", label: "", start: toHHMM(start), end: toHHMM(start + minutes) }];
    });
  }

  function setCount(n: number) {
    const target = Math.min(12, Math.max(1, n));
    if (target > teaching.length) {
      for (let i = teaching.length; i < target; i++) appendTeaching();
    } else if (target < teaching.length) {
      let remove = teaching.length - target;
      setRows((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0 && remove > 0; i--) {
          if (next[i]!.type === "teaching") {
            next.splice(i, 1);
            remove--;
          }
        }
        return next;
      });
    }
  }

  /** Insert a break right after the n-th teaching period (after any break already there), pushing later rows down. */
  function insertBreak(afterTeaching: number, minutes: number, label: string) {
    setRows((prev) => {
      let seen = 0;
      let at = 0;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i]!.type === "teaching" && ++seen === afterTeaching) {
          at = i + 1;
          while (prev[at]?.type === "break") at++;
          break;
        }
        at = i + 1;
      }
      const start = at > 0 ? prev[at - 1]!.end : "12:00";
      const next = shiftFrom(prev, at, minutes);
      next.splice(at, 0, { type: "break", label, start, end: toHHMM(toMin(start) + minutes) });
      return next;
    });
  }

  function removeBreak(i: number) {
    setRows((prev) => {
      const r = prev[i]!;
      return shiftFrom(prev.filter((_, idx) => idx !== i), i, -(toMin(r.end) - toMin(r.start)));
    });
  }

  function setBreakMinutes(i: number, minutes: number) {
    setRows((prev) => {
      const r = prev[i]!;
      const delta = Math.max(1, minutes) - (toMin(r.end) - toMin(r.start));
      return shiftFrom(prev, i, delta).map((row, idx) => (idx === i ? { ...row, start: r.start } : row));
    });
  }

  function moveBreak(i: number, afterTeaching: number) {
    const r = rows[i]!;
    const minutes = toMin(r.end) - toMin(r.start);
    const label = r.label;
    setRows((prev) => shiftFrom(prev.filter((_, idx) => idx !== i), i, -minutes));
    insertBreak(afterTeaching, minutes, label);
  }

  function toggleLunch(on: boolean) {
    if (on) insertBreak(Math.min(4, teaching.length), 60, "พักกลางวัน");
    else for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.type === "break") removeBreak(i);
  }

  function addBreak() {
    const taken = new Set(breakAfter.values());
    const slot = Array.from({ length: teaching.length }, (_, k) => k + 1).find((n) => !taken.has(n)) ?? teaching.length;
    insertBreak(slot, 15, "พักเบรก");
  }

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  const inheriting = gradeTab !== null && mode === "inherit";

  /** Placed schedule entries this save would strand (block) or retime (notice). Scope = rooms that actually use this table. */
  const impact = useMemo(() => {
    const blocked = new Map<string, number>();
    let retimed = 0;
    if (inheriting && !hasOverride) return { blocked, retimed };
    const newRows = inheriting ? defaultTpl.rows : rows;
    const newDays = inheriting ? defaultTpl.days : days;
    const oldPeriods = gradeTab && hasOverride ? scopePeriods : (defaultQuery.data ?? []);
    const slots = (slotsQuery.data ?? [])
      .filter((sl) => (gradeTab ? sl.grade_level_id === gradeTab : !overrideGrades?.has(sl.grade_level_id)))
      .sort((a, b) => a.day_of_week - b.day_of_week || a.period_no - b.period_no);
    for (const sl of slots) {
      const next = newDays.includes(sl.day_of_week) ? newRows[sl.period_no - 1] : undefined;
      if (!next || next.type !== "teaching") {
        const key = `${DAY_LABEL[sl.day_of_week]} คาบ ${teachingOrdinal(oldPeriods, sl.day_of_week, sl.period_no)}`;
        blocked.set(key, (blocked.get(key) ?? 0) + 1);
        continue;
      }
      const old = oldPeriods.find((p) => p.day_of_week === sl.day_of_week && p.period_no === sl.period_no);
      if (old && (old.start_time.slice(0, 5) !== next.start || old.end_time.slice(0, 5) !== next.end)) retimed++;
    }
    return { blocked, retimed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsQuery.data, overrideGrades, rows, days, mode, gradeTab, hasOverride, scopePeriods, defaultQuery.data, defaultTpl]);
  const blockedCount = [...impact.blocked.values()].reduce((a, b) => a + b, 0);

  function save() {
    if (blockedCount > 0) return;
    if (inheriting && !hasOverride) return onOpenChange(false);
    if (!inheriting && days.length === 0) return;
    if (!inheriting && !scopeTpl.uniform && !confirm("แต่ละวันมีเวลาต่างกัน การบันทึกจะใช้ตารางนี้กับทุกวัน ยืนยัน?")) return;
    // Rows only for the chosen days, but clear every day this scope had before — unticking a day removes it.
    const clearDays = inheriting ? ALL_DAYS : [...new Set([...days, ...scopeTpl.days])];
    const newRows = inheriting
      ? []
      : days.flatMap((day) =>
          rows.map((r, i) => ({
            department_id: departmentId,
            grade_level_id: gradeTab,
            day_of_week: day,
            period_no: i + 1,
            period_type: r.type,
            label: r.type === "break" ? r.label.trim() : "",
            start_time: r.start,
            end_time: r.end,
          })),
        );
    generate.mutate(
      { departmentId, gradeLevelId: gradeTab, days: clearDays, rows: newRows },
      {
        onSuccess: () => {
          toast("บันทึกสำเร็จ");
          onOpenChange(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  const editable = mode === "custom";
  const modes: { key: "custom" | "inherit"; icon: typeof PencilIcon; title: string; hint: string; disabled?: boolean }[] = [
    { key: "custom", icon: PencilIcon, title: "กำหนดเวลาเอง", hint: "ระบุเวลาเริ่ม - สิ้นสุดของแต่ละคาบ" },
    {
      key: "inherit",
      icon: SettingsIcon,
      title: "ใช้ค่าของทั้งแผนก",
      hint: gradeTab === null ? "เลือกได้เฉพาะระดับชั้น" : "ใช้ตารางเวลาเริ่มต้นของแผนก",
      disabled: gradeTab === null,
    },
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="ตั้งค่าคาบเวลา"
      description="กำหนดเวลาเริ่ม-สิ้นสุดของแต่ละคาบและช่วงพักในตารางเรียน"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={(editable && (!!error || days.length === 0)) || blockedCount > 0 || slotsQuery.isLoading || slotsQuery.isError || generate.isPending}>
            {generate.isPending ? <Spinner className="h-3 w-3" /> : (
              <>
                <CheckmarkCircleIcon className="h-3.5 w-3.5" />
                บันทึกการตั้งค่า
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">ใช้กับ</p>
          <div className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
            {[{ id: null as string | null, name: "ทั้งแผนก" }, ...gradeLevels].map((g) => (
              <button
                key={g.id ?? "default"}
                type="button"
                role="tab"
                aria-selected={gradeTab === g.id}
                onClick={() => setGradeTab(g.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                  gradeTab === g.id
                    ? "border-accent bg-accent/10 font-medium text-accent"
                    : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {g.id === null && <Users className="h-3.5 w-3.5" />}
                {g.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">รูปแบบการตั้งค่า</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                disabled={m.disabled}
                onClick={() => setMode(m.key)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  mode === m.key ? "border-accent bg-accent/5" : "border-border hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    mode === m.key ? "border-accent" : "border-muted-foreground/40",
                  )}
                >
                  {mode === m.key && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <m.icon className="h-3.5 w-3.5" />
                    {m.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.hint}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {editable && (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">วันที่ใช้ตารางนี้</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(DAY_LABEL).map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(Number(d))}
                  onClick={() => toggleDay(Number(d))}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                    days.includes(Number(d))
                      ? "border-accent bg-accent/10 font-medium text-accent"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {days.length === 0 && <p className="text-xs text-destructive">เลือกอย่างน้อย 1 วัน</p>}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl bg-accent/10 px-3 py-2.5 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <p>
            {editable
              ? `ตารางนี้จะใช้กับวันที่เลือกและมีผลกับตารางเรียนของ${gradeTab ? "ระดับชั้นที่เลือก" : "ทั้งแผนก"}`
              : "ระดับชั้นนี้จะใช้ตารางเวลาของทั้งแผนก — บันทึกเพื่อลบตารางเฉพาะระดับชั้นที่เคยตั้งไว้"}
          </p>
        </div>

        {blockedCount > 0 && (
          <div className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <p className="font-medium">
              บันทึกไม่ได้ — มี {blockedCount} รายการในตารางสอนที่จะอยู่ในคาบที่ไม่ใช่คาบสอน
            </p>
            <p>{[...impact.blocked].map(([k, n]) => `${k} (${n})`).join(", ")}</p>
            <p className="text-destructive/80">ย้ายหรือลบรายการเหล่านี้ในตารางเรียนก่อน แล้วกลับมาบันทึกอีกครั้ง</p>
          </div>
        )}
        {blockedCount === 0 && impact.retimed > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            มี {impact.retimed} รายการในตารางสอนที่เวลาจะเปลี่ยน
          </p>
        )}

        {slotsQuery.isError && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ตรวจสอบตารางสอนที่จัดไว้ไม่ได้ จึงบันทึกไม่ได้ในตอนนี้ ลองเปิดใหม่อีกครั้ง
          </p>
        )}
        {editable && scoped.isLoading && (
          <div className="space-y-1.5" role="status" aria-label="กำลังโหลด">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {editable && !scoped.isLoading && (
          <>
            {!scopeTpl.uniform && (
              <p className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning">
                แต่ละวันมีเวลาต่างกัน — ตารางด้านล่างเป็นของวัน{DAY_LABEL[scopeTpl.days[0]!]} การบันทึกจะใช้กับทุกวัน
              </p>
            )}

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">จำนวนคาบเรียน</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="ลดจำนวนคาบ" onClick={() => setCount(teaching.length - 1)} disabled={teaching.length <= 1}>
                    −
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    className="h-9 w-16 text-center"
                    value={teaching.length}
                    onChange={(e) => setCount(Number(e.target.value))}
                    aria-label="จำนวนคาบเรียน"
                  />
                  <Button variant="outline" size="icon" aria-label="เพิ่มจำนวนคาบ" onClick={() => setCount(teaching.length + 1)} disabled={teaching.length >= 12}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[11px] text-muted-foreground">รองรับได้ตั้งแต่ 1 - 12 คาบ</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">ช่วงพัก</p>
                <div className="flex items-center gap-3">
                  <Switch checked={breaks.length > 0} onChange={toggleLunch} />
                  <span className="text-xs text-muted-foreground">เปิดใช้งานช่วงพักกลางวัน</span>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={breaksOpen}
                    onClick={() => setBreaksOpen((v) => !v)}
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                    ตั้งค่าขั้นสูง
                    <ChevronForward className={cn("h-3 w-3 transition-transform", breaksOpen ? "rotate-90" : "")} />
                  </Button>
                </div>
              </div>
            </div>

            {breaksOpen && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">ช่วงพักทั้งหมด</p>
                  <Button size="sm" variant="outline" onClick={addBreak} disabled={teaching.length === 0}>
                    <Plus className="h-3.5 w-3.5" />
                    เพิ่มช่วงพัก
                  </Button>
                </div>
                {breaks.length === 0 && <p className="py-2 text-xs text-muted-foreground">ยังไม่มีช่วงพัก</p>}
                {[...breakAfter.keys()].map((i) => {
                  const r = rows[i]!;
                  return (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5rem_auto] items-end gap-2">
                      <Field label="ชื่อ">
                        <Input value={r.label} onChange={(e) => patch(i, { label: e.target.value })} />
                      </Field>
                      <Field label="หลังคาบที่">
                        <Select value={breakAfter.get(i)} onChange={(e) => moveBreak(i, Number(e.target.value))}>
                          {Array.from({ length: teaching.length }, (_, k) => k + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="นาที">
                        <Input
                          type="number"
                          min={1}
                          value={toMin(r.end) - toMin(r.start)}
                          onChange={(e) => setBreakMinutes(i, Number(e.target.value) || 1)}
                        />
                      </Field>
                      <Button variant="ghost" size="icon" aria-label="ลบช่วงพัก" onClick={() => removeBreak(i)}>
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[38rem] border-collapse text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="w-12 px-2 py-2.5 text-center font-medium">คาบ</th>
                    <th className="px-2 py-2.5 text-left font-medium">ประเภท</th>
                    <th className="px-2 py-2.5 text-left font-medium">เวลาเริ่ม</th>
                    <th className="px-2 py-2.5 text-left font-medium">เวลาสิ้นสุด</th>
                    <th className="px-2 py-2.5 text-center font-medium">ระยะเวลา</th>
                    <th className="w-14 px-2 py-2.5 text-center font-medium">ลบ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isBreak = r.type === "break";
                    return (
                      <tr key={i} className={cn("border-t border-border", isBreak && "bg-warning/10")}>
                        <td className="px-2 py-2 text-center text-sm font-semibold">
                          {isBreak ? "—" : rows.slice(0, i + 1).filter((x) => x.type === "teaching").length}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            {isBreak ? (
                              <RestaurantIcon className="h-4 w-4 shrink-0 text-warning" />
                            ) : (
                              <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <Select
                              className="h-8 w-auto min-w-[6.5rem]"
                              value={r.type}
                              onChange={(e) => {
                                const type = e.target.value as PeriodType;
                                patch(i, { type, label: type === "break" ? r.label || "พัก" : "" });
                              }}
                              aria-label={`ประเภทของ${rowName(rows, i)}`}
                            >
                              <option value="teaching">คาบเรียน</option>
                              <option value="break">ช่วงพัก</option>
                            </Select>
                            {isBreak && (
                              <Input
                                className="h-8 min-w-[6rem]"
                                value={r.label}
                                onChange={(e) => patch(i, { label: e.target.value })}
                                aria-label="ชื่อช่วงพัก"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <Input type="time" className="h-8" value={r.start} onChange={(e) => patch(i, { start: e.target.value })} aria-label={`เวลาเริ่มของ${rowName(rows, i)}`} />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="time" className="h-8" value={r.end} onChange={(e) => patch(i, { end: e.target.value })} aria-label={`เวลาสิ้นสุดของ${rowName(rows, i)}`} />
                        </td>
                        <td className={cn("px-2 py-2 text-center", isBreak && "text-warning")}>
                          {formatDuration(toMin(r.end) - toMin(r.start))}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`ลบ${rowName(rows, i)}`}
                            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}


            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" size="sm" onClick={appendTeaching} disabled={teaching.length >= 12}>
                <Plus className="h-3.5 w-3.5" />
                เพิ่มคาบเรียน
              </Button>
              <Button variant="outline" size="sm" onClick={reset}>
                รีเซ็ตเป็นค่าเริ่มต้น
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-success/30 bg-success/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-success">
                <CheckmarkCircleIcon className="h-4 w-4" />
                สรุปเวลาเรียน
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <StatChip
                  icon={GraduationCap}
                  tint="bg-sky-100 text-sky-600 dark:bg-sky-500/20"
                  value={formatDuration(sum(teaching))}
                  label={`เวลาเรียนรวม · ${teaching.length} คาบเรียน (ไม่รวมพัก)`}
                />
                <StatChip
                  icon={RestaurantIcon}
                  tint="bg-orange-100 text-orange-600 dark:bg-orange-500/20"
                  value={formatDuration(sum(breaks))}
                  label={`เวลาพักรวม · ${breaks.length} ช่วงพัก`}
                />
                <StatChip
                  icon={TimeIcon}
                  tint="bg-violet-100 text-violet-600 dark:bg-violet-500/20"
                  value={first && last ? formatDuration(toMin(last.end) - toMin(first.start)) : "—"}
                  label={first && last ? `เวลาทั้งหมดต่อวัน · ${first.start} - ${last.end}` : "เวลาทั้งหมดต่อวัน"}
                />
              </div>
            </div>
          </>
        )}
      </div>

    </Sheet>
  );
}

const lineTab = (active: boolean, grow = false) =>
  cn(
    "inline-flex h-8 min-w-0 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
    grow ? "flex-1" : "shrink-0",
    active
      ? "border-foreground text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );
