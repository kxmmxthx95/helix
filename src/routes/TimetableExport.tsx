import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfilesByIds } from "@/hooks/usePractice";
import { BuildingIcon, Search, ChevronDown, DocumentTextIcon, DownloadIcon, FunnelIcon, InfoIcon, PersonIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Input, Select, Spinner, Switch } from "@/components/ui";
import { avatarUrl } from "@/hooks/useAvatar";
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

/** Grade pill colours, cycled along the department's grade ladder so a grade keeps its colour. */
const GRADE_PILL = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
];

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

  const teacherIds = useMemo(() => [...new Set(entries.flatMap((e) => (e.teaching_assignment.teacher_id ? [e.teaching_assignment.teacher_id] : [])))].sort(), [entries]);
  const { data: entryTeachers = [] } = useProfilesByIds(teacherIds);
  const teacherName = (id: string | null) => {
    if (!id) return "ไม่มีครู";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const roomLabel = (c: Classroom) => {
    const code = gradeLevels.find((g) => g.id === c.grade_level_id)?.code;
    return `${code ? gradeShortLabel(code) : "—"}/${c.name}`;
  };
  const roomById = (id: string) => classrooms.find((c) => c.id === id);

  const subjectOf = (id: string) => subjects.find((s) => s.id === id);

  // Per classroom / teacher: periods per week, and what they are made of (shown when a row is expanded).
  const { countBy, detailBy } = useMemo(() => {
    const count = new Map<string, number>();
    const detail = new Map<string, Map<string, number>>();
    const bump = (id: string, label: string) => {
      count.set(id, (count.get(id) ?? 0) + 1);
      const m = detail.get(id) ?? new Map<string, number>();
      m.set(label, (m.get(label) ?? 0) + 1);
      detail.set(id, m);
    };
    for (const e of entries) {
      const a = e.teaching_assignment;
      const subj = subjectOf(a.subject_id);
      const subjectText = `${subj?.code ?? "—"} ${subj?.name_th ?? ""}`.trim();
      const room = roomById(a.classroom_id);
      bump(a.classroom_id, `${subjectText}${a.teacher_id ? ` · ${teacherName(a.teacher_id)}` : ""}`);
      if (a.teacher_id) bump(a.teacher_id, `${room ? roomLabel(room) : "—"} · ${subjectText}`);
    }
    return { countBy: count, detailBy: detail };
  }, [entries, subjects, classrooms, gradeLevels, teachers, entryTeachers]);

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
            .map((c) => {
              const gradeIdx = gradeLevels.findIndex((g) => g.id === c.grade_level_id);
              const code = gradeLevels[gradeIdx]?.code;
              return {
                id: c.id,
                name: roomLabel(c),
                gradeId: c.grade_level_id,
                pill: code ? gradeShortLabel(code) : "—",
                tone: GRADE_PILL[Math.max(gradeIdx, 0) % GRADE_PILL.length]!,
                profile: null as ProfileRow | null,
              };
            })
        : [...teachers]
            .sort((a, b) => profileFullName(a).localeCompare(profileFullName(b), "th"))
            .map((t) => ({ id: t.id, name: profileFullName(t), gradeId: "", pill: "", tone: "", profile: t as ProfileRow | null }));
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
  /** Select exactly these ids among everything selectable (all the rest are excluded). */
  const selectOnly = (ids: Set<string>) => setExcluded(new Set(items.filter((i) => !ids.has(i.id)).map((i) => i.id)));
  const selectable = items.filter((i) => i.periods > 0);
  const shownSelectable = shown.filter((i) => i.periods > 0);
  const allShownPicked = shownSelectable.length > 0 && shownSelectable.every((i) => !excluded.has(i.id));
  const someShownPicked = shownSelectable.some((i) => !excluded.has(i.id));
  const toggleShown = () =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const i of shownSelectable) allShownPicked ? next.add(i.id) : next.delete(i.id);
      return next;
    });
  const totalPeriods = picked.reduce((sum, i) => sum + i.periods, 0);
  const unit = kind === "classroom" ? "ห้องเรียน" : "ครู";

  // Quick-select dropdown shows what the current selection amounts to: everything, one grade, or custom.
  const grades = gradeLevels.filter((g) => items.some((i) => i.gradeId === g.id && i.periods > 0));
  const quick = (() => {
    if (picked.length === selectable.length) return "all";
    const g = grades.find((g) => {
      const inGrade = selectable.filter((i) => i.gradeId === g.id);
      return inGrade.length === picked.length && inGrade.every((i) => !excluded.has(i.id));
    });
    return g ? g.id : "custom";
  })();
  const onQuick = (v: string) => {
    if (v === "all") selectOnly(new Set(selectable.map((i) => i.id)));
    else if (v !== "custom") selectOnly(new Set(selectable.filter((i) => i.gradeId === v).map((i) => i.id)));
  };
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

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
      icon={<DocumentTextIcon className="h-5 w-5" />}
      closable
      footer={
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl bg-accent/10 p-3 text-xs">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="font-semibold text-accent">รูปแบบไฟล์ PDF</p>
              <p className="text-muted-foreground">
                กระดาษ A4 แนวนอน • หน้าละ 1 ตาราง • แสดงข้อมูล{kind === "classroom" ? "ห้องเรียน" : "ครู"}และคาบทั้งหมดที่เลือก
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
              <Switch checked={colorful} onChange={setColorful} />
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold">พิมพ์สี{colorful ? " (แนะนำ)" : ""}</span>
                <span className="block text-[11px] text-muted-foreground">ถ้าไม่เลือก จะพิมพ์ขาวดำ</span>
              </span>
            </label>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button disabled={busy || loading || picked.length === 0} onClick={() => void exportPdf()}>
              {busy ? <Spinner /> : <DownloadIcon className="h-4 w-4" />}
              ส่งออก {picked.length} ตาราง
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {!fixedClassroomId && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["classroom", "ตารางเรียน (ห้อง)", BuildingIcon],
                ["teacher", "ตารางสอน (ครู)", PersonIcon],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
                  kind === k
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === "classroom" ? "ค้นหาห้องเรียน..." : "ค้นหาครู..."}
              className="pl-9"
              aria-label="ค้นหา"
            />
          </div>
          {kind === "classroom" && grades.length > 1 && (
            <Select className="w-auto min-w-[7.5rem] shrink-0" value={quick} onChange={(e) => onQuick(e.target.value)} aria-label="เลือกตามระดับชั้น">
              <option value="all">เลือกทั้งหมด</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  เฉพาะ {gradeShortLabel(g.code)}
                </option>
              ))}
              {quick === "custom" && (
                <option value="custom" disabled>
                  เลือกเอง
                </option>
              )}
            </Select>
          )}
          <Button variant="outline" className="shrink-0" onClick={() => selectOnly(new Set())}>
            <FunnelIcon className="h-3.5 w-3.5" />
            ล้าง
          </Button>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            aria-label="เลือกทั้งหมดที่แสดง"
            checked={allShownPicked}
            ref={(el) => {
              if (el) el.indeterminate = !allShownPicked && someShownPicked;
            }}
            disabled={shownSelectable.length === 0}
            onChange={toggleShown}
            className="h-4 w-4 accent-primary"
          />
          <span className="flex-1">
            เลือกแล้ว <b className="text-accent">{picked.length}</b> จาก <b className="text-accent">{selectable.length}</b> {unit}
          </span>
          <span className="text-xs text-muted-foreground">รวม {totalPeriods} คาบ</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((i) => {
              const on = i.periods > 0 && !excluded.has(i.id);
              const open = expanded.has(i.id);
              const detail = [...(detailBy.get(i.id) ?? [])].sort(([a], [b]) => a.localeCompare(b, "th", { numeric: true }));
              return (
                <li key={i.id} className={cn("rounded-xl border border-border", i.periods === 0 && "opacity-50")}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <label className={cn("flex min-w-0 flex-1 items-center gap-3", i.periods > 0 && "cursor-pointer")}>
                      <input type="checkbox" checked={on} disabled={i.periods === 0} onChange={() => toggle(i.id)} className="h-4 w-4 shrink-0 accent-primary" />
                      {i.profile ? (
                        <Avatar name={i.name} src={avatarUrl(i.profile)} className="h-10 w-10" />
                      ) : (
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold", i.tone)}>{i.pill}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</span>
                    </label>
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {i.periods > 0 ? `${i.periods} คาบ` : "ยังไม่มีคาบ"}
                    </span>
                    <button
                      type="button"
                      aria-label={open ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                      aria-expanded={open}
                      disabled={i.periods === 0}
                      onClick={() => toggleExpanded(i.id)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted disabled:invisible"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                    </button>
                  </div>
                  {open && (
                    <ul className="space-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      {detail.map(([label, n]) => (
                        <li key={label} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">{label}</span>
                          <span className="shrink-0">{n} คาบ</span>
                        </li>
                      ))}
                    </ul>
                  )}
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
