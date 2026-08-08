import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Select, Spinner } from "@/components/ui";
import {
  useAllGradeLevels,
  useCohorts,
  useCurrentEnrollments,
  useEnrollStudents,
  useStudyPlans,
  type EnrollmentDraft,
} from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useStudents } from "@/hooks/useStudents";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function Enrollment() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [pickedCohort, setPickedCohort] = useState("");

  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  useEffect(() => {
    setPickedCohort("");
  }, [pickedDept]);

  const departmentId = orgWide ? pickedDept : me?.department_id ?? "";
  const department = departments.find((d) => d.id === departmentId);
  const isKg = department?.code === "KG";

  const { data: cohorts = [] } = useCohorts(!isKg ? departmentId || null : null);

  if (!me || (!orgWide && !me.roles.includes("dept_head"))) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์ลงทะเบียนนักเรียน</Card>;
  }

  return (
    <div className="space-y-4">
      {orgWide && departments.length > 0 && (
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border p-1">
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setPickedDept(d.id)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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

      {isKg && (
        <Card className="text-sm text-muted-foreground">
          แผนกอนุบาลไม่ใช้ระบบรุ่น — จัดชั้นนักเรียนที่หน้ารายชื่อนักเรียนได้เลย
        </Card>
      )}

      {!isKg && departmentId && (
        <>
          {cohorts.length === 0 && (
            <Card className="py-10 text-center text-sm text-muted-foreground">
              แผนกนี้ยังไม่มีรุ่นหลักสูตร — สร้างที่หน้าโครงสร้างหลักสูตรก่อน
            </Card>
          )}

          {cohorts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {cohorts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPickedCohort(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    pickedCohort === c.id
                      ? "border-foreground bg-foreground/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {pickedCohort && (
            <CohortEnrollmentPanel
              cohortId={pickedCohort}
              entryGradeLevelId={cohorts.find((c) => c.id === pickedCohort)?.entry_grade_level_id ?? ""}
              departmentId={departmentId}
              mayEdit={mayEdit}
            />
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------- student_cohort_enrollments

function CohortEnrollmentPanel({
  cohortId,
  entryGradeLevelId,
  departmentId,
  mayEdit,
}: {
  cohortId: string;
  entryGradeLevelId: string;
  departmentId: string;
  mayEdit: boolean;
}) {
  const [assigning, setAssigning] = useState(false);
  const { data: enrollments = [] } = useCurrentEnrollments(cohortId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "" });
  const { data: studyPlans = [] } = useStudyPlans();
  const { data: allGradeLevels = [] } = useAllGradeLevels();

  const studentName = useMemo(
    () => new Map(students.map((s) => [s.id, `${s.first_name} ${s.last_name}`])),
    [students],
  );
  const planName = useMemo(() => new Map(studyPlans.map((p) => [p.id, p.name])), [studyPlans]);
  const entryGradeLevelName = useMemo(
    () => allGradeLevels.find((g) => g.id === entryGradeLevelId)?.name ?? "",
    [allGradeLevels, entryGradeLevelId],
  );

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">นักเรียนในรุ่นนี้ ({enrollments.length})</h3>
        {mayEdit && (
          <Button variant="outline" size="sm" onClick={() => setAssigning(true)}>
            <Plus className="h-3.5 w-3.5" />
            ลงทะเบียนนักเรียน
          </Button>
        )}
      </div>

      {enrollments.length === 0 && (
        <p className="text-sm text-muted-foreground">ยังไม่มีนักเรียนลงทะเบียนรุ่นนี้</p>
      )}
      {enrollments.length > 0 && (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
          {enrollments.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-1.5">
              <span>{studentName.get(e.student_id) ?? "—"}</span>
              <span className="text-muted-foreground">
                {e.study_plan_id ? planName.get(e.study_plan_id) ?? "—" : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <EnrollStudentsSheet
        open={assigning}
        onClose={() => setAssigning(false)}
        cohortId={cohortId}
        students={students}
        alreadyEnrolled={new Set(enrollments.map((e) => e.student_id))}
        studyPlans={studyPlans}
        entryGradeLevelId={entryGradeLevelId}
        entryGradeLevelName={entryGradeLevelName}
      />
    </Card>
  );
}

function EnrollStudentsSheet({
  open,
  onClose,
  cohortId,
  students,
  alreadyEnrolled,
  studyPlans,
  entryGradeLevelId,
  entryGradeLevelName,
}: {
  open: boolean;
  onClose: () => void;
  cohortId: string;
  students: { id: string; student_code: string; first_name: string; last_name: string; grade_level_id: string | null }[];
  alreadyEnrolled: Set<string>;
  studyPlans: { id: string; name: string }[];
  entryGradeLevelId: string;
  entryGradeLevelName: string;
}) {
  const enroll = useEnrollStudents();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [studyPlanId, setStudyPlanId] = useState("");

  function close() {
    setSelected(new Set());
    setStudyPlanId("");
    onClose();
  }

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
    enroll.mutate(drafts, { onSuccess: close });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} title="ลงทะเบียนนักเรียนเข้ารุ่น">
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

        {entryGradeLevelName && (
          <p className="text-xs text-muted-foreground">
            รุ่นนี้เข้าที่ {entryGradeLevelName} — คนที่ชั้นปัจจุบันไม่ตรงจะมีเครื่องหมาย ⚠ กำกับ (ยังลงทะเบียนได้ตามปกติ เผื่อเป็นนักเรียนย้ายเข้า)
          </p>
        )}

        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {students.map((s) => {
            const gradeMismatch = entryGradeLevelId && s.grade_level_id !== entryGradeLevelId;
            return (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="flex-1">
                  {s.first_name} {s.last_name}{" "}
                  <span className="text-muted-foreground">({s.student_code})</span>
                </span>
                {gradeMismatch && (
                  <span className="text-xs text-warning" title="ชั้นปัจจุบันไม่ตรงจุดเข้าของรุ่นนี้">
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

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>
            ยกเลิก
          </Button>
          <Button type="submit" className="flex-1" disabled={selected.size === 0 || enroll.isPending}>
            {enroll.isPending ? <Spinner className="h-3 w-3" /> : `ลงทะเบียน ${selected.size} คน`}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
