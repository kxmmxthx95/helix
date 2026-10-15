import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfilesByIds } from "@/hooks/usePractice";
import { DownloadIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Input, Spinner, Switch } from "@/components/ui";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { useClassroomSchedule, useDepartmentSchedule } from "@/hooks/useSchedule";
import { useSchoolSettings } from "@/hooks/useSettings";
import type { ProfileRow } from "@/hooks/useProfiles";
import { profileFullName, type Classroom, type PeriodDefinition } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { supabase } from "@/lib/supabase";
import { downloadTimetablePdf, type PdfSheet } from "@/lib/timetablePdf";
import { cn } from "@/lib/utils";

type Kind = "classroom" | "teacher";

/** Pick classrooms/teachers, then download one PDF with a page each. `fixedClassroomId` locks it to one room (students). */
export function TimetableExportSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  academicYear: number;
  term: number | null;
  defaultKind: Kind;
  classrooms: Classroom[];
  teachers: ProfileRow[];
  fixedClassroomId?: string;
}) {
  // Mounted only while open so none of the data below is fetched until someone asks for an export.
  return props.open ? <ExportBody {...props} /> : null;
}

function ExportBody({
  onOpenChange,
  departmentId,
  academicYear,
  term,
  defaultKind,
  classrooms,
  teachers,
  fixedClassroomId,
}: Parameters<typeof TimetableExportSheet>[0]) {
  const toast = useToast();
  const { data: school } = useSchoolSettings();
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const colors = useSubjectColors(gradeLevels);
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: allPeriods = [] } = useQuery({
    queryKey: ["period_definitions", departmentId, "all"],
    queryFn: async (): Promise<PeriodDefinition[]> => {
      const { data, error } = await supabase.from("period_definitions").select("*").eq("department_id", departmentId);
      if (error) throw error;
      return data;
    },
  });
  const deptSchedule = useDepartmentSchedule(departmentId, academicYear, term, !fixedClassroomId);
  const roomSchedule = useClassroomSchedule(fixedClassroomId ?? null, academicYear, term);
  const entries = (fixedClassroomId ? roomSchedule.data : deptSchedule.data) ?? [];
  const loading = fixedClassroomId ? roomSchedule.isLoading : deptSchedule.isLoading;

  const teacherIds = useMemo(() => [...new Set(entries.map((e) => e.teaching_assignment.teacher_id))].sort(), [entries]);
  const { data: entryTeachers = [] } = useProfilesByIds(teacherIds);
  const teacherName = (id: string) => {
    const t = teachers.find((x) => x.id === id);
    if (t) return profileFullName(t);
    const o = entryTeachers.find((x) => x.id === id);
    return o ? `${o.first_name} ${o.last_name}` : "—";
  };

  const [kind, setKind] = useState<Kind>(fixedClassroomId ? "classroom" : defaultKind);
  const [search, setSearch] = useState("");
  const [colorful, setColorful] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const roomLabel = (c: Classroom) => {
    const code = gradeLevels.find((g) => g.id === c.grade_level_id)?.code;
    return `${code ? gradeShortLabel(code) : "—"}/${c.name}`;
  };
  const roomById = (id: string) => classrooms.find((c) => c.id === id);

  const countBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      for (const k of [e.teaching_assignment.classroom_id, e.teaching_assignment.teacher_id]) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const items = useMemo(() => {
    const list =
      kind === "classroom"
        ? classrooms
            .filter((c) => !fixedClassroomId || c.id === fixedClassroomId)
            .sort(
              (a, b) =>
                gradeLevels.findIndex((g) => g.id === a.grade_level_id) - gradeLevels.findIndex((g) => g.id === b.grade_level_id) ||
                a.name.localeCompare(b.name, undefined, { numeric: true }),
            )
            .map((c) => ({ id: c.id, name: roomLabel(c) }))
        : [...teachers]
            .sort((a, b) => profileFullName(a).localeCompare(profileFullName(b), "th"))
            .map((t) => ({ id: t.id, name: profileFullName(t) }));
    return list.map((i) => ({ ...i, periods: countBy.get(i.id) ?? 0 }));
  }, [kind, classrooms, teachers, gradeLevels, countBy, fixedClassroomId]);

  const shown = items.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()));
  // Nothing printed for someone with no periods, so they are not selectable.
  const picked = items.filter((i) => i.periods > 0 && !excluded.has(i.id));

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const setAll = (on: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const i of shown) on ? next.delete(i.id) : next.add(i.id);
      return next;
    });

  const subjectOf = (id: string) => subjects.find((s) => s.id === id);

  function buildSheet(id: string): PdfSheet {
    const isRoom = kind === "classroom";
    const room = isRoom ? roomById(id) : undefined;
    const defaults = allPeriods.filter((p) => p.grade_level_id === null);
    const overrides = room ? allPeriods.filter((p) => p.grade_level_id === room.grade_level_id) : [];
    const merged = new Map(defaults.map((p) => [`${p.day_of_week}-${p.period_no}`, p]));
    for (const p of overrides) merged.set(`${p.day_of_week}-${p.period_no}`, p);

    const mine = entries.filter((e) => (isRoom ? e.teaching_assignment.classroom_id : e.teaching_assignment.teacher_id) === id);
    const term_ = term ? ` · ภาคเรียนที่ ${term}` : "";
    return {
      title: isRoom ? `ตารางเรียน ${items.find((i) => i.id === id)?.name ?? ""}` : `ตารางสอน ${items.find((i) => i.id === id)?.name ?? ""}`,
      subtitle: `ปีการศึกษา ${academicYear}${term_}`,
      periods: [...merged.values()],
      cells: mine.map((e) => {
        const a = e.teaching_assignment;
        const s = subjectOf(a.subject_id);
        const c = roomById(a.classroom_id);
        return {
          day: e.day_of_week,
          periodNo: e.period_no,
          code: s?.code ?? "—",
          name: s?.name_th ?? "",
          extra: isRoom ? teacherName(a.teacher_id) : c ? roomLabel(c) : "—",
          fill: s ? colors.hex(s.learning_area_id, c?.grade_level_id) : null,
        };
      }),
    };
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const sheets = picked.map((i) => buildSheet(i.id));
      const name = sheets.length === 1 ? sheets[0]!.title : `${kind === "classroom" ? "ตารางเรียน" : "ตารางสอน"} ${sheets.length} รายการ`;
      await downloadTimetablePdf({
        schoolName: school?.name_th ?? "",
        sheets,
        color: colorful,
        fileName: `${name.replace(/[/\\]/g, "-")}.pdf`,
      });
      onOpenChange(false);
    } catch (err) {
      toast(`ส่งออก PDF ไม่สำเร็จ — ${err instanceof Error ? err.message : "ไม่ทราบสาเหตุ"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title="ส่งออกตารางเป็น PDF"
      description="กระดาษ A4 แนวนอน หน้าละ 1 ตาราง"
      footer={
        <div className="flex items-center gap-3">
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={colorful} onChange={setColorful} size="sm" />
            {colorful ? "พิมพ์สี" : "ขาวดำ"}
          </label>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button disabled={busy || loading || picked.length === 0} onClick={() => void exportPdf()}>
            {busy ? <Spinner /> : <DownloadIcon className="h-4 w-4" />}
            ส่งออก {picked.length} ตาราง
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {!fixedClassroomId && (
          <div className="inline-flex h-8 gap-1 rounded-lg border border-border p-0.5">
            {(["classroom", "teacher"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "inline-flex h-full items-center rounded-md px-3 text-xs font-medium transition-colors",
                  kind === k ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {k === "classroom" ? "ตารางเรียน (ห้อง)" : "ตารางสอน (ครู)"}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={kind === "classroom" ? "ค้นหาห้องเรียน..." : "ค้นหาครู..."}
            className="h-8 flex-1"
          />
          <Button size="sm" variant="outline" onClick={() => setAll(true)}>
            เลือกทั้งหมด
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAll(false)}>
            ล้าง
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {shown.map((i) => {
              const on = i.periods > 0 && !excluded.has(i.id);
              return (
                <li key={i.id}>
                  <label className={cn("flex items-center gap-3 px-3 py-2 text-sm", i.periods > 0 ? "cursor-pointer hover:bg-muted" : "opacity-50")}>
                    <input type="checkbox" checked={on} disabled={i.periods === 0} onChange={() => toggle(i.id)} className="h-4 w-4 accent-primary" />
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{i.periods > 0 ? `${i.periods} คาบ` : "ยังไม่มีคาบ"}</span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">ไม่พบรายการ</li>}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
