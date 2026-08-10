import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Card, EmptyState, Select, Spinner } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useDepartmentPeriods } from "@/hooks/usePeriodDefinitions";
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
import { profileFullName, type Classroom, type GradeLevel, type PeriodDefinition, type TeachingAssignment } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
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
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [term, setTerm] = useState<1 | 2>(1);
  const [view, setView] = useState<View>(mayEdit ? "classroom" : "teacher");
  const [classroomId, setClassroomId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  useEffect(() => {
    if (!teacherId && me?.id) setTeacherId(me.id);
  }, [teacherId, me?.id]);

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const department = departments.find((d) => d.id === departmentId);
  const splitsByTerm = department?.code === "SEC";

  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? new Date().getFullYear() + 543;
  const scheduleTerm = splitsByTerm ? term : null;

  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId || null);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const { data: teachers = [] } = useProfiles({ search: "", departmentId, role: "teacher", active: "true" });

  useEffect(() => {
    if (!classroomId && classrooms.length > 0) setClassroomId(classrooms[0]!.id);
  }, [classroomId, classrooms]);

  if (!me) return null;

  return (
    <div className="space-y-4">
      {orgWide && departments.length > 0 && (
        <Select
          className="w-auto min-w-[10rem]"
          value={pickedDept}
          onChange={(e) => setPickedDept(e.target.value)}
          aria-label="แผนก"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-8 gap-1 rounded-lg border border-border p-0.5">
          {(["classroom", "teacher"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                view === v
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {v === "classroom" ? "มุมมองห้องเรียน" : "มุมมองครู"}
            </button>
          ))}
        </div>

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

        {view === "classroom" ? (
          <Select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="h-8 w-auto">
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {gradeLevels.find((g) => g.id === c.grade_level_id)?.name ?? "—"}/{c.name}
              </option>
            ))}
          </Select>
        ) : (
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-8 w-auto">
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {profileFullName(t)}
              </option>
            ))}
          </Select>
        )}
      </div>

      {departmentId && view === "classroom" && classroomId && (
        <ClassroomTimetable
          departmentId={departmentId}
          classroomId={classroomId}
          academicYear={academicYear}
          term={scheduleTerm}
          mayEdit={mayEdit}
          classrooms={classrooms}
          gradeLevels={gradeLevels}
          teachers={teachers}
        />
      )}

      {departmentId && view === "teacher" && teacherId && (
        <TeacherTimetable
          departmentId={departmentId}
          teacherId={teacherId}
          academicYear={academicYear}
          term={scheduleTerm}
          mayEdit={mayEdit}
          classrooms={classrooms}
          gradeLevels={gradeLevels}
          teachers={teachers}
        />
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
}: {
  departmentId: string;
  classroomId: string;
  academicYear: number;
  term: number | null;
  mayEdit: boolean;
  classrooms: Classroom[];
  gradeLevels: GradeLevel[];
  teachers: ProfileRow[];
}) {
  const { data: periods = [], isLoading: loadingPeriods } = useDepartmentPeriods(departmentId);
  const { data: entries = [], isLoading: loadingEntries } = useClassroomSchedule(classroomId, academicYear, term);
  const { data: assignments = [] } = useDepartmentTeachingAssignments(departmentId, academicYear, term);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    subjectType: "",
    includeInactive: true,
  });

  const candidates = useMemo(
    () => assignments.filter((a) => a.classroom_id === classroomId),
    [assignments, classroomId],
  );

  return (
    <TimetableGrid
      periods={periods}
      entries={entries}
      candidates={candidates}
      mode="classroom"
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
    subjectType: "",
    includeInactive: true,
  });

  const candidates = useMemo(
    () => assignments.filter((a) => a.teacher_id === teacherId),
    [assignments, teacherId],
  );

  return (
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
    return (
      <Card className="flex justify-center py-12">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </Card>
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
    <div className="overflow-x-auto rounded-lg border border-border">
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
