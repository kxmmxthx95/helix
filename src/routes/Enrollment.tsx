import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, EmptyState, Field, Select, Spinner } from "@/components/ui";
import {
  useCohortStudyPlans,
  useCohorts,
  useCurrentEnrollments,
  useDeleteEnrollment,
  useEnrollStudents,
  useGradeLevels,
  type EnrollmentDraft,
} from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useStudents } from "@/hooks/useStudents";
import { canManage, isOrgWide } from "@/lib/roles";

export function Enrollment() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [pickedCohort, setPickedCohort] = useState("");

  const departmentId = orgWide ? pickedDept : me?.department_id ?? "";
  const department = departments.find((d) => d.id === departmentId);
  const isKg = department?.code === "KG";

  const { data: cohorts = [] } = useCohorts(!isKg ? departmentId || null : null);

  const years = useMemo(
    () => [...new Set(cohorts.map((c) => c.entry_year))].sort((a, b) => b - a),
    [cohorts],
  );

  const cohortsForYear = useMemo(
    () => (pickedYear === null ? [] : cohorts.filter((c) => c.entry_year === pickedYear)),
    [cohorts, pickedYear],
  );

  useEffect(() => {
    setPickedYear(null);
    setPickedCohort("");
  }, [departmentId]);

  useEffect(() => {
    if (pickedCohort && !cohortsForYear.some((c) => c.id === pickedCohort)) {
      setPickedCohort("");
    }
  }, [cohortsForYear, pickedCohort]);

  if (!me || (!orgWide && !me.roles.includes("dept_head"))) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์ลงทะเบียนนักเรียน</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {orgWide && departments.length > 0 && (
          <Select
            className="min-w-[10rem] flex-1"
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

        <Select
          className="min-w-[10rem] flex-1"
          value={pickedYear === null ? "" : String(pickedYear)}
          onChange={(e) => {
            setPickedYear(Number(e.target.value));
            setPickedCohort("");
          }}
          aria-label="ปีการศึกษา"
          placeholder="เลือกปีการศึกษา"
          disabled={!departmentId || isKg || years.length === 0}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              ปี {y}
            </option>
          ))}
        </Select>

        <Select
          className="min-w-[10rem] flex-1"
          value={pickedCohort}
          onChange={(e) => setPickedCohort(e.target.value)}
          aria-label="หลักสูตร"
          placeholder="เลือกหลักสูตร"
          disabled={pickedYear === null || isKg || cohortsForYear.length === 0}
        >
          {cohortsForYear.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {isKg && (
        <Card className="text-sm text-muted-foreground">
          แผนกอนุบาลไม่ใช้ระบบรุ่น — จัดชั้นนักเรียนที่หน้ารายชื่อนักเรียนได้เลย
        </Card>
      )}

      {!isKg && departmentId && cohorts.length === 0 && (
        <EmptyState
          title="ไม่พบข้อมูล"
          description="แผนกนี้ยังไม่มีรุ่นหลักสูตร — สร้างที่หน้าโครงสร้างหลักสูตรก่อน"
        />
      )}

      {!isKg && pickedCohort && (
        <CohortEnrollmentPanel
          cohortId={pickedCohort}
          entryGradeLevelId={cohorts.find((c) => c.id === pickedCohort)?.entry_grade_level_id ?? ""}
          entryYear={cohorts.find((c) => c.id === pickedCohort)?.entry_year ?? 0}
          departmentId={departmentId}
          mayEdit={mayEdit}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------- student_cohort_enrollments

function CohortEnrollmentPanel({
  cohortId,
  entryGradeLevelId,
  entryYear,
  departmentId,
  mayEdit,
}: {
  cohortId: string;
  entryGradeLevelId: string;
  entryYear: number;
  departmentId: string;
  mayEdit: boolean;
}) {
  const [assigning, setAssigning] = useState(false);
  const { data: enrollments = [] } = useCurrentEnrollments(cohortId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "" });
  const { data: studyPlans = [] } = useCohortStudyPlans(cohortId);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: activeYear } = useActiveAcademicYear(departmentId);
  const deleteEnrollment = useDeleteEnrollment();

  // Cohort's entry grade is fixed at creation; students actually advance a
  // grade each academic year. Shift by elapsed years so the mismatch check
  // compares against where this cohort's students should be *now*, not where
  // they started.
  const expectedGradeLevelId = useMemo(() => {
    const entryLevel = gradeLevels.find((g) => g.id === entryGradeLevelId);
    if (!entryLevel || activeYear === undefined) return entryGradeLevelId;
    const elapsed = activeYear - entryYear;
    const expected = gradeLevels.find((g) => g.sort_order === entryLevel.sort_order + elapsed);
    return expected?.id ?? entryGradeLevelId;
  }, [gradeLevels, activeYear, entryGradeLevelId, entryYear]);

  const studentName = useMemo(
    () => new Map(students.map((s) => [s.id, `${s.first_name} ${s.last_name}`])),
    [students],
  );
  const planName = useMemo(() => new Map(studyPlans.map((p) => [p.id, p.name])), [studyPlans]);
  const gradeLevelName = useMemo(() => new Map(gradeLevels.map((g) => [g.id, g.name])), [gradeLevels]);
  const alreadyEnrolled = useMemo(() => new Set(enrollments.map((e) => e.student_id)), [enrollments]);

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {enrollments.length === 0 ? (
        <div className="space-y-3">
          {mayEdit && (
            <div className="flex justify-end lg:hidden">
              <Button variant="outline" size="sm" onClick={() => setAssigning(true)}>
                <Plus className="h-3.5 w-3.5" />
                ลงทะเบียนนักเรียน
              </Button>
            </div>
          )}
          <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีนักเรียนลงทะเบียนรุ่นนี้" />
        </div>
      ) : (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">นักเรียนในรุ่นนี้ ({enrollments.length})</h3>
            {mayEdit && (
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setAssigning(true)}>
                <Plus className="h-3.5 w-3.5" />
                ลงทะเบียนนักเรียน
              </Button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto text-xs">
            {enrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div>{studentName.get(e.student_id) ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.study_plan_id ? planName.get(e.study_plan_id) ?? "—" : "—"}
                  </div>
                </div>
                {mayEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm(`ลบนักเรียน "${studentName.get(e.student_id)}" ออกจากรุ่นนี้?`)) {
                        deleteEnrollment.mutate(e.id);
                      }
                    }}
                    disabled={deleteEnrollment.isPending}
                  >
                    <X className="h-3 w-3" />
                    ลบ
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {mayEdit && (
        <Card className="hidden space-y-4 lg:block">
          <h3 className="text-lg font-semibold">ลงทะเบียนนักเรียนเข้าหลักสูตร</h3>
          <EnrollForm
            cohortId={cohortId}
            students={students}
            alreadyEnrolled={alreadyEnrolled}
            studyPlans={studyPlans}
            expectedGradeLevelId={expectedGradeLevelId}
            gradeLevelName={gradeLevelName}
          />
        </Card>
      )}

      <div className="lg:hidden">
        <EnrollStudentsSheet
          open={assigning}
          onClose={() => setAssigning(false)}
          cohortId={cohortId}
          students={students}
          alreadyEnrolled={alreadyEnrolled}
          studyPlans={studyPlans}
          expectedGradeLevelId={expectedGradeLevelId}
          gradeLevelName={gradeLevelName}
        />
      </div>
    </div>
  );
}

type EnrollFormProps = {
  cohortId: string;
  students: { id: string; student_code: string; first_name: string; last_name: string; grade_level_id: string | null }[];
  alreadyEnrolled: Set<string>;
  studyPlans: { id: string; name: string }[];
  expectedGradeLevelId: string;
  gradeLevelName: Map<string, string>;
  onDone?: () => void;
};

function EnrollForm({
  cohortId,
  students,
  alreadyEnrolled,
  studyPlans,
  expectedGradeLevelId,
  gradeLevelName,
  onDone,
}: EnrollFormProps) {
  const enroll = useEnrollStudents();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [studyPlanId, setStudyPlanId] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) return;
    const drafts: EnrollmentDraft[] = [...selected].map((student_id) => ({
      student_id,
      cohort_id: cohortId,
      study_plan_id: studyPlanId || null,
    }));
    enroll.mutate(drafts, {
      onSuccess: () => {
        setSelected(new Set());
        setStudyPlanId("");
        onDone?.();
      },
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {studyPlans.length > 0 && (
        <Field label="แผนการเรียน (ใช้กับทุกคนที่เลือก)">
          <Select value={studyPlanId} onChange={(e) => setStudyPlanId(e.target.value)}>
            <option value="">ไม่ระบุ</option>
            {studyPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {students.map((s) => {
          const gradeMismatch = expectedGradeLevelId && s.grade_level_id !== expectedGradeLevelId;
          return (
            <label
              key={s.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
            >
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="flex-1">
                {s.first_name} {s.last_name}{" "}
                <span className="text-muted-foreground">({s.student_code})</span>
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {s.grade_level_id ? gradeLevelName.get(s.grade_level_id) ?? "—" : "—"}
              </span>
              {gradeMismatch && (
                <span className="text-xs text-warning" title="ชั้นปัจจุบันไม่ตรงชั้นที่ควรอยู่ตอนนี้ของรุ่นนี้">
                  ⚠ ชั้นไม่ตรง
                </span>
              )}
              {alreadyEnrolled.has(s.id) && (
                <span className="text-xs text-muted-foreground">ลงทะเบียนแล้ว</span>
              )}
            </label>
          );
        })}
        {students.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">ไม่มีนักเรียนในแผนกนี้</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={selected.size === 0 || enroll.isPending}>
        {enroll.isPending ? <Spinner className="h-3 w-3" /> : `ลงทะเบียน ${selected.size} คน`}
      </Button>
    </form>
  );
}

function EnrollStudentsSheet({
  open,
  onClose,
  ...formProps
}: { open: boolean; onClose: () => void } & Omit<EnrollFormProps, "onDone">) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="ลงทะเบียนนักเรียนเข้าหลักสูตร">
      <EnrollForm {...formProps} onDone={onClose} />
    </Sheet>
  );
}
