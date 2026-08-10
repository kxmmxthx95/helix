import { FileUp, Plus, Search, SlidersHorizontal } from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ImportSubjectsSheet } from "@/components/ImportSubjectsSheet";
import { Sheet } from "@/components/Sheet";
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
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import type { LearningArea, Subject, SubjectType } from "@/lib/database.types";
import { canManage, isOrgWide } from "@/lib/roles";

const EMPTY: Omit<SubjectFilters, "departmentId"> = {
  search: "",
  learningAreaId: "",
  subjectType: "",
  includeInactive: false,
};

const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  basic: "พื้นฐาน",
  additional: "เพิ่มเติม",
  activity: "กิจกรรม",
};

export function Subjects() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const [filters, setFilters] = useState<Omit<SubjectFilters, "departmentId">>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [pickedDept, setPickedDept] = useState("");

  const orgWide = me ? isOrgWide(me.roles) : false;
  const mayEdit = me ? canManage(me.roles) : false;
  // KG never uses subjects (it has its own learning_units/kg_assessment_topics model).
  const pickableDepartments = useMemo(() => departments.filter((d) => d.code !== "KG"), [departments]);

  useEffect(() => {
    if (orgWide && !pickedDept && pickableDepartments.length > 0) setPickedDept(pickableDepartments[0]!.id);
  }, [orgWide, pickableDepartments, pickedDept]);

  const departmentId = orgWide ? pickedDept : me?.department_id ?? "";
  const departmentName = departments.find((d) => d.id === departmentId)?.name ?? "";

  const { data: learningAreas = [] } = useLearningAreas();
  const { data: rows, isLoading, error } = useSubjects({ ...filters, departmentId });
  const del = useDeleteSubject();
  const { page, setPage, pageCount, pageRows } = usePagination(rows ?? [], [filters, departmentId]);

  const areaName = useMemo(() => {
    const byId = new Map(learningAreas.map((a) => [a.id, a]));
    return new Map(
      learningAreas.map((a) => {
        const parent = a.parent_id ? byId.get(a.parent_id) : null;
        return [a.id, parent ? `${parent.name} · ${a.name}` : a.name];
      }),
    );
  }, [learningAreas]);

  const activeFilterCount = [filters.learningAreaId, filters.subjectType, filters.includeInactive ? "1" : ""].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {orgWide && pickableDepartments.length > 0 && (
          <Select
            className="w-auto min-w-[10rem] shrink-0"
            value={pickedDept}
            onChange={(e) => setPickedDept(e.target.value)}
            aria-label="แผนก"
          >
            {pickableDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="ค้นหารหัสหรือชื่อวิชา"
            className="pl-9"
            type="search"
          />
        </div>
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
          <Button size="icon" className="shrink-0" onClick={() => setEditing("new")} aria-label="เพิ่มรายวิชา">
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {error && <Card className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>}

      {rows && rows.length === 0 && (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่พบรายวิชาตามเงื่อนไขที่เลือก" />
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัส</th>
                  <th className="px-3 py-2 font-medium">ชื่อวิชา</th>
                  <th className="px-3 py-2 font-medium">กลุ่มสาระ</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium">หน่วยกิต</th>
                  <th className="px-3 py-2 font-medium">ชม./สัปดาห์</th>
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
                    <td className="px-3 py-0 font-mono text-xs">{row.code}</td>
                    <td className="px-3 py-0 font-medium">
                      {row.name_th}
                      {!row.is_active && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          ปิดใช้งาน
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-0 text-muted-foreground">{areaName.get(row.learning_area_id) ?? "—"}</td>
                    <td className="px-3 py-0 text-muted-foreground">{SUBJECT_TYPE_LABEL[row.subject_type]}</td>
                    <td className="px-3 py-0 text-muted-foreground">{row.credits}</td>
                    <td className="px-3 py-0 text-muted-foreground">{row.hours_per_week}</td>
                    {mayEdit && (
                      <td className="px-3 py-0 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
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
      />

      <ImportSubjectsSheet
        open={importing}
        onOpenChange={setImporting}
        departmentId={departmentId}
        departmentName={departmentName}
        learningAreas={learningAreas}
      />
    </div>
  );
}

function blankDraft(learningAreaId: string, departmentId: string): SubjectDraft {
  return {
    code: "",
    name_th: "",
    name_en: null,
    department_id: departmentId,
    learning_area_id: learningAreaId,
    subject_type: "basic",
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
}: {
  target: Subject | "new" | null;
  onClose: () => void;
  departmentId: string;
  departmentName: string;
}) {
  const { profile: me } = useAuth();
  const { data: learningAreas = [] } = useLearningAreas();
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const save = useSaveSubject();
  const [draft, setDraft] = useState<SubjectDraft | null>(null);
  const [addingSubArea, setAddingSubArea] = useState(false);

  const canAddLearningArea = me ? isOrgWide(me.roles) : false;
  const topLevelAreas = useMemo(() => learningAreas.filter((a) => !a.parent_id), [learningAreas]);

  const isNew = target === "new";
  const base: SubjectDraft | null =
    target === null ? null : isNew ? blankDraft(topLevelAreas[0]?.id ?? "", departmentId) : pickDraft(target);
  const current = draft ?? base;

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
    save.mutate({ ...current, ...(isNew ? {} : { id: (target as Subject).id }) });
    close();
  }

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && close()}
      title={isNew ? "เพิ่มรายวิชา" : "แก้ไขรายวิชา"}
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
          <div className="flex h-8 items-center justify-between gap-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">แผนก</span>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
              {departmentName}
            </span>
          </div>

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
                  >
                    <option value="">ไม่มีสาระย่อย</option>
                    {subAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                  {canAddLearningArea && (
                    <Button type="button" variant="outline" size="icon" onClick={() => setAddingSubArea(true)}>
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
              onChange={(e) => setDraft({ ...current, subject_type: e.target.value as SubjectType })}
            >
              {(Object.keys(SUBJECT_TYPE_LABEL) as SubjectType[]).map((t) => (
                <option key={t} value={t}>
                  {SUBJECT_TYPE_LABEL[t]}
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
                {gradeLevels.map((g) => (
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
  const save = useSaveLearningArea();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="รหัส เช่น physics" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input placeholder="ชื่อ เช่น ฟิสิกส์" value={name} onChange={(e) => setName(e.target.value)} />
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
          onClick={() =>
            save.mutate(
              { code: code.trim(), name: name.trim(), parent_id: parentId },
              { onSuccess: onCreated },
            )
          }
        >
          {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกสาระย่อย"}
        </Button>
      </div>
    </div>
  );
}
