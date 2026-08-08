import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { useDepartments } from "@/hooks/useProfiles";
import { useSubjects } from "@/hooks/useCurriculum";
import {
  DOMAIN_LABEL,
  useCohorts,
  useCurriculumSubjects,
  useDeleteCurriculumSubject,
  useDeleteKgAssessmentTopic,
  useDeleteLearningUnit,
  useGradeLevels,
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
import { useSchoolSettings } from "@/hooks/useSettings";
import type { CurriculumSubject, DevelopmentDomain, StudyPlan } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function Curriculum() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const { data: schoolSettings } = useSchoolSettings();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [pickedGradeLevel, setPickedGradeLevel] = useState("");
  const [pickedCohort, setPickedCohort] = useState("");
  const [kgAcademicYear, setKgAcademicYear] = useState<number | null>(null);

  useEffect(() => {
    if (orgWide && !pickedDept && departments.length > 0) setPickedDept(departments[0]!.id);
  }, [orgWide, departments, pickedDept]);

  useEffect(() => {
    if (schoolSettings && kgAcademicYear === null) setKgAcademicYear(schoolSettings.academic_year);
  }, [schoolSettings, kgAcademicYear]);

  const departmentId = orgWide ? pickedDept : me?.department_id ?? "";
  const department = departments.find((d) => d.id === departmentId);
  const isKg = department?.code === "KG";

  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const { data: cohorts = [] } = useCohorts(!isKg ? departmentId || null : null);

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
      <div className="flex items-center justify-between gap-3">
        {isKg && kgAcademicYear !== null && (
          <div className="w-28 shrink-0">
            <Input
              type="number"
              value={kgAcademicYear}
              onChange={(e) => setKgAcademicYear(Number(e.target.value))}
              aria-label="ปีการศึกษา"
            />
          </div>
        )}
      </div>

      {orgWide && departments.length > 0 && (
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border p-1">
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setPickedDept(d.id);
                setPickedGradeLevel("");
              }}
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

      {!isKg && departmentId && (
        <CohortPicker
          cohorts={cohorts}
          pickedCohort={pickedCohort}
          onPick={setPickedCohort}
          departmentId={departmentId}
          gradeLevels={gradeLevels}
          mayEdit={mayEdit}
          defaultEntryYear={schoolSettings?.academic_year ?? new Date().getFullYear() + 543}
        />
      )}

      {(isKg || pickedCohort) && gradeLevels.length > 0 && (
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border p-1">
          {gradeLevels.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setPickedGradeLevel(g.id)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pickedGradeLevel === g.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {g.name}
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
          departmentCode={department.code}
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
  cohorts: { id: string; name: string }[];
  pickedCohort: string;
  onPick: (id: string) => void;
  departmentId: string;
  gradeLevels: { id: string; name: string }[];
  mayEdit: boolean;
  defaultEntryYear: number;
}) {
  const [creating, setCreating] = useState(false);
  const save = useSaveCohort();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {cohorts.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
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
        {mayEdit && (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            สร้างหลักสูตรรุ่นใหม่
          </Button>
        )}
      </div>

      <Sheet open={creating} onOpenChange={setCreating} title="สร้างหลักสูตรรุ่นใหม่">
        <CreateCohortForm
          departmentId={departmentId}
          gradeLevels={gradeLevels}
          defaultEntryYear={defaultEntryYear}
          onSubmit={(draft) => {
            save.mutate(draft, { onSuccess: () => setCreating(false) });
          }}
          onCancel={() => setCreating(false)}
          pending={save.isPending}
        />
      </Sheet>
    </div>
  );
}

function CreateCohortForm({
  departmentId,
  gradeLevels,
  defaultEntryYear,
  onSubmit,
  onCancel,
  pending,
}: {
  departmentId: string;
  gradeLevels: { id: string; name: string }[];
  defaultEntryYear: number;
  onSubmit: (draft: CohortDraft) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [entryGradeLevelId, setEntryGradeLevelId] = useState("");
  const [entryYear, setEntryYear] = useState(defaultEntryYear);
  const [name, setName] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!entryGradeLevelId || !name.trim()) return;
        onSubmit({
          department_id: departmentId,
          entry_grade_level_id: entryGradeLevelId,
          entry_year: entryYear,
          name: name.trim(),
        });
      }}
    >
      <Field label="ระดับชั้นที่เข้า (จุดเริ่มรุ่น)">
        <Select value={entryGradeLevelId} onChange={(e) => setEntryGradeLevelId(e.target.value)} required>
          <option value="">เลือกระดับชั้น</option>
          {gradeLevels.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="ปีการศึกษาที่เข้า (พ.ศ.)">
        <Input type="number" value={entryYear} onChange={(e) => setEntryYear(Number(e.target.value))} required />
      </Field>

      <Field label="ชื่อรุ่น">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น มัธยมต้น รุ่นปี 2569"
          required
        />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? <Spinner className="h-3 w-3" /> : "สร้างรุ่น"}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------ SEC / PRI

const TERM_LABEL: Record<number, string> = { 1: "เทอม 1", 2: "เทอม 2" };

function SubjectPanel({
  gradeLevelId,
  cohortId,
  departmentCode,
  mayEdit,
}: {
  gradeLevelId: string;
  cohortId: string;
  departmentCode: string;
  mayEdit: boolean;
}) {
  const splitsByTerm = departmentCode === "SEC";
  const [term, setTerm] = useState<1 | 2>(1);
  const [adding, setAdding] = useState(false);

  const { data: rows, isLoading } = useCurriculumSubjects(gradeLevelId, cohortId);
  const { data: subjects = [] } = useSubjects({ search: "", learningAreaId: "", subjectType: "", includeInactive: true });
  const { data: studyPlans = [] } = useStudyPlans();
  const del = useDeleteCurriculumSubject();

  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, `${s.code} · ${s.name_th}`])), [subjects]);

  const visible = (rows ?? []).filter((r) => !splitsByTerm || r.term === term);
  // Core = shared by every track (study_plan_id null); Track = specific to one study plan.
  const coreRows = visible.filter((r) => r.study_plan_id === null);
  const trackGroups = studyPlans
    .map((p) => ({ plan: p, rows: visible.filter((r) => r.study_plan_id === p.id) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-3">
      {splitsByTerm && (
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {[1, 2].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerm(t as 1 | 2)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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

      {mayEdit && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          เพิ่มวิชา
        </Button>
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
          <SubjectTable rows={coreRows} subjectName={subjectName} mayEdit={mayEdit} onDelete={(id) => del.mutate(id)} />
        </div>
      )}

      {trackGroups.map(({ plan, rows }) => (
        <div key={plan.id} className="space-y-2">
          <p className="text-sm font-medium">{plan.name} (Track)</p>
          <SubjectTable rows={rows} subjectName={subjectName} mayEdit={mayEdit} onDelete={(id) => del.mutate(id)} />
        </div>
      ))}

      <AddCurriculumSubjectSheet
        open={adding}
        onClose={() => setAdding(false)}
        gradeLevelId={gradeLevelId}
        cohortId={cohortId}
        term={splitsByTerm ? term : null}
        subjects={subjects}
        studyPlans={studyPlans}
        showStudyPlan={splitsByTerm}
      />
    </div>
  );
}

function SubjectTable({
  rows,
  subjectName,
  mayEdit,
  onDelete,
}: {
  rows: CurriculumSubject[];
  subjectName: Map<string, string>;
  mayEdit: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="bg-muted text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">วิชา</th>
            <th className="px-3 py-2 font-medium">สัดส่วนคะแนน</th>
            {mayEdit && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-3 py-3 font-medium">{subjectName.get(row.subject_id) ?? "—"}</td>
              <td className="px-3 py-3 text-muted-foreground">
                {row.score_collect_pct !== null
                  ? `เก็บ ${row.score_collect_pct} : สอบ ${row.score_exam_pct}`
                  : "ค่า default แผนก"}
              </td>
              {mayEdit && (
                <td className="px-3 py-3 text-right">
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
  showStudyPlan,
}: {
  open: boolean;
  onClose: () => void;
  gradeLevelId: string;
  cohortId: string;
  term: number | null;
  subjects: { id: string; code: string; name_th: string }[];
  studyPlans: { id: string; code: string; name: string }[];
  showStudyPlan: boolean;
}) {
  const save = useSaveCurriculumSubject();
  const [subjectId, setSubjectId] = useState("");
  const [studyPlanId, setStudyPlanId] = useState("");
  const [collectPct, setCollectPct] = useState("");
  const [addingPlan, setAddingPlan] = useState(false);

  function close() {
    setSubjectId("");
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
    <Sheet open={open} onOpenChange={(o) => !o && close()} title="เพิ่มวิชาเข้าโครงสร้างหลักสูตร">
      <form onSubmit={submit} className="space-y-4">
        <Field label="รายวิชา">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            <option value="">เลือกวิชา</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name_th}
              </option>
            ))}
          </Select>
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

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close}>
            ยกเลิก
          </Button>
          <Button type="submit" className="flex-1" disabled={save.isPending}>
            {save.isPending ? <Spinner className="h-3 w-3" /> : "เพิ่ม"}
          </Button>
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

      <Sheet open={addingUnit} onOpenChange={(o) => !o && setAddingUnit(false)} title="เพิ่มหน่วยการเรียนรู้">
        <UnitForm
          gradeLevelId={gradeLevelId}
          academicYear={academicYear}
          nextSortOrder={(units?.length ?? 0) + 1}
          onSubmit={(draft) => {
            saveUnit.mutate(draft);
            setAddingUnit(false);
          }}
          onCancel={() => setAddingUnit(false)}
        />
      </Sheet>

      <Sheet
        open={addingTopicDomain !== null}
        onOpenChange={(o) => !o && setAddingTopicDomain(null)}
        title={`เพิ่มหัวข้อประเมิน — ${addingTopicDomain ? DOMAIN_LABEL[addingTopicDomain] : ""}`}
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
            onCancel={() => setAddingTopicDomain(null)}
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
  onCancel,
}: {
  gradeLevelId: string;
  academicYear: number;
  nextSortOrder: number;
  onSubmit: (draft: LearningUnitDraft) => void;
  onCancel: () => void;
}) {
  const [nameTh, setNameTh] = useState("");

  return (
    <form
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
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" className="flex-1">
          เพิ่ม
        </Button>
      </div>
    </form>
  );
}

function TopicForm({
  gradeLevelId,
  academicYear,
  domain,
  nextSortOrder,
  onSubmit,
  onCancel,
}: {
  gradeLevelId: string;
  academicYear: number;
  domain: DevelopmentDomain;
  nextSortOrder: number;
  onSubmit: (draft: KgAssessmentTopicDraft) => void;
  onCancel: () => void;
}) {
  const [nameTh, setNameTh] = useState("");

  return (
    <form
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
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" className="flex-1">
          เพิ่ม
        </Button>
      </div>
    </form>
  );
}
