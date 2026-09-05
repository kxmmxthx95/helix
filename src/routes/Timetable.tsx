import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack, ChevronForward, Plus, SettingsIcon, TimetableIcon, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Field, Input, Select, Skeleton, Spinner, Switch, Avatar } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { avatarUrl } from "@/hooks/useAvatar";
import { useMyClassroom } from "@/hooks/useAttendance";
import {
  useDeletePeriodDefinition,
  useDepartmentPeriods,
  useGeneratePeriods,
  usePeriodsForGrade,
  useSavePeriodDefinition,
  type PeriodDefinitionDraft,
} from "@/hooks/usePeriodDefinitions";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useProfiles, type ProfileRow } from "@/hooks/useProfiles";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { useDepartmentTeachingAssignments } from "@/hooks/useTeachingLoad";
import {
  useClassroomSchedule,
  useCreateScheduleEntry,
  useDeleteScheduleEntry,
  useTeacherSchedule,
  type ScheduleEntryRow,
} from "@/hooks/useSchedule";
import { generatePeriods, type PeriodBreakConfig } from "@/lib/periodGenerator";
import {
  profileFullName,
  type Classroom,
  type GradeLevel,
  type PeriodDefinition,
  type PeriodType,
  type TeachingAssignment,
} from "@/lib/database.types";
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
  const [term, setTerm] = useState<1 | 2>(1);
  const [view, setView] = useState<View | "">("");
  const [classroomId, setClassroomId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [periodSettingsOpen, setPeriodSettingsOpen] = useState(false);

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
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
    setClassroomId("");
    setTeacherId("");
  }, [departmentId, isStudent]);

  if (!me) return null;

  if (isStudent) {
    return myClassroom ? (
      <div className="space-y-4">
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
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select
          className="h-8 w-auto min-w-[10rem] shrink-0"
          value={view}
          onChange={(e) => {
            setView(e.target.value as View);
            setClassroomId("");
            setTeacherId("");
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

      <Sheet
        open={periodSettingsOpen}
        onOpenChange={setPeriodSettingsOpen}
        title="ตั้งค่าคาบเวลา"
      >
        {departmentId && <PeriodsTab departmentId={departmentId} />}
      </Sheet>

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
          {view === "classroom" &&
            (classroomId ? (
              <ClassroomTimetable
                departmentId={departmentId}
                classroomId={classroomId}
                academicYear={academicYear}
                term={scheduleTerm}
                mayEdit={mayEdit}
                classrooms={classrooms}
                gradeLevels={gradeLevels}
                teachers={teachers}
                onBack={() => setClassroomId("")}
              />
            ) : (
              <ScheduleList
                items={[...classrooms]
                  .sort((a, b) => {
                    const gradeOrder =
                      (gradeLevels.findIndex((g) => g.id === a.grade_level_id) ?? -1) -
                      (gradeLevels.findIndex((g) => g.id === b.grade_level_id) ?? -1);
                    return gradeOrder !== 0 ? gradeOrder : a.name.localeCompare(b.name, undefined, { numeric: true });
                  })
                  .map((c) => ({
                    id: c.id,
                    label: `${gradeLevels.find((g) => g.id === c.grade_level_id)?.name ?? "—"}/${c.name}`,
                  }))}
                onSelect={setClassroomId}
              />
            ))}

          {view === "teacher" &&
            (teacherId ? (
              <TeacherTimetable
                departmentId={departmentId}
                teacherId={teacherId}
                academicYear={academicYear}
                term={scheduleTerm}
                mayEdit={mayEdit}
                classrooms={classrooms}
                gradeLevels={gradeLevels}
                teachers={teachers}
                onBack={() => setTeacherId("")}
              />
            ) : (
              <ScheduleList
                items={teachers.map((t) => ({
                  id: t.id,
                  prefix: t.prefix,
                  firstName: t.first_name,
                  lastName: t.last_name,
                  avatarSrc: avatarUrl(t),
                }))}
                onSelect={setTeacherId}
              />
            ))}
        </>
      )}
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
}: {
  departmentId: string;
  classroomId: string;
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
    ? `${gradeLevels.find((g) => g.id === classroom.grade_level_id)?.name ?? "—"}/${classroom.name}`
    : "—";
  const { data: defaultPeriods = [], isLoading: loadingDefaultPeriods } = useDepartmentPeriods(departmentId);
  const { data: gradePeriods = [], isLoading: loadingGradePeriods } = usePeriodsForGrade(
    departmentId,
    classroomGradeLevelId,
  );
  // Grade-specific rows (0031) override the department default at the same day+period_no.
  const periods = useMemo(() => {
    const map = new Map(defaultPeriods.map((p) => [`${p.day_of_week}-${p.period_no}`, p]));
    for (const p of gradePeriods) map.set(`${p.day_of_week}-${p.period_no}`, p);
    return [...map.values()];
  }, [defaultPeriods, gradePeriods]);
  const { data: entries = [], isLoading: loadingEntries } = useClassroomSchedule(classroomId, academicYear, term);
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
    () => assignments.filter((a) => a.classroom_id === classroomId),
    [assignments, classroomId],
  );

  return (
    <>
      {onBack && <BackHeader label={classroomLabel} onBack={onBack} />}
      <TimetableGrid
        periods={periods}
        entries={entries}
        candidates={candidates}
        mode="classroom"
        mayEdit={mayEdit}
        isLoading={loadingDefaultPeriods || loadingGradePeriods || loadingEntries}
        subjectLabel={(id) => subjects.find((s) => s.id === id)?.code ?? "—"}
        teacherLabel={(id) => {
          const t = teachers.find((x) => x.id === id);
          return t ? profileFullName(t) : "—";
        }}
        roomLabel={(id) => {
          const c = classrooms.find((x) => x.id === id);
          const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.name;
          return c ? `${g ?? "—"}/${c.name}` : "—";
        }}
      />
    </>
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
  onBack,
}: {
  departmentId: string;
  teacherId: string;
  academicYear: number;
  term: number | null;
  mayEdit: boolean;
  classrooms: Classroom[];
  gradeLevels: GradeLevel[];
  teachers: ProfileRow[];
  onBack: () => void;
}) {
  const teacherLabelText = (() => {
    const t = teachers.find((x) => x.id === teacherId);
    return t ? profileFullName(t) : "—";
  })();
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

  return (
    <>
      <BackHeader label={teacherLabelText} onBack={onBack} />
      <TimetableGrid
        periods={periods}
        entries={entries}
        candidates={candidates}
        mode="teacher"
        mayEdit={mayEdit}
        isLoading={loadingPeriods || loadingEntries}
        subjectLabel={(id) => subjects.find((s) => s.id === id)?.code ?? "—"}
        teacherLabel={(id) => {
          const t = teachers.find((x) => x.id === id);
          return t ? profileFullName(t) : "—";
        }}
        roomLabel={(id) => {
          const c = classrooms.find((x) => x.id === id);
          const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.name;
          return c ? `${g ?? "—"}/${c.name}` : "—";
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

function ScheduleList({
  items,
  onSelect,
}: {
  items: (
    | { id: string; label: string }
    | {
        id: string;
        prefix: string | null;
        firstName: string;
        lastName: string;
        avatarSrc: string | null;
      }
  )[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีรายการในแผนกนี้" />;
  }
  return (
    <ul className="divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card text-xs">
      {items.map((item) => {
        const isPerson = "firstName" in item;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {isPerson ? (
                  <>
                    <Avatar
                      name={`${item.firstName} ${item.lastName}`}
                      src={item.avatarSrc}
                      className="h-7 w-7 shrink-0 text-[10px]"
                    />
                    <div className="min-w-0 font-sarabun leading-tight text-foreground">
                      <p className="truncate font-medium">{`${item.prefix ?? ""}${item.firstName}`}</p>
                      <p className="truncate font-medium">{item.lastName}</p>
                    </div>
                  </>
                ) : (
                  <span className="min-w-0 truncate font-sarabun">{item.label}</span>
                )}
              </div>
              <ChevronForward className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TimetableGrid({
  periods,
  entries,
  candidates,
  mode,
  mayEdit,
  isLoading,
  subjectLabel,
  teacherLabel,
  roomLabel,
}: {
  periods: PeriodDefinition[];
  entries: ScheduleEntryRow[];
  candidates: TeachingAssignment[];
  mode: "classroom" | "teacher";
  mayEdit: boolean;
  isLoading: boolean;
  subjectLabel: (id: string) => string;
  teacherLabel: (id: string) => string;
  roomLabel: (id: string) => string;
}) {
  const del = useDeleteScheduleEntry();
  const [placing, setPlacing] = useState<{ day: number; periodNo: number } | null>(null);

  const days = useMemo(() => [...new Set(periods.map((p) => p.day_of_week))].sort((a, b) => a - b), [periods]);
  const maxPeriodNo = periods.reduce((m, p) => Math.max(m, p.period_no), 0);

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

  function entryLabel(e: ScheduleEntryRow) {
    return mode === "classroom"
      ? `${subjectLabel(e.teaching_assignment.subject_id)} · ${teacherLabel(e.teaching_assignment.teacher_id)}`
      : `${subjectLabel(e.teaching_assignment.subject_id)} · ${roomLabel(e.teaching_assignment.classroom_id)}`;
  }

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
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[40rem] table-fixed text-xs">
        <thead className="bg-muted text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-12 px-2 py-2 font-medium">คาบ</th>
            {days.map((d) => (
              <th key={d} className="px-2 py-2 text-center font-medium">
                {DAY_LABEL[d] ?? d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxPeriodNo }, (_, i) => i + 1).map((periodNo) => (
            <tr key={periodNo} className="border-t border-border align-top">
              <td className="px-2 py-2 text-center text-muted-foreground">{periodNo}</td>
              {days.map((day) => {
                const pd = periodAt.get(`${day}-${periodNo}`);
                const cellEntries = entriesAt.get(`${day}-${periodNo}`) ?? [];

                if (!pd) return <td key={day} className="px-1 py-1" />;

                if (pd.period_type === "break") {
                  return (
                    <td key={day} className="px-1 py-1">
                      <div className="rounded bg-muted px-1.5 py-1.5 text-center text-muted-foreground">
                        {pd.label}
                      </div>
                    </td>
                  );
                }

                return (
                  <td key={day} className="px-1 py-1">
                    <div className="space-y-1">
                      {cellEntries.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between gap-1 rounded bg-accent/15 px-1.5 py-1"
                        >
                          <span className="min-w-0 truncate">{entryLabel(e)}</span>
                          {mayEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`ลบคาบนี้ออกจากตาราง?`)) del.mutate(e.id);
                              }}
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {mayEdit && (
                        <button
                          type="button"
                          onClick={() => setPlacing({ day, periodNo })}
                          className="flex w-full items-center justify-center rounded border border-dashed border-border py-1 text-muted-foreground hover:bg-muted"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <PlaceSheet
        open={placing !== null}
        day={placing?.day ?? 0}
        periodNo={placing?.periodNo ?? 0}
        candidates={candidates}
        entries={entries}
        mode={mode}
        subjectLabel={subjectLabel}
        teacherLabel={teacherLabel}
        roomLabel={roomLabel}
        onClose={() => setPlacing(null)}
      />
    </div>
  );
}

function PlaceSheet({
  open,
  day,
  periodNo,
  candidates,
  entries,
  mode,
  subjectLabel,
  teacherLabel,
  roomLabel,
  onClose,
}: {
  open: boolean;
  day: number;
  periodNo: number;
  candidates: TeachingAssignment[];
  entries: ScheduleEntryRow[];
  mode: "classroom" | "teacher";
  subjectLabel: (id: string) => string;
  teacherLabel: (id: string) => string;
  roomLabel: (id: string) => string;
  onClose: () => void;
}) {
  const create = useCreateScheduleEntry();

  function scheduledCount(assignmentId: string) {
    return entries.filter((e) => e.teaching_assignment_id === assignmentId).length;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`วางคาบ — ${DAY_LABEL[day] ?? day} คาบ ${periodNo}`}
    >
      <ul className="divide-y divide-border text-sm">
        {candidates.map((a) => {
          const count = scheduledCount(a.id);
          const over = count >= a.periods_per_week;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() =>
                  create.mutate(
                    { teaching_assignment_id: a.id, day_of_week: day, period_no: periodNo },
                    { onSuccess: onClose, onError: (err) => alert(`วางคาบไม่ได้: ${err.message}`) },
                  )
                }
                className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-accent"
              >
                <span className="min-w-0 truncate">
                  {mode === "classroom"
                    ? `${teacherLabel(a.teacher_id)} · ${subjectLabel(a.subject_id)}`
                    : `${subjectLabel(a.subject_id)} · ${roomLabel(a.classroom_id)}`}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    over ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}/{a.periods_per_week}
                </span>
              </button>
            </li>
          );
        })}
        {candidates.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            ยังไม่มีภาระงานสอนให้วาง — ไปมอบหมายที่หน้าภาระงานสอนก่อน
          </li>
        )}
      </ul>
    </Sheet>
  );
}

const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  teaching: "คาบสอน",
  break: "พัก/กิจกรรม",
};

/** grade_level_id null = ทั้งแผนก (default) — ระดับชั้นไหนไม่ตั้งเองก็ fallback มาใช้ค่านี้ (migration 0031). */
function PeriodsTab({ departmentId }: { departmentId: string }) {
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const [gradeTab, setGradeTab] = useState<string | null>(null);

  useEffect(() => {
    setGradeTab(null);
  }, [departmentId]);

  return (
    <div className="space-y-3">
      <div className="flex w-full gap-0 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={gradeTab === null}
          onClick={() => setGradeTab(null)}
          className={lineTab(gradeTab === null, true)}
        >
          <span className="truncate">ทั้งแผนก (default)</span>
        </button>
        {gradeLevels.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={gradeTab === g.id}
            onClick={() => setGradeTab(g.id)}
            className={lineTab(gradeTab === g.id, true)}
          >
            <span className="truncate">{g.name}</span>
          </button>
        ))}
      </div>
      <PeriodDefinitionsCard
        key={`periods-${departmentId}-${gradeTab ?? "default"}`}
        departmentId={departmentId}
        gradeLevelId={gradeTab}
      />
    </div>
  );
}

function PeriodDefinitionsCard({
  departmentId,
  gradeLevelId,
}: {
  departmentId: string;
  gradeLevelId: string | null;
}) {
  const defaultPeriods = useDepartmentPeriods(gradeLevelId === null ? departmentId : null);
  const gradePeriods = usePeriodsForGrade(gradeLevelId !== null ? departmentId : null, gradeLevelId);
  const { data: periods = [], isLoading } = gradeLevelId === null ? defaultPeriods : gradePeriods;
  const [editing, setEditing] = useState<PeriodDefinition | null>(null);
  const [creating, setCreating] = useState(false);
  const [quickSetup, setQuickSetup] = useState(false);

  const days = [...new Set(periods.map((p) => p.day_of_week))].sort((a, b) => a - b);
  const maxPeriodNo = periods.reduce((m, p) => Math.max(m, p.period_no), 0);
  const periodAt = new Map(periods.map((p) => [`${p.day_of_week}-${p.period_no}`, p]));

  const sheets = (
    <>
      <PeriodSheet
        mode="edit"
        period={editing}
        open={editing !== null}
        departmentId={departmentId}
        gradeLevelId={gradeLevelId}
        onClose={() => setEditing(null)}
      />
      <PeriodSheet
        mode="create"
        period={null}
        open={creating}
        departmentId={departmentId}
        gradeLevelId={gradeLevelId}
        onClose={() => setCreating(false)}
      />
      <QuickSetupSheet
        open={quickSetup}
        departmentId={departmentId}
        gradeLevelId={gradeLevelId}
        onClose={() => setQuickSetup(false)}
      />
    </>
  );

  const actions = (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => setQuickSetup(true)}>
        ตั้งค่าด่วน
      </Button>
      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="h-3.5 w-3.5" />
        เพิ่มคาบ
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="กำลังโหลด">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <>
        <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีคาบเวลา" action={actions} />
        {sheets}
      </>
    );
  }

  return (
    <div className="space-y-3">
      {actions}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[40rem] table-fixed text-xs">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-2 py-2 font-medium">คาบ</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-2 font-medium">
                  {DAY_LABEL[d] ?? d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxPeriodNo }, (_, i) => i + 1).map((periodNo) => (
              <tr key={periodNo} className="border-t border-border align-top">
                <td className="px-2 py-2 text-center text-muted-foreground">{periodNo}</td>
                {days.map((day) => {
                  const p = periodAt.get(`${day}-${periodNo}`);
                  if (!p) return <td key={day} className="px-1 py-1" />;
                  return (
                    <td key={day} className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className={cn(
                          "tappable w-full rounded px-1.5 py-1.5 text-left",
                          p.period_type === "teaching" ? "bg-muted hover:bg-muted/70" : "bg-warning/15 hover:bg-warning/25",
                        )}
                      >
                        {p.period_type === "break" && <p className="truncate font-medium text-warning">{p.label}</p>}
                        <p className="text-[10px] text-muted-foreground">
                          {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}
                        </p>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sheets}
    </div>
  );
}

function PeriodSheet({
  mode,
  period,
  open,
  departmentId,
  gradeLevelId,
  onClose,
}: {
  mode: "create" | "edit";
  period: PeriodDefinition | null;
  open: boolean;
  departmentId: string;
  gradeLevelId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSavePeriodDefinition();
  const del = useDeletePeriodDefinition();

  const blank = (): PeriodDefinitionDraft => ({
    department_id: departmentId,
    grade_level_id: gradeLevelId,
    day_of_week: 1,
    period_no: 1,
    period_type: "teaching",
    label: "",
    start_time: "08:30",
    end_time: "09:20",
  });

  const [draft, setDraft] = useState<PeriodDefinitionDraft>(blank);

  useEffect(() => {
    if (!open) return;
    setDraft(
      period
        ? {
            department_id: period.department_id,
            grade_level_id: period.grade_level_id,
            day_of_week: period.day_of_week,
            period_no: period.period_no,
            period_type: period.period_type,
            label: period.label,
            start_time: period.start_time.slice(0, 5),
            end_time: period.end_time.slice(0, 5),
          }
        : blank(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.label.trim()) return;
    save.mutate(
      { id: period?.id, ...draft },
      {
        onSuccess: () => {
          toast("บันทึกสำเร็จ");
          onClose();
        },
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mode === "create" ? "เพิ่มคาบเวลา" : "แก้ไขคาบเวลา"}
      footer={
        period ? (
          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={() => del.mutate(period.id, { onSuccess: onClose })}
          >
            ลบคาบเวลา
          </Button>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="วัน">
            <Select
              value={draft.day_of_week}
              onChange={(e) => setDraft({ ...draft, day_of_week: Number(e.target.value) })}
            >
              {Object.entries(DAY_LABEL).map(([d, label]) => (
                <option key={d} value={d}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="คาบที่">
            <Input
              type="number"
              min={1}
              value={draft.period_no}
              onChange={(e) => setDraft({ ...draft, period_no: Number(e.target.value) })}
              required
            />
          </Field>
        </div>

        <Field label="ประเภท">
          <Select
            value={draft.period_type}
            onChange={(e) => setDraft({ ...draft, period_type: e.target.value as PeriodType })}
          >
            {(Object.keys(PERIOD_TYPE_LABEL) as PeriodType[]).map((t) => (
              <option key={t} value={t}>
                {PERIOD_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ชื่อคาบ">
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="เวลาเริ่ม">
            <Input
              type="time"
              value={draft.start_time}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
              required
            />
          </Field>
          <Field label="เวลาสิ้นสุด">
            <Input
              type="time"
              value={draft.end_time}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
              required
            />
          </Field>
        </div>

        <Button type="submit" className="w-full" disabled={!draft.label.trim() || save.isPending}>
          {save.isPending ? <Spinner className="h-3 w-3" /> : mode === "create" ? "เพิ่ม" : "บันทึก"}
        </Button>
      </form>
    </Sheet>
  );
}

const DEFAULT_DAYS = [1, 2, 3, 4, 5];

/** Bulk-generate a day's period grid from a few parameters instead of adding rows one at a time. */
function QuickSetupSheet({
  open,
  departmentId,
  gradeLevelId,
  onClose,
}: {
  open: boolean;
  departmentId: string;
  gradeLevelId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const generate = useGeneratePeriods();

  const [startTime, setStartTime] = useState("08:30");
  const [periodsPerDay, setPeriodsPerDay] = useState(8);
  const [minutesPerPeriod, setMinutesPerPeriod] = useState(50);
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const [recess, setRecess] = useState<PeriodBreakConfig>({
    enabled: false,
    afterPeriod: 2,
    minutes: 15,
    label: "พักเบรก",
  });
  const [lunch, setLunch] = useState<PeriodBreakConfig>({
    enabled: true,
    afterPeriod: 4,
    minutes: 60,
    label: "พักกลางวัน",
  });

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (days.length === 0) return;
    const rows = generatePeriods({
      startTime,
      periodsPerDay,
      minutesPerPeriod,
      recess,
      lunch,
      days,
    });
    const dayNames = days.map((d) => DAY_LABEL[d]).join(", ");
    if (!confirm(`จะลบคาบเดิมของ${gradeLevelId ? "ระดับชั้นนี้" : "ทั้งแผนก"}ในวัน ${dayNames} แล้วสร้างใหม่ ${rows.length} รายการ ยืนยัน?`)) {
      return;
    }
    generate.mutate(
      {
        departmentId,
        gradeLevelId,
        days,
        rows: rows.map((r) => ({ ...r, department_id: departmentId, grade_level_id: gradeLevelId })),
      },
      {
        onSuccess: () => {
          toast(`สร้างตารางคาบสำเร็จ (${rows.length} รายการ)`);
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "สร้างตารางไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="ตั้งค่าตารางคาบด่วน"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="quick-setup-periods" className="flex-1" disabled={days.length === 0 || generate.isPending}>
            {generate.isPending ? <Spinner className="h-3 w-3" /> : "สร้างตาราง"}
          </Button>
        </div>
      }
    >
      <form id="quick-setup-periods" className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="เวลาเริ่มคาบแรก">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field label="จำนวนคาบต่อวัน (ไม่รวมพัก)">
            <Input
              type="number"
              min={1}
              value={periodsPerDay}
              onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <Field label="นาทีต่อคาบ">
          <Input
            type="number"
            min={1}
            value={minutesPerPeriod}
            onChange={(e) => setMinutesPerPeriod(Number(e.target.value))}
            required
          />
        </Field>

        <Field label="วันที่ใช้ตารางนี้">
          <div className="flex flex-wrap gap-2">
            {Object.entries(DAY_LABEL).map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(Number(d))}
                className={cn(
                  "tappable rounded-full border px-3 py-1 text-xs",
                  days.includes(Number(d))
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <BreakConfigFields title="พักระหว่างเรียน" value={recess} onChange={setRecess} periodsPerDay={periodsPerDay} />
        <BreakConfigFields title="พักรับประทานอาหารกลางวัน" value={lunch} onChange={setLunch} periodsPerDay={periodsPerDay} />
      </form>
    </Sheet>
  );
}

function BreakConfigFields({
  title,
  value,
  onChange,
  periodsPerDay,
}: {
  title: string;
  value: PeriodBreakConfig;
  onChange: (v: PeriodBreakConfig) => void;
  periodsPerDay: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{title}</p>
        <Switch checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} size="sm" />
      </div>
      {value.enabled && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="หลังคาบที่">
            <Select
              value={value.afterPeriod}
              onChange={(e) => onChange({ ...value, afterPeriod: Number(e.target.value) })}
            >
              {Array.from({ length: periodsPerDay }, (_, i) => i + 1).map((n) => (
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
              value={value.minutes}
              onChange={(e) => onChange({ ...value, minutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="ชื่อ">
            <Input value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
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
