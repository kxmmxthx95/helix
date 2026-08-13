import { FileUp, Plus, Search, SlidersHorizontal, X } from "@/components/icons";
import { useMemo, useRef, useState, useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportSubjectsSheet } from "@/components/ImportSubjectsSheet";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Pagination, Select, Spinner } from "@/components/ui";
import {
  useDeleteSubject,
  useLearningAreas,
  useSaveLearningArea,
  useSaveSubject,
  useSubjects,
  type SubjectDraft,
  type SubjectFilters,
} from "@/hooks/useCurriculum";
import { useAllGradeLevels, useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useFillPageSize } from "@/hooks/useFillPageSize";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import type { GradingMethod, GradeLevel, LearningArea, Subject, SubjectType } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";
import { gradeShortLabel } from "@/lib/gradeLevels";

const EMPTY: Omit<SubjectFilters, "departmentId"> = {
  search: "",
  learningAreaId: "",
  gradeLevelId: "",
  term: "",
  subjectType: "",
  includeInactive: false,
};

const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  basic: "พื้นฐาน",
  additional: "เพิ่มเติม",
  activity: "กิจกรรม",
};

/** Pedagogical order: พื้นฐาน → เพิ่มเติม → กิจกรรม */
const SUBJECT_TYPE_ORDER: Record<SubjectType, number> = {
  basic: 0,
  additional: 1,
  activity: 2,
};

const SUBJECT_TYPE_DOT: Record<SubjectType, string> = {
  basic: "bg-blue-500",
  additional: "bg-pink-500",
  activity: "bg-violet-500",
};

/** ตัดเกรดปกติ vs ผ่าน/ไม่ผ่าน — settable per subject, defaults by subject_type. See migration 0023. */
const GRADING_METHOD_LABEL: Record<GradingMethod, string> = {
  graded: "ตัดเกรด",
  pass_fail: "ผ่าน/ไม่ผ่าน",
};

type SubjectSortKey =
  | "code"
  | "name_th"
  | "learning_area"
  | "grade_level"
  | "term"
  | "subject_type"
  | "credits"
  | "hours_per_week";

function SortTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: SubjectSortKey;
  sortKey: SubjectSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SubjectSortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={className ?? "px-3 py-2 font-medium"} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="tappable inline-flex items-center gap-1 text-left hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        <span className={active ? "text-foreground" : "text-muted-foreground/40"} aria-hidden>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function Subjects() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const [filters, setFilters] = useState<Omit<SubjectFilters, "departmentId">>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [pickedDept, setPickedDept] = useState("");
  // Default cascade: ระดับชั้น → ภาคเรียน → ประเภท → รหัส (header click overrides primary).
  const [sortKey, setSortKey] = useState<SubjectSortKey>("grade_level");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;
  // KG never uses subjects (it has its own learning_units/kg_assessment_topics model).
  const pickableDepartments = useMemo(() => departments.filter((d) => d.code !== "KG"), [departments]);

  const departmentId = orgWide ? pickedDept : me?.department_id ?? "";
  const departmentName = departments.find((d) => d.id === departmentId)?.name ?? "";

  const { data: learningAreas = [] } = useLearningAreas();
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const { data: rows, isLoading, error } = useSubjects({ ...filters, departmentId });
  const del = useDeleteSubject();

  const areaById = useMemo(() => new Map(learningAreas.map((a) => [a.id, a])), [learningAreas]);
  const gradeName = useMemo(
    () => new Map(gradeLevels.map((g) => [g.id, gradeShortLabel(g.code)])),
    [gradeLevels],
  );
  const gradeSort = useMemo(() => new Map(gradeLevels.map((g) => [g.id, g.sort_order])), [gradeLevels]);

  const areaName = useMemo(() => {
    return new Map(
      learningAreas.map((a) => {
        const parent = a.parent_id ? areaById.get(a.parent_id) : null;
        return [a.id, parent ? `${parent.name} · ${a.name}` : a.name];
      }),
    );
  }, [learningAreas, areaById]);

  function topAreaLabel(learningAreaId: string) {
    const area = areaById.get(learningAreaId);
    if (!area) return "—";
    if (area.parent_id) return areaById.get(area.parent_id)?.name ?? "—";
    return area.name;
  }

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    const list = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    const cascade: SubjectSortKey[] = ["grade_level", "term", "subject_type", "code"];
    const keys = [sortKey, ...cascade.filter((k) => k !== sortKey)];

    function cmpKey(a: Subject, b: Subject, key: SubjectSortKey): number {
      switch (key) {
        case "code":
          return a.code.localeCompare(b.code, "th", { numeric: true });
        case "name_th":
          return a.name_th.localeCompare(b.name_th, "th");
        case "learning_area":
          return topAreaLabel(a.learning_area_id).localeCompare(topAreaLabel(b.learning_area_id), "th");
        case "grade_level": {
          const ao = a.suggested_grade_level_id ? (gradeSort.get(a.suggested_grade_level_id) ?? 999) : 999;
          const bo = b.suggested_grade_level_id ? (gradeSort.get(b.suggested_grade_level_id) ?? 999) : 999;
          return ao - bo;
        }
        case "term":
          return (a.suggested_term ?? 999) - (b.suggested_term ?? 999);
        case "subject_type":
          return SUBJECT_TYPE_ORDER[a.subject_type] - SUBJECT_TYPE_ORDER[b.subject_type];
        case "credits":
          return a.credits - b.credits;
        case "hours_per_week":
          return a.hours_per_week - b.hours_per_week;
      }
    }

    list.sort((a, b) => {
      for (let i = 0; i < keys.length; i++) {
        const cmp = cmpKey(a, b, keys[i]!);
        if (cmp !== 0) return i === 0 ? cmp * dir : cmp;
      }
      return 0;
    });
    return list;
  }, [rows, sortKey, sortDir, areaById, gradeSort]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableReady = Boolean(rows && rows.length > 0);
  const pageSize = useFillPageSize(scrollRef, tableReady);
  const { page, setPage, pageCount, pageRows } = usePagination(
    sortedRows,
    [filters, departmentId, sortKey, sortDir],
    pageSize,
  );

  function onSort(key: SubjectSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const activeFilterCount = [
    filters.learningAreaId,
    filters.gradeLevelId,
    filters.term ? String(filters.term) : "",
    filters.subjectType,
    filters.includeInactive ? "1" : "",
  ].filter(Boolean).length;

  return (
    <div className="page-fill">
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex gap-2">
          {orgWide && pickableDepartments.length > 0 && (
            <Select
              className="min-w-0 flex-1"
              value={pickedDept}
              onChange={(e) => setPickedDept(e.target.value)}
              aria-label="แผนก"
              placeholder="เลือกแผนก"
            >
              {pickableDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
          <Button
            variant="outline"
            size="icon"
            className="relative shrink-0"
            onClick={() => setFiltersOpen(true)}
            aria-label="ตัวกรอง"
          >
            <SlidersHorizontal className="h-3 w-3" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {mayEdit && (
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setImporting(true)} aria-label="นำเข้ารายวิชา">
              <FileUp className="h-3 w-3" />
            </Button>
          )}
          {mayEdit && (
            <Button
              size="icon"
              className="shrink-0"
              onClick={() => setEditing("new")}
              disabled={!departmentId}
              aria-label="เพิ่มรายวิชา"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="ค้นหารหัสหรือชื่อวิชา"
            className="pl-9"
            type="search"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {error && <Card className="shrink-0 text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>}

      {!departmentId && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกด้านบนเพื่อดูรายวิชา" />
        </div>
      )}

      {departmentId && rows && rows.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่พบรายวิชาตามเงื่อนไขที่เลือก" />
        </div>
      )}

      {departmentId && rows && rows.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto lg:hidden">
            {pageRows.map((row) => (
              <li key={row.id}>
                <div
                  role={mayEdit ? "button" : undefined}
                  tabIndex={mayEdit ? 0 : undefined}
                  onClick={() => mayEdit && setEditing(row)}
                  onKeyDown={(e) => {
                    if (!mayEdit) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditing(row);
                    }
                  }}
                  className={
                    mayEdit
                      ? "rounded-lg border border-border p-3 active:bg-muted"
                      : "rounded-lg border border-border p-3"
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs tabular-nums text-muted-foreground">{row.code}</span>
                        <span className="flex items-center gap-1 text-xs">
                          <span className={`size-2 rounded-full ${SUBJECT_TYPE_DOT[row.subject_type]}`} />
                          {SUBJECT_TYPE_LABEL[row.subject_type]}
                        </span>
                        {!row.is_active && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            ปิดใช้งาน
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{row.name_th}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {topAreaLabel(row.learning_area_id)}
                        {" · "}
                        {row.suggested_grade_level_id
                          ? (gradeName.get(row.suggested_grade_level_id) ?? "—")
                          : "—"}
                        {" · "}
                        {row.suggested_term != null ? `ภาค ${row.suggested_term}` : "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.credits} หน่วยกิต · {row.hours_per_week} ชม./สัปดาห์
                      </p>
                    </div>
                    {mayEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label="ลบ"
                        disabled={del.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`ลบรายวิชา "${row.name_th}" ถาวร? ข้อมูลนี้กู้คืนไม่ได้`)) {
                            del.mutate(row.id, {
                              onError: () =>
                                alert(
                                  `ลบไม่ได้ — "${row.name_th}" ถูกใช้อยู่ในโครงสร้างหลักสูตร ให้ปิดใช้งานแทน`,
                                ),
                            });
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="table-panel hidden lg:flex">
            <div ref={scrollRef} className="table-panel-scroll">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <SortTh label="รหัส" column="code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="ชื่อวิชา" column="name_th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="กลุ่มสาระ" column="learning_area" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="ระดับชั้น" column="grade_level" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="ภาคเรียน" column="term" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="หน่วยกิต" column="credits" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="จำนวนชั่วโมง" column="hours_per_week" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="ประเภท" column="subject_type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    {mayEdit && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => mayEdit && setEditing(row)}
                      className={
                        mayEdit
                          ? "h-[40px] cursor-pointer border-t border-border active:bg-muted"
                          : "h-[40px] border-t border-border"
                      }
                    >
                      <td className="px-3 py-0 text-xs tabular-nums">{row.code}</td>
                      <td className="px-3 py-0 font-medium">
                        {row.name_th}
                        {!row.is_active && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            ปิดใช้งาน
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-0">{topAreaLabel(row.learning_area_id)}</td>
                      <td className="px-3 py-0">
                        {row.suggested_grade_level_id
                          ? (gradeName.get(row.suggested_grade_level_id) ?? "—")
                          : "—"}
                      </td>
                      <td className="px-3 py-0">{row.suggested_term ?? "—"}</td>
                      <td className="px-3 py-0">{row.credits}</td>
                      <td className="px-3 py-0">{row.hours_per_week}</td>
                      <td className="px-3 py-0">
                        <span className="flex items-center gap-1.5">
                          <span className={`size-2 rounded-full ${SUBJECT_TYPE_DOT[row.subject_type]}`} />
                          <span className="text-xs">{SUBJECT_TYPE_LABEL[row.subject_type]}</span>
                        </span>
                      </td>
                      {mayEdit && (
                        <td className="px-3 py-0 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="ลบ"
                            disabled={del.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`ลบรายวิชา "${row.name_th}" ถาวร? ข้อมูลนี้กู้คืนไม่ได้`)) {
                                del.mutate(row.id, {
                                  onError: () =>
                                    alert(
                                      `ลบไม่ได้ — "${row.name_th}" ถูกใช้อยู่ในโครงสร้างหลักสูตร ให้ปิดใช้งานแทน`,
                                    ),
                                });
                              }
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <Sheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="ตัวกรอง"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setFilters({ ...EMPTY, search: filters.search })}>
              ล้างตัวกรอง
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              ดูผลลัพธ์
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="กลุ่มสาระการเรียนรู้">
            <Select
              value={filters.learningAreaId}
              onChange={(e) => setFilters({ ...filters, learningAreaId: e.target.value })}
            >
              <option value="">ทุกกลุ่มสาระ</option>
              {learningAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {areaName.get(a.id) ?? a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ระดับชั้น">
            <Select
              value={filters.gradeLevelId}
              onChange={(e) => setFilters({ ...filters, gradeLevelId: e.target.value })}
            >
              <option value="">ทุกระดับชั้น</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ภาคเรียน">
            <Select
              value={filters.term ? String(filters.term) : ""}
              onChange={(e) =>
                setFilters({ ...filters, term: e.target.value ? Number(e.target.value) : "" })
              }
            >
              <option value="">ทุกภาคเรียน</option>
              <option value="1">ภาคเรียนที่ 1</option>
              <option value="2">ภาคเรียนที่ 2</option>
            </Select>
          </Field>

          <Field label="ประเภทวิชา">
            <Select
              value={filters.subjectType}
              onChange={(e) => setFilters({ ...filters, subjectType: e.target.value as SubjectType | "" })}
            >
              <option value="">ทั้งหมด</option>
              {(Object.keys(SUBJECT_TYPE_LABEL) as SubjectType[]).map((t) => (
                <option key={t} value={t}>
                  {SUBJECT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="สถานะ">
            <Select
              value={filters.includeInactive ? "all" : "active"}
              onChange={(e) => setFilters({ ...filters, includeInactive: e.target.value === "all" })}
            >
              <option value="active">เฉพาะที่ใช้งาน</option>
              <option value="all">ทั้งหมด (รวมปิดใช้งาน)</option>
            </Select>
          </Field>
        </div>
      </Sheet>

      <EditSubjectSheet
        target={editing}
        onClose={() => setEditing(null)}
        departmentId={departmentId}
        departmentName={departmentName}
        gradeLevels={gradeLevels}
      />

      <ImportSubjectsSheet
        open={importing}
        onOpenChange={setImporting}
        departmentId={departmentId}
        learningAreas={learningAreas}
      />
    </div>
  );
}

function blankDraft(departmentId: string): SubjectDraft {
  return {
    code: "",
    name_th: "",
    name_en: null,
    department_id: departmentId,
    learning_area_id: "",
    subject_type: "",
    grading_method: "graded",
    credits: 1,
    hours_per_week: 1,
    is_active: true,
    suggested_grade_level_id: null,
    suggested_term: null,
  };
}

function pickDraft(s: Subject): SubjectDraft {
  return {
    code: s.code,
    name_th: s.name_th,
    name_en: s.name_en,
    department_id: s.department_id,
    learning_area_id: s.learning_area_id,
    subject_type: s.subject_type,
    grading_method: s.grading_method,
    credits: s.credits,
    hours_per_week: s.hours_per_week,
    is_active: s.is_active,
    suggested_grade_level_id: s.suggested_grade_level_id,
    suggested_term: s.suggested_term,
  };
}

function EditSubjectSheet({
  target,
  onClose,
  departmentId,
  departmentName,
  gradeLevels: gradeLevelsProp,
}: {
  target: Subject | "new" | null;
  onClose: () => void;
  departmentId: string;
  departmentName: string;
  gradeLevels: GradeLevel[];
}) {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: learningAreas = [] } = useLearningAreas();
  const { data: allGradeLevels = [] } = useAllGradeLevels();
  const save = useSaveSubject();
  const [draft, setDraft] = useState<SubjectDraft | null>(null);
  const [addingSubArea, setAddingSubArea] = useState(false);

  const canAddLearningArea = me ? isOrgWide(me.roles) : false;
  const topLevelAreas = useMemo(() => learningAreas.filter((a) => !a.parent_id), [learningAreas]);

  const isNew = target === "new";
  const subjectDeptId = target && target !== "new" ? target.department_id : departmentId;
  const gradeLevels = useMemo(() => {
    if (gradeLevelsProp.length > 0) return gradeLevelsProp;
    return allGradeLevels.filter((g) => g.department_id === subjectDeptId);
  }, [gradeLevelsProp, allGradeLevels, subjectDeptId]);
  const base: SubjectDraft | null =
    target === null ? null : isNew ? blankDraft(departmentId) : pickDraft(target);
  const current = draft ?? base;

  const gradeLevelOptions = useMemo(() => {
    const byId = new Map(gradeLevels.map((g) => [g.id, g]));
    const selectedId = current?.suggested_grade_level_id;
    if (selectedId && !byId.has(selectedId)) {
      const orphan = allGradeLevels.find((g) => g.id === selectedId);
      if (orphan) byId.set(orphan.id, orphan);
    }
    return [...byId.values()].sort((a, b) => a.sort_order - b.sort_order);
  }, [gradeLevels, allGradeLevels, current?.suggested_grade_level_id]);

  useEffect(() => {
    setDraft(null);
    setAddingSubArea(false);
  }, [target]);

  const selectedArea = learningAreas.find((a) => a.id === current?.learning_area_id);
  const selectedTopId = selectedArea ? selectedArea.parent_id ?? selectedArea.id : "";
  const subAreas = useMemo(
    () => learningAreas.filter((a) => a.parent_id === selectedTopId),
    [learningAreas, selectedTopId],
  );

  function close() {
    setDraft(null);
    setAddingSubArea(false);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (!current.learning_area_id || !current.subject_type) return;
    save.mutate(
      { ...current, ...(isNew ? {} : { id: (target as Subject).id }) },
      {
        onSuccess: () => toast("บันทึกวิชาสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
    close();
  }

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && close()}
      title={isNew ? "เพิ่มรายวิชา" : "แก้ไขรายวิชา"}
      headerEnd={
        departmentName ? (
          <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {departmentName}
          </span>
        ) : undefined
      }
      footer={
        current ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit" form="edit-subject" className="flex-1" disabled={save.isPending}>
              {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {current && (
        <form id="edit-subject" onSubmit={submit} className="space-y-4">
          <Field label="รหัสวิชา">
            <Input value={current.code} onChange={(e) => setDraft({ ...current, code: e.target.value })} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อวิชา (ไทย)">
              <Input
                value={current.name_th}
                onChange={(e) => setDraft({ ...current, name_th: e.target.value })}
                required
              />
            </Field>
            <Field label="ชื่อวิชา (อังกฤษ)">
              <Input
                value={current.name_en ?? ""}
                onChange={(e) => setDraft({ ...current, name_en: e.target.value || null })}
              />
            </Field>
          </div>

          <Field label="กลุ่มสาระการเรียนรู้">
            <Select
              value={selectedTopId}
              onChange={(e) => setDraft({ ...current, learning_area_id: e.target.value })}
              required
              placeholder="เลือกสาระการเรียนรู้"
            >
              {topLevelAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          {(subAreas.length > 0 || canAddLearningArea) && (
            <Field label="สาระย่อย (ถ้ามี)">
              {!addingSubArea && (
                <div className="flex gap-2">
                  <Select
                    value={selectedArea?.parent_id === selectedTopId ? selectedArea.id : ""}
                    onChange={(e) => setDraft({ ...current, learning_area_id: e.target.value || selectedTopId })}
                    className="flex-1"
                    placeholder="เลือกสาระย่อย"
                    disabled={!selectedTopId}
                  >
                    {subAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                  {canAddLearningArea && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setAddingSubArea(true)}
                      disabled={!selectedTopId}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
              {addingSubArea && (
                <NewSubLearningAreaField
                  parentId={selectedTopId}
                  onCreated={(area) => {
                    setDraft({ ...current, learning_area_id: area.id });
                    setAddingSubArea(false);
                  }}
                  onCancel={() => setAddingSubArea(false)}
                />
              )}
            </Field>
          )}

          <Field label="ประเภทวิชา">
            <Select
              value={current.subject_type}
              onChange={(e) => {
                const subject_type = e.target.value as SubjectType;
                setDraft({
                  ...current,
                  subject_type,
                  // Suggest pass/fail for activity subjects — still overridable below.
                  grading_method: subject_type === "activity" ? "pass_fail" : "graded",
                });
              }}
              required
              placeholder="เลือกประเภทวิชา"
            >
              {(Object.keys(SUBJECT_TYPE_LABEL) as SubjectType[]).map((t) => (
                <option key={t} value={t}>
                  {SUBJECT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="วิธีประเมินผล">
            <Select
              value={current.grading_method}
              onChange={(e) => setDraft({ ...current, grading_method: e.target.value as GradingMethod })}
              required
            >
              {(Object.keys(GRADING_METHOD_LABEL) as GradingMethod[]).map((g) => (
                <option key={g} value={g}>
                  {GRADING_METHOD_LABEL[g]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="หน่วยกิต">
              <Input
                type="number"
                step="0.5"
                min="0"
                value={current.credits}
                onChange={(e) => setDraft({ ...current, credits: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="ชั่วโมง/สัปดาห์">
              <Input
                type="number"
                min="0"
                step="1"
                value={current.hours_per_week}
                onChange={(e) => setDraft({ ...current, hours_per_week: Number(e.target.value) })}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ระดับชั้นที่แนะนำ">
              <Select
                value={current.suggested_grade_level_id ?? ""}
                onChange={(e) => setDraft({ ...current, suggested_grade_level_id: e.target.value || null })}
              >
                <option value="">ไม่ระบุ</option>
                {gradeLevelOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="เทอมที่แนะนำ">
              <Select
                value={current.suggested_term ? String(current.suggested_term) : ""}
                onChange={(e) => setDraft({ ...current, suggested_term: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">ไม่ระบุ</option>
                <option value="1">เทอม 1</option>
                <option value="2">เทอม 2</option>
              </Select>
            </Field>
          </div>

          {!isNew && (
            <Field label="สถานะ">
              <Select
                value={current.is_active ? "active" : "inactive"}
                onChange={(e) => setDraft({ ...current, is_active: e.target.value === "active" })}
              >
                <option value="active">ใช้งาน</option>
                <option value="inactive">ปิดใช้งาน</option>
              </Select>
            </Field>
          )}
        </form>
      )}
    </Sheet>
  );
}

/** Inline "+ สาระย่อย" — learning_areas has no dedicated admin page, same pattern as NewStudyPlanField. */
function NewSubLearningAreaField({
  parentId,
  onCreated,
  onCancel,
}: {
  parentId: string;
  onCreated: (area: LearningArea) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const save = useSaveLearningArea();
  const [name, setName] = useState("");

  return (
    <div className="space-y-2">
      <Input placeholder="ชื่อ เช่น ฟิสิกส์" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={!name.trim() || save.isPending}
          onClick={() =>
            save.mutate(
              {
                // code is unique/required in DB — not shown in UI for sub-areas
                code: `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
                name: name.trim(),
                parent_id: parentId,
              },
              {
                onSuccess: (area) => {
                  toast("บันทึกสาระย่อยสำเร็จ");
                  onCreated(area);
                },
              },
            )
          }
        >
          {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกสาระย่อย"}
        </Button>
      </div>
    </div>
  );
}
