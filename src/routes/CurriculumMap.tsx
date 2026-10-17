import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronDown, ChevronForward, ClipboardIcon, Plus, X } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Input, Select, Skeleton } from "@/components/ui";
import {
  useDeleteSubjectTopic,
  useLearningAreas,
  useSaveSubjectTopic,
  useSubjects,
  useSubjectTopics,
} from "@/hooks/useCurriculum";
import { useCohorts, useCurriculumSubjects, useGradeLevels, useStudyPlans } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import type { Subject, SubjectTopic } from "@/lib/database.types";
import { gradesInEntryPath } from "@/lib/gradeLevels";
import { canManageAcademic, isOrgWide } from "@/lib/roles";
import { SUBJECT_TYPE_LABEL } from "@/lib/subjectColor";
import { cn } from "@/lib/utils";

export function CurriculumMap() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManageAcademic(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [pickedCohort, setPickedCohort] = useState("");
  const [pickedGrade, setPickedGrade] = useState("");
  const [planId, setPlanId] = useState("");

  const departmentId = orgWide ? pickedDept : (me?.department_id ?? "");
  const isKg = departments.find((d) => d.id === departmentId)?.code === "KG";

  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const { data: cohorts = [] } = useCohorts(!isKg ? departmentId || null : null);

  // cohorts arrive newest first — default to the latest.
  const cohortId = cohorts.some((c) => c.id === pickedCohort) ? pickedCohort : (cohorts[0]?.id ?? "");
  const cohort = cohorts.find((c) => c.id === cohortId);
  const grades = useMemo(
    () => (cohort ? gradesInEntryPath(gradeLevels, cohort.entry_grade_level_id) : []),
    [gradeLevels, cohort],
  );
  const gradeId = grades.some((g) => g.id === pickedGrade) ? pickedGrade : (grades[0]?.id ?? "");

  useEffect(() => setPlanId(""), [cohortId, gradeId]);

  if (!me) return null;

  return (
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {orgWide && departments.length > 0 && (
          <Select
            className="w-auto min-w-[10rem]"
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
        {cohorts.length > 0 && (
          <Select
            className="w-auto min-w-[10rem]"
            value={cohortId}
            onChange={(e) => setPickedCohort(e.target.value)}
            aria-label="รุ่นหลักสูตร"
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูผังการเรียน" icon={ClipboardIcon} />
        </div>
      ) : isKg ? (
        <EmptyState title="ไม่รองรับระดับอนุบาล" description="ดูหัวข้อพัฒนาการของอนุบาลได้ที่เมนูหลักสูตร" />
      ) : !cohort ? (
        <EmptyState title="ไม่พบข้อมูล" description="ยังไม่มีรุ่นหลักสูตรในแผนกนี้" />
      ) : (
        <>
          <div className="flex w-full shrink-0 gap-0 overflow-x-auto border-b border-border" role="tablist">
            {grades.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={gradeId === g.id}
                onClick={() => setPickedGrade(g.id)}
                className={cn(
                  "inline-flex h-8 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
                  gradeId === g.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">{g.name}</span>
              </button>
            ))}
          </div>
          {gradeId && (
            <GradeMap
              key={`${cohortId}-${gradeId}`}
              departmentId={departmentId}
              cohortId={cohortId}
              gradeId={gradeId}
              planId={planId}
              onPlanChange={setPlanId}
              mayEdit={mayEdit}
            />
          )}
        </>
      )}
    </div>
  );
}

function GradeMap({
  departmentId,
  cohortId,
  gradeId,
  planId,
  onPlanChange,
  mayEdit,
}: {
  departmentId: string;
  cohortId: string;
  gradeId: string;
  planId: string;
  onPlanChange: (id: string) => void;
  mayEdit: boolean;
}) {
  const { data: rows = [], isLoading } = useCurriculumSubjects(gradeId, cohortId);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: learningAreas = [] } = useLearningAreas();
  const { data: studyPlans = [] } = useStudyPlans();

  const planIds = useMemo(() => [...new Set(rows.map((r) => r.study_plan_id).filter((x): x is string => !!x))], [rows]);
  const visible = rows.filter((r) => !planId || !r.study_plan_id || r.study_plan_id === planId);

  const entries = useMemo(
    () =>
      visible.flatMap((r) => {
        const subject = subjects.find((s) => s.id === r.subject_id);
        return subject ? [{ term: r.term, subject }] : [];
      }),
    [visible, subjects],
  );
  const { data: topics = [] } = useSubjectTopics(useMemo(() => [...new Set(entries.map((e) => e.subject.id))], [entries]));

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (entries.length === 0) return <EmptyState title="ไม่พบข้อมูล" description="ชั้นนี้ยังไม่มีรายวิชาในหลักสูตร" />;

  // term is null outside SEC → single group.
  const terms = [...new Set(entries.map((e) => e.term))].sort((a, b) => (a ?? 0) - (b ?? 0));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {planIds.length > 0 && (
        <Select
          className="w-auto min-w-[10rem] self-start"
          value={planId}
          onChange={(e) => onPlanChange(e.target.value)}
          aria-label="สายการเรียน"
          placeholder="ทุกสายการเรียน"
        >
          {planIds.map((id) => (
            <option key={id} value={id}>
              {studyPlans.find((p) => p.id === id)?.name ?? id}
            </option>
          ))}
        </Select>
      )}
      {terms.map((term) => {
        const inTerm = entries.filter((e) => e.term === term).map((e) => e.subject);
        const areaIds = [...new Set(inTerm.map((s) => s.learning_area_id))];
        return (
          <section key={term ?? "all"} className="flex flex-col gap-2">
            {term !== null && <h2 className="text-xs font-semibold">ภาคเรียน {term}</h2>}
            {areaIds.map((areaId) => (
              <div key={areaId} className="flex flex-col gap-1">
                <h3 className="text-[11px] font-medium text-muted-foreground">
                  {learningAreas.find((a) => a.id === areaId)?.name ?? "—"}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {inTerm
                    .filter((s) => s.learning_area_id === areaId)
                    .map((s) => (
                      <SubjectCard
                        key={s.id}
                        subject={s}
                        topics={topics.filter((t) => t.subject_id === s.id)}
                        mayEdit={mayEdit}
                      />
                    ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function SubjectCard({ subject, topics, mayEdit }: { subject: Subject; topics: SubjectTopic[]; mayEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const save = useSaveSubjectTopic();
  const del = useDeleteSubjectTopic();
  const toast = useToast();
  const Chevron = open ? ChevronDown : ChevronForward;

  function add() {
    const t = title.trim();
    if (!t) return;
    save.mutate(
      {
        subject_id: subject.id,
        title: t,
        description: null,
        sort_order: topics.length ? Math.max(...topics.map((x) => x.sort_order)) + 1 : 0,
      },
      {
        onSuccess: () => setTitle(""),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Card className="flex flex-col gap-2 p-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        <Chevron className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{subject.name_th}</span>
          <span className="block text-[10px] text-muted-foreground">
            {subject.code} · {SUBJECT_TYPE_LABEL[subject.subject_type]} · {subject.credits} นก. · {subject.hours_per_week} คาบ/สัปดาห์
          </span>
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{topics.length} หัวข้อ</span>
      </button>

      {open && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          {topics.length === 0 && <p className="text-[11px] text-muted-foreground">ยังไม่มีหัวข้อเนื้อหา</p>}
          <ol className="flex flex-col gap-1">
            {topics.map((t, i) => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <span className="w-4 shrink-0 text-right text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1">{t.title}</span>
                {mayEdit && (
                  <button
                    type="button"
                    aria-label={`ลบหัวข้อ ${t.title}`}
                    disabled={del.isPending}
                    onClick={() =>
                      del.mutate(t.id, {
                        onError: (err) => toast(err instanceof Error ? err.message : "ลบไม่สำเร็จ", "error"),
                      })
                    }
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {mayEdit && (
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="เพิ่มหัวข้อเนื้อหา"
                aria-label="หัวข้อเนื้อหา"
              />
              <Button type="submit" size="icon" variant="outline" disabled={!title.trim() || save.isPending} aria-label="เพิ่ม">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
