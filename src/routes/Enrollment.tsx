import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Select, Spinner } from "@/components/ui";
import {
  useCohorts,
  useCurrentEnrollments,
  useDeleteEnrollment,
  useEnrollStudents,
  useGradeLevels,
  useStudyPlans,
  type EnrollmentDraft,
} from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useStudents } from "@/hooks/useStudents";
import type { StudentCohortEnrollment } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { gradeShortLabel } from "@/lib/gradeLevels";

export function Enrollment() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [pickedCohort, setPickedCohort] = useState("");
  const [enrollAllOpen, setEnrollAllOpen] = useState(false);

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
    setEnrollAllOpen(false);
  }, [departmentId]);

  useEffect(() => {
    if (pickedCohort && !cohortsForYear.some((c) => c.id === pickedCohort)) {
      setPickedCohort("");
    }
  }, [cohortsForYear, pickedCohort]);

  useEffect(() => {
    setEnrollAllOpen(false);
  }, [pickedCohort]);

  if (!me || (!orgWide && !me.roles.includes("dept_head"))) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์ลงทะเบียนนักเรียน</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {orgWide && departments.length > 0 && (
          <Select
            className="min-w-0 flex-1"
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
          className="min-w-0 flex-1"
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
          className="min-w-0 flex-1"
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

        {mayEdit && (
          <Button
            className="shrink-0"
            disabled={!pickedCohort}
            onClick={() => setEnrollAllOpen(true)}
          >
            ลงทะเบียนทั้งหมด
          </Button>
        )}
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

      {mayEdit && pickedCohort && (
        <EnrollAllSheet
          open={enrollAllOpen}
          onClose={() => setEnrollAllOpen(false)}
          cohortId={pickedCohort}
          departmentId={departmentId}
        />
      )}
    </div>
  );
}

