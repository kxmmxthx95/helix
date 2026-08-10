import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Pagination, Select, Spinner } from "@/components/ui";
import { useDepartments } from "@/hooks/useProfiles";
import { usePagination } from "@/hooks/usePagination";
import { useSubjects } from "@/hooks/useCurriculum";
import {
  DOMAIN_LABEL,
  useCohorts,
  useCurriculumSubjects,
  useDeleteCohort,
  useDeleteCurriculumSubject,
  useDeleteKgAssessmentTopic,
  useDeleteLearningUnit,
  useGradeLevels,
  useKgAcademicYears,
  useKgAssessmentTopics,
  useLearningUnits,
  useSaveCohort,
  useSaveCurriculumSubject,
  useSaveKgAssessmentTopic,
  useSaveLearningUnit,
  useSaveStudyPlan,
  useStudyPlans,
  type CohortDraft,
  type CurriculumSubjectDraft,
  type KgAssessmentTopicDraft,
  type LearningUnitDraft,
} from "@/hooks/useCurriculumStructure";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import type { CurriculumSubject, DevelopmentDomain, StudyPlan } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function Curriculum() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [pickedGradeLevel, setPickedGradeLevel] = useState("");
  const [pickedCohort, setPickedCohort] = useState("");
  const [kgAcademicYear, setKgAcademicYear] = useState<number | null>(null);
  const [addingKgYear, setAddingKgYear] = useState(false);

  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  const departmentId = orgWide ? pickedDept : me?.department_id ?? "";
  const department = departments.find((d) => d.id === departmentId);
  const isKg = department?.code === "KG";

  const { data: activeYear } = useActiveAcademicYear(departmentId || null);

  useEffect(() => {
    if (activeYear !== undefined && kgAcademicYear === null) setKgAcademicYear(activeYear);
  }, [activeYear, kgAcademicYear]);

  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const { data: cohorts = [] } = useCohorts(!isKg ? departmentId || null : null);
  const { data: kgYears = [] } = useKgAcademicYears(isKg ? gradeLevels.map((g) => g.id) : []);

  // Only years with real data (plus the current academic year) get a tab —
  // same "no phantom year" rule as curriculum_cohorts (grill decision, 2026-08-08).
  const kgYearTabs = useMemo(() => {
    const set = new Set(kgYears);
    if (activeYear !== undefined) set.add(activeYear);
    return [...set].sort((a, b) => b - a);
  }, [kgYears, activeYear]);

  useEffect(() => {
    if (gradeLevels.length > 0 && !gradeLevels.some((g) => g.id === pickedGradeLevel)) {
      setPickedGradeLevel(gradeLevels[0]!.id);
    }
  }, [gradeLevels, pickedGradeLevel]);

  useEffect(() => {
    setPickedCohort("");
  }, [departmentId]);

  if (!me || (!orgWide && !me.roles.includes("dept_head"))) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์ดูโครงสร้างหลักสูตร</Card>;
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
                setPickedGradeLevel("");
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

      {isKg && kgAcademicYear !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-8 max-w-full gap-1 overflow-x-auto rounded-lg border border-border p-0.5">
            {kgYearTabs.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setKgAcademicYear(y)}
                className={cn(
                  "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                  kgAcademicYear === y
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                ปี {y}
              </button>
            ))}
          </div>
          {mayEdit && !addingKgYear && (
            <Button variant="ghost" size="sm" className="text-white hover:bg-transparent hover:text-white" onClick={() => setAddingKgYear(true)}>
              <Plus className="h-3.5 w-3.5" />
              ปีการศึกษา
            </Button>
          )}
          {mayEdit && addingKgYear && (
            <Input
              type="number"
              autoFocus
              className="w-24"
              placeholder="พ.ศ."
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={(e) => {
                const y = Number(e.target.value);
                setAddingKgYear(false);
                if (y) setKgAcademicYear(y);
              }}
            />
          )}
        </div>
      )}

      {!isKg && departmentId && (
        <CohortPicker
          cohorts={cohorts}
          pickedCohort={pickedCohort}
          onPick={setPickedCohort}
          departmentId={departmentId}
          gradeLevels={gradeLevels}
          mayEdit={mayEdit}
          defaultEntryYear={activeYear ?? new Date().getFullYear() + 543}
        />
      )}

      {(isKg || pickedCohort) && gradeLevels.length > 0 && (
        <div className="flex h-8 w-full gap-1 overflow-x-auto rounded-lg border border-border p-0.5">
          {gradeLevels.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setPickedGradeLevel(g.id)}
              className={cn(
                "inline-flex h-full min-w-0 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors",
                pickedGradeLevel === g.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="truncate">{g.name}</span>
            </button>
          ))}
        </div>
      )}

      {!isKg && departmentId && gradeLevels.length > 0 && !pickedCohort && (
        <Card className="py-10 text-center text-sm text-muted-foreground">เลือกหรือสร้างรุ่นก่อนจัดวิชา</Card>
      )}

      {departmentId && gradeLevels.length === 0 && (
        <Card className="py-10 text-center text-sm text-muted-foreground">ไม่พบระดับชั้นของแผนกนี้</Card>
      )}

      {isKg && pickedGradeLevel && kgAcademicYear !== null && (
        <KgPanel key={pickedGradeLevel} gradeLevelId={pickedGradeLevel} academicYear={kgAcademicYear} mayEdit={mayEdit} />
      )}

      {!isKg && pickedGradeLevel && pickedCohort && department && (
        <SubjectPanel
          key={`${pickedGradeLevel}-${pickedCohort}`}
          gradeLevelId={pickedGradeLevel}
          cohortId={pickedCohort}
          departmentId={department.id}
          departmentCode={department.code}
          gradeLevels={gradeLevels}
          mayEdit={mayEdit}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------- curriculum_cohorts

function CohortPicker({
  cohorts,
  pickedCohort,
  onPick,
  departmentId,
  gradeLevels,
  mayEdit,
  defaultEntryYear,
}: {
  cohorts: { id: string; name: string; entry_year: number }[];
  pickedCohort: string;
  onPick: (id: string) => void;
  departmentId: string;
  gradeLevels: { id: string; name: string; code: string; is_entry_point: boolean }[];
  mayEdit: boolean;
  defaultEntryYear: number;
}) {
  const [creating, setCreating] = useState(false);
  const [pickedYear, setPickedYear] = useState(defaultEntryYear);
  const [addingYear, setAddingYear] = useState(false);
  const save = useSaveCohort();
  const del = useDeleteCohort();

  // Jump to the most recent year that actually has a cohort, once — so
  // reopening this page after creating a cohort for a non-current year
  // (via "ปีอื่น") lands on it instead of defaulting back to the current
  // academic year. Only runs before the user picks a year themselves.
  const userPickedYear = useRef(false);
  useEffect(() => {
    if (userPickedYear.current || cohorts.length === 0) return;
    setPickedYear(Math.max(...cohorts.map((c) => c.entry_year)));
  }, [cohorts]);

  // Only years with a real cohort (plus the current academic year) are
  // shown — a typed-but-not-yet-created year never gets its own tab, so
  // there's nothing to look "lost" on refresh (grill decision, 2026-08-08).
  const years = useMemo(() => {
    const set = new Set(cohorts.map((c) => c.entry_year));
    set.add(defaultEntryYear);
    return [...set].sort((a, b) => b - a);
  }, [cohorts, defaultEntryYear]);

  const cohortsInYear = cohorts.filter((c) => c.entry_year === pickedYear);

  function closeCreating() {
    setCreating(false);
    if (!cohorts.some((c) => c.entry_year === pickedYear) && pickedYear !== defaultEntryYear) {
      setPickedYear(defaultEntryYear);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-8 max-w-full gap-1 overflow-x-auto rounded-lg border border-border p-0.5">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                userPickedYear.current = true;
                setPickedYear(y);
                if (pickedCohort && !cohorts.some((c) => c.id === pickedCohort && c.entry_year === y)) onPick("");
              }}
              className={cn(
                "inline-flex h-full shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors",
                pickedYear === y
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              ปี {y}
            </button>
          ))}
        </div>
        {mayEdit && !addingYear && (
          <Button variant="ghost" size="sm" className="text-white hover:bg-transparent hover:text-white" onClick={() => setAddingYear(true)}>
            <Plus className="h-3.5 w-3.5" />
            ปีการศึกษา
          </Button>
        )}
        {mayEdit && addingYear && (
          <Input
            type="number"
            autoFocus
            className="w-24"
            placeholder="พ.ศ."
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={(e) => {
              const y = Number(e.target.value);
              setAddingYear(false);
              if (!y) return;
              // Go straight to the create form for year y instead of
              // parking on an empty tab — nothing is real until saved.
              userPickedYear.current = true;
              setPickedYear(y);
              if (pickedCohort && !cohorts.some((c) => c.id === pickedCohort && c.entry_year === y)) onPick("");
              setCreating(true);
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {cohortsInYear.map((c) => (
          <div key={c.id} className="group relative">
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                pickedCohort === c.id
                  ? "border-foreground bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {c.name}
            </button>
            {mayEdit && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`ลบรุ่น "${c.name}"?`)) {
                    del.mutate(c.id, {
                      onSuccess: () => {
                        if (pickedCohort === c.id) onPick("");
                      },
                    });
                  }
                }}
                disabled={del.isPending}
                className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/90 group-hover:flex disabled:opacity-50"
                aria-label="ลบ"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {mayEdit && (
          <Button variant="ghost" size="sm" className="text-white hover:bg-transparent hover:text-white" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            สร้างหลักสูตร
          </Button>
        )}
      </div>

      <Sheet
        open={creating}
        onOpenChange={(open) => !open && closeCreating()}
        title="สร้างหลักสูตร"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={closeCreating}>
              ยกเลิก
            </Button>
            <Button type="submit" form="create-cohort" className="flex-1" disabled={save.isPending}>
              {save.isPending ? <Spinner className="h-3 w-3" /> : "สร้างรุ่น"}
            </Button>
          </div>
        }
      >
        <CreateCohortForm
          departmentId={departmentId}
          gradeLevels={gradeLevels}
          entryYear={pickedYear}
          onSubmit={(draft, resetForm) => {
            save.mutate(draft, {
              onSuccess: () => {
                userPickedYear.current = true;
                resetForm();
                setCreating(false);
              },
              onError: (err) =>
                alert(
                  err.message.includes("duplicate")
                    ? `มีหลักสูตรระดับชั้นนี้ของปี ${draft.entry_year} อยู่แล้ว`
                    : `สร้างไม่สำเร็จ: ${err.message}`,
                ),
            });
          }}
        />
      </Sheet>
    </div>
  );
}

function CreateCohortForm({
  departmentId,
  gradeLevels,
  entryYear,
  onSubmit,
}: {
  departmentId: string;
  gradeLevels: { id: string; name: string; code: string; is_entry_point: boolean }[];
  entryYear: number;
  onSubmit: (draft: CohortDraft, resetForm: () => void) => void;
}) {
  const [entryGradeLevelId, setEntryGradeLevelId] = useState("");
  const [name, setName] = useState("");

  function reset() {
    setEntryGradeLevelId("");
    setName("");
  }

  return (
    <form
      id="create-cohort"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!entryGradeLevelId || !name.trim()) return;
        onSubmit(
          {
            department_id: departmentId,
            entry_grade_level_id: entryGradeLevelId,
            entry_year: entryYear,
            name: name.trim(),
          },
          reset,
        );
      }}
    >
      <Field label="ปีการศึกษาที่เข้า (พ.ศ.)">
        <p className="flex h-8 items-center text-sm font-medium">{entryYear}</p>
      </Field>

      <Field label="ระดับชั้นที่เข้า (จุดเริ่มรุ่น)">
        <Select value={entryGradeLevelId} onChange={(e) => setEntryGradeLevelId(e.target.value)} required>
          <option value="">เลือกจุดเริ่มต้น</option>
          {gradeLevels
            .filter((g) => g.is_entry_point)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </Select>
      </Field>

      <Field label="ชื่อหลักสูตร">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น มัธยมต้น รุ่นปี 2569"
          required
        />
      </Field>
    </form>
  );
}

// ------------------------------------------------------------ SEC / PRI

const TERM_LABEL: Record<number, string> = { 1: "ภาคเรียน 1", 2: "ภาคเรียน 2" };

function SubjectPanel({
  gradeLevelId,
  cohortId,
  departmentId,
  departmentCode,
  gradeLevels,
  mayEdit,
}: {
  gradeLevelId: string;
  cohortId: string;
  departmentId: string;
  departmentCode: string;
  gradeLevels: { id: string; name: string }[];
  mayEdit: boolean;
}) {
  const splitsByTerm = departmentCode === "SEC";
  const [term, setTerm] = useState<1 | 2>(1);
  const [adding, setAdding] = useState(false);

  const { data: rows, isLoading } = useCurriculumSubjects(gradeLevelId, cohortId);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: studyPlans = [] } = useStudyPlans();
  const del = useDeleteCurriculumSubject();

  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, `${s.code} · ${s.name_th}`])), [subjects]);
  const activeSubjects = useMemo(() => subjects.filter((s) => s.is_active), [subjects]);

  const visible = (rows ?? []).filter((r) => !splitsByTerm || r.term === term);
  // Core = shared by every track (study_plan_id null); Track = specific to one study plan.
  const coreRows = visible.filter((r) => r.study_plan_id === null);
  const trackGroups = studyPlans
    .map((p) => ({ plan: p, rows: visible.filter((r) => r.study_plan_id === p.id) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-3">
      {(splitsByTerm || mayEdit) && (
        <div className="flex items-center gap-2">
          {mayEdit && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มวิชา
            </Button>
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
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <Card className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีวิชาในโครงสร้างนี้</Card>
      )}

      {coreRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">วิชาแกนบังคับ (Core)</p>
          <SubjectTable
            rows={coreRows}
            subjectName={subjectName}
            planLabel="Core"
            mayEdit={mayEdit}
            onDelete={(id) => del.mutate(id)}
          />
        </div>
      )}

      {trackGroups.map(({ plan, rows }) => (
        <div key={plan.id} className="space-y-2">
          <p className="text-sm font-medium">{plan.name} (Track)</p>
          <SubjectTable
            rows={rows}
            subjectName={subjectName}
            planLabel={plan.name}
            mayEdit={mayEdit}
            onDelete={(id) => del.mutate(id)}
          />
        </div>
      ))}

      <AddCurriculumSubjectSheet
        open={adding}
        onClose={() => setAdding(false)}
        gradeLevelId={gradeLevelId}
        cohortId={cohortId}
        term={splitsByTerm ? term : null}
        subjects={activeSubjects}
        studyPlans={studyPlans}
        gradeLevels={gradeLevels}
        showStudyPlan
      />
    </div>
  );
}

function SubjectTable({
  rows,
  subjectName,
  planLabel,
  mayEdit,
  onDelete,
}: {
  rows: CurriculumSubject[];
  subjectName: Map<string, string>;
  planLabel: string;
  mayEdit: boolean;
  onDelete: (id: string) => void;
}) {
  const { page, setPage, pageCount, pageRows } = usePagination(rows, [rows.length]);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[28rem] text-xs">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">วิชา</th>
              <th className="px-3 py-2 font-medium">แผน</th>
              <th className="px-3 py-2 font-medium">สัดส่วนคะแนน</th>
              {mayEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="h-[40px] border-t border-border">
                <td className="px-3 py-0 font-medium">{subjectName.get(row.subject_id) ?? "—"}</td>
                <td className="px-3 py-0">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      row.study_plan_id === null
                        ? "bg-foreground/10 text-foreground"
                        : "bg-accent/10 text-accent",
                    )}
                  >
                    {planLabel}
                  </span>
                </td>
                <td className="px-3 py-0 text-muted-foreground">
                  {row.score_collect_pct !== null
                    ? `เก็บ ${row.score_collect_pct} : สอบ ${row.score_exam_pct}`
                    : "ค่า default แผนก"}
                </td>
                {mayEdit && (
                  <td className="px-3 py-0 text-right">
                    <Button variant="ghost" size="sm" onClick={() => onDelete(row.id)}>
                      ลบ
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}

function AddCurriculumSubjectSheet({
  open,
  onClose,
  gradeLevelId,
  cohortId,
  term,
  subjects,
  studyPlans,
  gradeLevels,
  showStudyPlan,
}: {
  open: boolean;
  onClose: () => void;
  gradeLevelId: string;
  cohortId: string;
  term: number | null;
  subjects: {
    id: string;
    code: string;
    name_th: string;
    suggested_grade_level_id: string | null;
    suggested_term: number | null;
  }[];
  studyPlans: { id: string; code: string; name: string }[];
  gradeLevels: { id: string; name: string }[];
  showStudyPlan: boolean;
}) {
  const save = useSaveCurriculumSubject();
  const [subjectId, setSubjectId] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [studyPlanId, setStudyPlanId] = useState("");
  const [collectPct, setCollectPct] = useState("");
  const [addingPlan, setAddingPlan] = useState(false);

  const gradeLevelName = useMemo(() => new Map(gradeLevels.map((g) => [g.id, g.name])), [gradeLevels]);
  const selectedSubject = subjects.find((s) => s.id === subjectId);

  const filteredSubjects = useMemo(() => {
    const term = subjectSearch.trim().toLowerCase();
    if (!term) return subjects;
    return subjects.filter(
      (s) => s.code.toLowerCase().includes(term) || s.name_th.toLowerCase().includes(term),
    );
  }, [subjects, subjectSearch]);

  function close() {
    setSubjectId("");
    setSubjectSearch("");
    setStudyPlanId("");
    setCollectPct("");
    setAddingPlan(false);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId) return;
    const draft: CurriculumSubjectDraft = {
      subject_id: subjectId,
      grade_level_id: gradeLevelId,
      study_plan_id: studyPlanId || null,
      term,
      cohort_id: cohortId,
      score_collect_pct: collectPct === "" ? null : Number(collectPct),
      score_exam_pct: collectPct === "" ? null : 100 - Number(collectPct),
    };
    save.mutate(draft);
    close();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title="เพิ่มวิชาเข้าโครงสร้างหลักสูตร"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>
            ยกเลิก
          </Button>
          <Button type="submit" form="add-curriculum-subject" className="flex-1" disabled={save.isPending}>
            {save.isPending ? <Spinner className="h-3 w-3" /> : "เพิ่ม"}
          </Button>
        </div>
      }
    >
      <form id="add-curriculum-subject" onSubmit={submit} className="space-y-4">
        <Field label="รายวิชา">
          <div className="space-y-1.5">
            <Input
              type="search"
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              placeholder="ค้นหารหัสหรือชื่อวิชา..."
            />
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              <option value="">เลือกวิชา ({filteredSubjects.length})</option>
              {filteredSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name_th}
                </option>
              ))}
            </Select>
            {selectedSubject && (selectedSubject.suggested_grade_level_id || selectedSubject.suggested_term) && (
              <p className="text-xs text-muted-foreground">
                แนะนำ:{" "}
                {selectedSubject.suggested_grade_level_id
                  ? gradeLevelName.get(selectedSubject.suggested_grade_level_id) ?? "—"
                  : "ไม่ระบุระดับชั้น"}
                {selectedSubject.suggested_term ? ` เทอม ${selectedSubject.suggested_term}` : ""}
              </p>
            )}
          </div>
        </Field>

        {showStudyPlan && !addingPlan && (
          <Field label="แผนการเรียน">
            <div className="flex gap-2">
              <Select
                value={studyPlanId}
                onChange={(e) => setStudyPlanId(e.target.value)}
                className="flex-1"
              >
                <option value="">วิชาแกนบังคับ (Core — ทุกแผน)</option>
                {studyPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setAddingPlan(true)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </Field>
        )}

        {showStudyPlan && addingPlan && (
          <NewStudyPlanField
            onCreated={(plan) => {
              setStudyPlanId(plan.id);
              setAddingPlan(false);
            }}
            onCancel={() => setAddingPlan(false)}
          />
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">สัดส่วนคะแนนเก็บ : สอบ</p>
          <p className="text-xs text-muted-foreground">เว้นว่างทั้งคู่เพื่อใช้ค่า default ของแผนก</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="เก็บ (%)">
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="default แผนก"
                value={collectPct}
                onChange={(e) => setCollectPct(e.target.value)}
              />
            </Field>
            <Field label="สอบ (%)">
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="default แผนก"
                value={collectPct === "" ? "" : 100 - Number(collectPct)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCollectPct(raw === "" ? "" : String(100 - Number(raw)));
                }}
              />
            </Field>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

/** Inline "+ เพิ่มแผนการเรียนใหม่" — study_plans has no dedicated admin page, just this one entry point. */
function NewStudyPlanField({
  onCreated,
  onCancel,
}: {
  onCreated: (plan: StudyPlan) => void;
  onCancel: () => void;
}) {
  const save = useSaveStudyPlan();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  return (
    <Field label="เพิ่มแผนการเรียนใหม่">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="รหัส เช่น sci-math" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input placeholder="ชื่อ เช่น วิทย์-คณิต" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={!code.trim() || !name.trim() || save.isPending}
            onClick={() => save.mutate({ code: code.trim(), name: name.trim() }, { onSuccess: onCreated })}
          >
            {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกแผน"}
          </Button>
        </div>
      </div>
    </Field>
  );
}

// ------------------------------------------------------------------- KG

function KgPanel({
  gradeLevelId,
  academicYear,
  mayEdit,
}: {
  gradeLevelId: string;
  academicYear: number;
  mayEdit: boolean;
}) {
  const { data: units, isLoading: unitsLoading } = useLearningUnits(gradeLevelId, academicYear);
  const { data: topics, isLoading: topicsLoading } = useKgAssessmentTopics(gradeLevelId, academicYear);
  const saveUnit = useSaveLearningUnit();
  const deleteUnit = useDeleteLearningUnit();
  const saveTopic = useSaveKgAssessmentTopic();
  const deleteTopic = useDeleteKgAssessmentTopic();

  const [addingUnit, setAddingUnit] = useState(false);
  const [addingTopicDomain, setAddingTopicDomain] = useState<DevelopmentDomain | null>(null);

  const topicsByDomain = useMemo(() => {
    const map = new Map<DevelopmentDomain, typeof topics>();
    for (const t of topics ?? []) map.set(t.domain, [...(map.get(t.domain) ?? []), t]);
    return map;
  }, [topics]);

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">หน่วยการเรียนรู้</h3>
          {mayEdit && (
            <Button variant="outline" size="sm" onClick={() => setAddingUnit(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มหน่วย
            </Button>
          )}
        </div>

        {unitsLoading && <Spinner className="h-3 w-3 text-muted-foreground" />}
        {!unitsLoading && (units ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">ยังไม่มีหน่วยการเรียนรู้</p>
        )}
        {(units ?? []).length > 0 && (
          <ul className="divide-y divide-border">
            {units!.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {u.sort_order}. {u.name_th}
                </span>
                {mayEdit && (
                  <Button variant="ghost" size="sm" onClick={() => deleteUnit.mutate(u.id)}>
                    ลบ
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <h3 className="text-lg font-semibold">หัวข้อการประเมินพัฒนาการ</h3>
        {topicsLoading && <Spinner className="h-3 w-3 text-muted-foreground" />}

        {(Object.keys(DOMAIN_LABEL) as DevelopmentDomain[]).map((domain) => (
          <div key={domain} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{DOMAIN_LABEL[domain]}</p>
              {mayEdit && (
                <Button variant="ghost" size="sm" onClick={() => setAddingTopicDomain(domain)}>
                  <Plus className="h-3.5 w-3.5" />
                  เพิ่มหัวข้อ
                </Button>
              )}
            </div>
            {(topicsByDomain.get(domain) ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">ยังไม่มีหัวข้อ</p>
            )}
            <ul className="divide-y divide-border">
              {(topicsByDomain.get(domain) ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>{t.name_th}</span>
                  {mayEdit && (
                    <Button variant="ghost" size="sm" onClick={() => deleteTopic.mutate(t.id)}>
                      ลบ
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      <Sheet
        open={addingUnit}
        onOpenChange={(o) => !o && setAddingUnit(false)}
        title="เพิ่มหน่วยการเรียนรู้"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setAddingUnit(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" form="add-unit" className="flex-1">
              เพิ่ม
            </Button>
          </div>
        }
      >
        <UnitForm
          gradeLevelId={gradeLevelId}
          academicYear={academicYear}
          nextSortOrder={(units?.length ?? 0) + 1}
          onSubmit={(draft) => {
            saveUnit.mutate(draft);
            setAddingUnit(false);
          }}
        />
      </Sheet>

      <Sheet
        open={addingTopicDomain !== null}
        onOpenChange={(o) => !o && setAddingTopicDomain(null)}
        title={`เพิ่มหัวข้อประเมิน — ${addingTopicDomain ? DOMAIN_LABEL[addingTopicDomain] : ""}`}
        footer={
          addingTopicDomain ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddingTopicDomain(null)}>
                ยกเลิก
              </Button>
              <Button type="submit" form="add-topic" className="flex-1">
                เพิ่ม
              </Button>
            </div>
          ) : undefined
        }
      >
        {addingTopicDomain && (
          <TopicForm
            gradeLevelId={gradeLevelId}
            academicYear={academicYear}
            domain={addingTopicDomain}
            nextSortOrder={(topicsByDomain.get(addingTopicDomain)?.length ?? 0) + 1}
            onSubmit={(draft) => {
              saveTopic.mutate(draft);
              setAddingTopicDomain(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function UnitForm({
  gradeLevelId,
  academicYear,
  nextSortOrder,
  onSubmit,
}: {
  gradeLevelId: string;
  academicYear: number;
  nextSortOrder: number;
  onSubmit: (draft: LearningUnitDraft) => void;
}) {
  const [nameTh, setNameTh] = useState("");

  return (
    <form
      id="add-unit"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nameTh.trim()) return;
        onSubmit({
          grade_level_id: gradeLevelId,
          academic_year: academicYear,
          name_th: nameTh.trim(),
          name_en: null,
          sort_order: nextSortOrder,
        });
      }}
    >
      <Field label="ชื่อหน่วยการเรียนรู้">
        <Input value={nameTh} onChange={(e) => setNameTh(e.target.value)} required autoFocus />
      </Field>
    </form>
  );
}

function TopicForm({
  gradeLevelId,
  academicYear,
  domain,
  nextSortOrder,
  onSubmit,
}: {
  gradeLevelId: string;
  academicYear: number;
  domain: DevelopmentDomain;
  nextSortOrder: number;
  onSubmit: (draft: KgAssessmentTopicDraft) => void;
}) {
  const [nameTh, setNameTh] = useState("");

  return (
    <form
      id="add-topic"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!nameTh.trim()) return;
        onSubmit({
          grade_level_id: gradeLevelId,
          domain,
          academic_year: academicYear,
          name_th: nameTh.trim(),
          sort_order: nextSortOrder,
        });
      }}
    >
      <Field label="หัวข้อการประเมิน">
        <Input value={nameTh} onChange={(e) => setNameTh(e.target.value)} required autoFocus />
      </Field>
    </form>
  );
}
