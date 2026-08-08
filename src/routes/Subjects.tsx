import { Plus, Search, SlidersHorizontal } from "@/components/icons";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import {
  useLearningAreas,
  useSaveSubject,
  useSubjects,
  type SubjectDraft,
  type SubjectFilters,
} from "@/hooks/useCurriculum";
import type { Subject, SubjectType } from "@/lib/database.types";
import { isOrgWide } from "@/lib/roles";

const EMPTY: SubjectFilters = { search: "", learningAreaId: "", subjectType: "", includeInactive: false };

const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  basic: "พื้นฐาน",
  additional: "เพิ่มเติม",
  activity: "กิจกรรม",
};

export function Subjects() {
  const { profile: me } = useAuth();
  const [filters, setFilters] = useState<SubjectFilters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | "new" | null>(null);

  const { data: learningAreas = [] } = useLearningAreas();
  const { data: rows, isLoading, error } = useSubjects(filters);

  const areaName = useMemo(() => new Map(learningAreas.map((a) => [a.id, a.name])), [learningAreas]);
  const mayEdit = me ? isOrgWide(me.roles) : false;

  const activeFilterCount = [filters.learningAreaId, filters.subjectType, filters.includeInactive ? "1" : ""].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {mayEdit && (
          <Button size="icon" onClick={() => setEditing("new")} aria-label="เพิ่มรายวิชา">
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
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
          className="relative"
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
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {error && <Card className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</Card>}

      {rows && rows.length === 0 && (
        <Card className="py-10 text-center text-sm text-muted-foreground">ไม่พบรายวิชา</Card>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">รหัส</th>
                <th className="px-3 py-2 font-medium">ชื่อวิชา</th>
                <th className="px-3 py-2 font-medium">กลุ่มสาระ</th>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">หน่วยกิต</th>
                <th className="px-3 py-2 font-medium">ชม./สัปดาห์</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => mayEdit && setEditing(row)}
                  className={
                    mayEdit
                      ? "tappable cursor-pointer border-t border-border active:bg-muted"
                      : "border-t border-border"
                  }
                >
                  <td className="px-3 py-3 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-3 font-medium">
                    {row.name_th}
                    {!row.is_active && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        ปิดใช้งาน
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{areaName.get(row.learning_area_id) ?? "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{SUBJECT_TYPE_LABEL[row.subject_type]}</td>
                  <td className="px-3 py-3 text-muted-foreground">{row.credits}</td>
                  <td className="px-3 py-3 text-muted-foreground">{row.hours_per_week}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="ตัวกรอง">
        <div className="space-y-4">
          <Field label="กลุ่มสาระการเรียนรู้">
            <Select
              value={filters.learningAreaId}
              onChange={(e) => setFilters({ ...filters, learningAreaId: e.target.value })}
            >
              <option value="">ทุกกลุ่มสาระ</option>
              {learningAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
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

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setFilters({ ...EMPTY, search: filters.search })}>
              ล้างตัวกรอง
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              ดูผลลัพธ์
            </Button>
          </div>
        </div>
      </Sheet>

      <EditSubjectSheet target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function blankDraft(learningAreaId: string): SubjectDraft {
  return {
    code: "",
    name_th: "",
    name_en: null,
    learning_area_id: learningAreaId,
    subject_type: "basic",
    credits: 1,
    hours_per_week: 1,
    is_active: true,
  };
}

function pickDraft(s: Subject): SubjectDraft {
  return {
    code: s.code,
    name_th: s.name_th,
    name_en: s.name_en,
    learning_area_id: s.learning_area_id,
    subject_type: s.subject_type,
    credits: s.credits,
    hours_per_week: s.hours_per_week,
    is_active: s.is_active,
  };
}

function EditSubjectSheet({ target, onClose }: { target: Subject | "new" | null; onClose: () => void }) {
  const { data: learningAreas = [] } = useLearningAreas();
  const save = useSaveSubject();
  const [draft, setDraft] = useState<SubjectDraft | null>(null);

  const isNew = target === "new";
  const base: SubjectDraft | null =
    target === null ? null : isNew ? blankDraft(learningAreas[0]?.id ?? "") : pickDraft(target);
  const current = draft ?? base;

  function close() {
    setDraft(null);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    save.mutate({ ...current, ...(isNew ? {} : { id: (target as Subject).id }) });
    close();
  }

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && close()} title={isNew ? "เพิ่มรายวิชา" : "แก้ไขรายวิชา"}>
      {current && (
        <form onSubmit={submit} className="space-y-4">
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
              value={current.learning_area_id}
              onChange={(e) => setDraft({ ...current, learning_area_id: e.target.value })}
              required
            >
              {learningAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

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

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              ยกเลิก
            </Button>
            <Button type="submit" className="flex-1" disabled={save.isPending}>
              {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