function EnrollAllSheet({
  open,
  onClose,
  cohortId,
  departmentId,
}: {
  open: boolean;
  onClose: () => void;
  cohortId: string;
  departmentId: string;
}) {
  const toast = useToast();
  const enroll = useEnrollStudents();
  const { data: enrollments = [] } = useCurrentEnrollments(cohortId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "" });
  const { data: studyPlans = [] } = useStudyPlans();
  const [studyPlanId, setStudyPlanId] = useState("");
  const [planOverride, setPlanOverride] = useState<Record<string, string>>({});

  const pendingStudents = useMemo(() => {
    const enrolled = new Set(enrollments.map((e) => e.student_id));
    return students
      .filter((s) => !enrolled.has(s.id))
      .sort((a, b) => a.student_code.localeCompare(b.student_code, "th"));
  }, [students, enrollments]);
  const pendingIds = useMemo(() => pendingStudents.map((s) => s.id), [pendingStudents]);

  function close() {
    setStudyPlanId("");
    setPlanOverride({});
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingIds.length === 0) return;
    const drafts: EnrollmentDraft[] = pendingIds.map((student_id) => ({
      student_id,
      cohort_id: cohortId,
      study_plan_id: (planOverride[student_id] ?? studyPlanId) || null,
    }));
    enroll.mutate(drafts, {
      onSuccess: () => {
        toast(`ลงทะเบียนสำเร็จ ${drafts.length} คน`);
        close();
      },
      onError: (err) => toast(err instanceof Error ? err.message : "ลงทะเบียนไม่สำเร็จ", "error"),
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title="ลงทะเบียนทั้งหมด"
      description={
        pendingIds.length > 0
          ? `จะลงทะเบียนนักเรียนที่ยังไม่อยู่ในรุ่น ${pendingIds.length} คน`
          : "นักเรียนในแผนกนี้อยู่ในรุ่นครบแล้ว"
      }
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            form="enroll-all"
            className="flex-1"
            disabled={pendingIds.length === 0 || enroll.isPending}
          >
            {enroll.isPending ? <Spinner /> : `ลงทะเบียน ${pendingIds.length} คน`}
          </Button>
        </div>
      }
    >
      <form id="enroll-all" onSubmit={submit} className="space-y-4">
        <Field label="แผนการเรียน (ค่าเริ่มต้นสำหรับทุกคน)">
          <Select value={studyPlanId} onChange={(e) => setStudyPlanId(e.target.value)}>
            <option value="">ทั่วไป</option>
            {studyPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        {studyPlans.length > 0 && pendingStudents.length > 0 && (
          <Field label="แก้ไขเฉพาะราย (ถ้าไม่ตรงค่าเริ่มต้น)">
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
              {pendingStudents.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    {s.student_code} {s.first_name} {s.last_name}
                  </span>
                  <Select
                    className="h-7 w-36 shrink-0 px-1.5 text-[11px]"
                    aria-label={`แผนการเรียนของ ${s.first_name} ${s.last_name}`}
                    value={planOverride[s.id] ?? ""}
                    onChange={(e) =>
                      setPlanOverride((prev) => {
                        if (!e.target.value) {
                          const { [s.id]: _, ...rest } = prev;
                          return rest;
                        }
                        return { ...prev, [s.id]: e.target.value };
                      })
                    }
                  >
                    <option value="">(ใช้ค่าเริ่มต้น)</option>
                    {studyPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </Field>
        )}
      </form>
    </Sheet>
  );
}

function formatEnrolledDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
  const { data: enrollments = [] } = useCurrentEnrollments(cohortId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "" });
  const { data: studyPlans = [] } = useStudyPlans();
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: activeYear } = useActiveAcademicYear(departmentId);
  const enroll = useEnrollStudents();
  const deleteEnrollment = useDeleteEnrollment();
  const [pendingStudentId, setPendingStudentId] = useState<string | null>(null);
  const [planSelection, setPlanSelection] = useState<Record<string, string>>({});

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

  const planName = useMemo(() => new Map(studyPlans.map((p) => [p.id, p.name])), [studyPlans]);
  const gradeLevelName = useMemo(
    () => new Map(gradeLevels.map((g) => [g.id, gradeShortLabel(g.code)])),
    [gradeLevels],
  );
  const enrollmentByStudent = useMemo(() => {
    const map = new Map<string, StudentCohortEnrollment>();
    for (const e of enrollments) map.set(e.student_id, e);
    return map;
  }, [enrollments]);

  const rows = useMemo(() => {
    return [...students].sort((a, b) => {
      const aEnrolled = enrollmentByStudent.has(a.id) ? 1 : 0;
      const bEnrolled = enrollmentByStudent.has(b.id) ? 1 : 0;
      if (aEnrolled !== bEnrolled) return aEnrolled - bEnrolled; // not enrolled first
      return a.student_code.localeCompare(b.student_code, "th");
    });
  }, [students, enrollmentByStudent]);

  function enrollOne(studentId: string) {
    const draft: EnrollmentDraft = {
      student_id: studentId,
      cohort_id: cohortId,
      study_plan_id: planSelection[studentId] || null,
    };
    setPendingStudentId(studentId);
    enroll.mutate([draft], {
      onSettled: () => {
        setPendingStudentId(null);
        setPlanSelection((prev) => {
          const { [studentId]: _, ...rest } = prev;
          return rest;
        });
      },
    });
  }

  // Enrollment history is append-only (see useCurrentEnrollments) — changing
  // an already-enrolled student's track inserts a new row, the latest wins.
  function changeTrack(studentId: string, studyPlanId: string) {
    const draft: EnrollmentDraft = {
      student_id: studentId,
      cohort_id: cohortId,
      study_plan_id: studyPlanId || null,
    };
    setPendingStudentId(studentId);
    enroll.mutate([draft], {
      onSettled: () => setPendingStudentId(null),
    });
  }

  function removeOne(enrollment: StudentCohortEnrollment, label: string) {
    if (!confirm(`ลบนักเรียน "${label}" ออกจากรุ่นนี้?`)) return;
    setPendingStudentId(enrollment.student_id);
    deleteEnrollment.mutate(enrollment.id, {
      onSettled: () => setPendingStudentId(null),
    });
  }

  const busy = enroll.isPending || deleteEnrollment.isPending;

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนในแผนกนี้" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-xs">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">รหัส</th>
                <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                <th className="px-3 py-2 font-medium">ชั้น</th>
                <th className="px-3 py-2 font-medium">แผนการเรียน</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                {mayEdit && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const enrollment = enrollmentByStudent.get(s.id);
                const gradeMismatch =
                  !enrollment && expectedGradeLevelId && s.grade_level_id !== expectedGradeLevelId;
                const rowBusy = pendingStudentId === s.id;
                const name = `${s.first_name} ${s.last_name}`;

                return (
                  <tr key={s.id} className="h-[40px] border-t border-border">
                    <td className="px-3 py-0">{s.student_code}</td>
                    <td className="px-3 py-0 font-medium">{name}</td>
                    <td className="px-3 py-0 text-muted-foreground">
                      {s.grade_level_id ? gradeLevelName.get(s.grade_level_id) ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-0 text-muted-foreground">
                      {enrollment && !mayEdit ? (
                        enrollment.study_plan_id ? planName.get(enrollment.study_plan_id) ?? "—" : "—"
                      ) : mayEdit ? (
                        <Select
                          className="h-6 min-w-[7rem] px-1.5 text-[10px]"
                          aria-label={`แผนการเรียนของ ${name}`}
                          value={(enrollment ? enrollment.study_plan_id : planSelection[s.id]) ?? ""}
                          onChange={(e) =>
                            enrollment
                              ? changeTrack(s.id, e.target.value)
                              : setPlanSelection((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          disabled={rowBusy}
                        >
                          <option value="">ทั่วไป</option>
                          {studyPlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-0">
                      {enrollment ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">
                          ลงทะเบียนแล้ว · {formatEnrolledDate(enrollment.created_at)}
                        </span>
                      ) : gradeMismatch ? (
                        <span
                          className="text-warning"
                          title="ชั้นปัจจุบันไม่ตรงชั้นที่ควรอยู่ตอนนี้ของรุ่นนี้"
                        >
                          ชั้นไม่ตรง
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {mayEdit && (
                      <td className="px-3 py-0 text-right">
                        {enrollment ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-1.5 text-[10px]"
                            disabled={busy}
                            onClick={() => removeOne(enrollment, name)}
                          >
                            {rowBusy && deleteEnrollment.isPending ? (
                              <Spinner className="h-2.5 w-2.5" />
                            ) : (
                              <X className="h-2.5 w-2.5" />
                            )}
                            ลบ
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-6 px-1.5 text-[10px]"
                            disabled={busy}
                            onClick={() => enrollOne(s.id)}
                          >
                            {rowBusy && enroll.isPending ? (
                              <Spinner className="h-2.5 w-2.5" />
                            ) : (
                              "ลงทะเบียน"
                            )}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
