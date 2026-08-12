import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronBack, ChevronForward, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Pagination, Select, Spinner } from "@/components/ui";
import {
  useCohorts,
  useCurrentEnrollments,
  useDeleteEnrollment,
  useEnrollStudents,
  useGradeLevels,
  useStudyPlans,
  type EnrollmentDraft,
} from "@/hooks/useCurriculumStructure";
import { useFillPageSize } from "@/hooks/useFillPageSize";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useStudents } from "@/hooks/useStudents";
import type { StudentCohortEnrollment } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { gradeShortLabel } from "@/lib/gradeLevels";

function cohortExpectedGradeLevelId(
  gradeLevels: { id: string; sort_order: number }[],
  entryGradeLevelId: string,
  entryYear: number,
  activeYear: number | undefined,
): string | null {
  if (!entryGradeLevelId || activeYear === undefined) return null;
  const entryLevel = gradeLevels.find((g) => g.id === entryGradeLevelId);
  if (!entryLevel) return null;
  const elapsed = Math.max(0, activeYear - entryYear);
  return gradeLevels.find((g) => g.sort_order === entryLevel.sort_order + elapsed)?.id ?? entryGradeLevelId;
}

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
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          entryGradeLevelId={cohorts.find((c) => c.id === pickedCohort)?.entry_grade_level_id ?? ""}
          entryYear={cohorts.find((c) => c.id === pickedCohort)?.entry_year ?? 0}
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
  entryGradeLevelId,
  entryYear,
  departmentId,
}: {
  open: boolean;
  onClose: () => void;
  cohortId: string;
  entryGradeLevelId: string;
  entryYear: number;
  departmentId: string;
}) {
  const toast = useToast();
  const enroll = useEnrollStudents();
  const { data: enrollments = [] } = useCurrentEnrollments(cohortId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "" });
  const { data: studyPlans = [] } = useStudyPlans();
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: activeYear } = useActiveAcademicYear(departmentId);
  const [studyPlanId, setStudyPlanId] = useState("");
  const [planOverride, setPlanOverride] = useState<Record<string, string>>({});
  const [wide, setWide] = useState(false);

  const expectedGradeLevelId = useMemo(
    () => cohortExpectedGradeLevelId(gradeLevels, entryGradeLevelId, entryYear, activeYear),
    [gradeLevels, entryGradeLevelId, entryYear, activeYear],
  );

  const pendingStudents = useMemo(() => {
    const enrolled = new Set(enrollments.map((e) => e.student_id));
    return students
      .filter(
        (s) =>
          !enrolled.has(s.id) &&
          (!expectedGradeLevelId || s.grade_level_id === expectedGradeLevelId),
      )
      .sort((a, b) => a.student_code.localeCompare(b.student_code, "th"));
  }, [students, enrollments, expectedGradeLevelId]);
  const pendingIds = useMemo(() => pendingStudents.map((s) => s.id), [pendingStudents]);

  function close() {
    setStudyPlanId("");
    setPlanOverride({});
    setWide(false);
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
      wide={wide}
      headerEnd={
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={wide ? "ย่อ Drawer" : "ขยาย Drawer"}
          onClick={() => setWide((w) => !w)}
        >
          {wide ? <ChevronForward className="h-3 w-3" /> : <ChevronBack className="h-3 w-3" />}
        </Button>
      }
      description={
        pendingIds.length > 0
          ? `จะลงทะเบียนนักเรียนที่ยังไม่อยู่ในรุ่น ${pendingIds.length} คน`
          : "นักเรียนในแผนกนี้อยู่ในรุ่นครบแล้ว"
      }
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
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
      <form id="enroll-all" onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4">
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
          <div className="flex min-h-0 flex-1 flex-col gap-1">
            <span className="font-ui text-xs font-medium">แก้ไขเฉพาะราย (ถ้าไม่ตรงค่าเริ่มต้น)</span>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              <table className={wide ? "w-full min-w-[36rem] text-xs" : "w-full text-xs"}>
                <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">รหัส</th>
                    <th className="px-3 py-2 font-medium">รายชื่อ</th>
                    <th className="px-3 py-2 font-medium">แผนการเรียน</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingStudents.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{s.student_code}</td>
                      <td className="px-3 py-1.5 text-[10px] font-medium leading-tight">
                        <div>{s.first_name}</div>
                        <div>{s.last_name}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        <Select
                          className={wide ? "h-7 w-full min-w-[12rem] px-1.5 text-[11px]" : "h-7 w-full min-w-[7rem] px-1.5 text-[11px]"}
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

  const expectedGradeLevelId = useMemo(
    () => cohortExpectedGradeLevelId(gradeLevels, entryGradeLevelId, entryYear, activeYear),
    [gradeLevels, entryGradeLevelId, entryYear, activeYear],
  );

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
    return students
      .filter(
        (s) =>
          enrollmentByStudent.has(s.id) ||
          !expectedGradeLevelId ||
          s.grade_level_id === expectedGradeLevelId,
      )
      .sort((a, b) => {
        const aEnrolled = enrollmentByStudent.has(a.id) ? 1 : 0;
        const bEnrolled = enrollmentByStudent.has(b.id) ? 1 : 0;
        if (aEnrolled !== bEnrolled) return aEnrolled - bEnrolled; // not enrolled first
        return a.student_code.localeCompare(b.student_code, "th");
      });
  }, [students, enrollmentByStudent, expectedGradeLevelId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableReady = rows.length > 0;
  const pageSize = useFillPageSize(scrollRef, tableReady);
  const { page, setPage, pageCount, pageRows } = usePagination(
    rows,
    [cohortId, departmentId, expectedGradeLevelId, pageSize],
    pageSize,
  );

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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {rows.length === 0 ? (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนชั้นที่ตรงกับรุ่นนี้" />
      ) : (
        <>
          <div className="table-panel">
            <div ref={scrollRef} className="table-panel-scroll">
              <table className="w-full min-w-[40rem] text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                    <th className="px-3 py-2 font-medium">รายชื่อ</th>
                    <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                    <th className="px-3 py-2 font-medium">แผนการเรียน</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                    {mayEdit && <th className="px-3 py-2 font-medium" />}
                  </tr>
                </thead>
                <tbody>
              {pageRows.map((s) => {
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
                            variant="ghost"
                            size="icon"
                            aria-label="ลบ"
                            disabled={busy}
                            onClick={() => removeOne(enrollment, name)}
                          >
                            {rowBusy && deleteEnrollment.isPending ? (
                              <Spinner className="h-3.5 w-3.5" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
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
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}
    </div>
  );
}
