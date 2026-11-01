import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { profileFullName, type ProfileWithRoles } from "@/lib/database.types";
import { ChevronForward, PaletteIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Avatar, Skeleton, Spinner } from "@/components/ui";
import { useActiveAcademicYear, useActiveTerm, useAcademicEvents } from "@/hooks/useAcademicTerms";
import { useHomeroomClassrooms } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePeriodAttendanceTakenSet } from "@/hooks/usePeriodAttendance";
import { useDepartmentPeriods } from "@/hooks/usePeriodDefinitions";
import { useDepartments, useRoleSubtitle } from "@/hooks/useProfiles";
import { avatarUrl } from "@/hooks/useAvatar";
import { useTeacherSchedule, type ScheduleEntryRow } from "@/hooks/useSchedule";
import { useSchoolSettings } from "@/hooks/useSettings";
import { useClockIn, useClockOut, useMyTimeClock } from "@/hooks/useTimeClock";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { usePendingStudentLeaveApprovals, useSetStudentLeaveStatus } from "@/hooks/useStudentLeave";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { supabase } from "@/lib/supabase";
import { cn, todayIso } from "@/lib/utils";
import { AssemblyAttendanceSheet } from "@/routes/AssemblyAttendanceSheet";
import { QuickClockSection } from "@/routes/Dashboard";
import { bangkokTime } from "@/routes/TimeTracking";
import { TeacherTimetable } from "@/routes/Timetable";

// Teacher home: "what do I teach today" first, open work second. Cards are widget-style (macOS).

const WIDGET = "min-w-0 rounded-[24px] bg-card text-card-foreground shadow-card";
const SECTION_LABEL = "px-1 text-[13px] font-medium text-muted-foreground";
// Banner gradient: five colours laid out as soft blobs; the teacher picks a preset or tunes the colours.
const BANNER_PRESETS: { name: string; colors: string[] }[] = [
  { name: "พระอาทิตย์ตก", colors: ["#ff9a3c", "#ffd86b", "#ff7a8a", "#5ad6e8", "#7ee8d0"] },
  { name: "ชมพูหวาน", colors: ["#ff6fae", "#ffc2dc", "#ff8fb8", "#c9a7ff", "#ffd6e8"] },
  { name: "มหาสมุทร", colors: ["#2f80ed", "#56ccf2", "#6ee7d0", "#a5b4fc", "#38bdf8"] },
  { name: "ป่าเขียว", colors: ["#16a34a", "#a3e635", "#34d399", "#fde68a", "#2dd4bf"] },
  { name: "ม่วงยามค่ำ", colors: ["#7c3aed", "#c084fc", "#f472b6", "#60a5fa", "#a78bfa"] },
  { name: "เงินเมทัลลิก", colors: ["#e5e7eb", "#9ca3af", "#f9fafb", "#6b7280", "#d1d5db"] },
];
const BANNER_POS = ["0% 10%", "38% 100%", "62% 60%", "85% 0%", "100% 100%"];
const bannerBackground = (c: string[]) => ({
  backgroundColor: c[0],
  backgroundImage: c.map((col, i) => `radial-gradient(38% 120% at ${BANNER_POS[i]}, ${col}, transparent 70%)`).join(", "),
});
// ponytail: stored per device in localStorage — move to a profiles column if it should follow the teacher across devices
function useBannerColors(profileId: string) {
  const key = `helix:home-banner:${profileId}`;
  const [colors, setColors] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (Array.isArray(saved) && saved.length === 5 && saved.every((c) => typeof c === "string")) return saved;
    } catch {
      /* private mode or corrupt value: fall back to the default */
    }
    return BANNER_PRESETS[0]!.colors;
  });
  const update = (next: string[]) => {
    setColors(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* not persisted this session */
    }
  };
  return [colors, update] as const;
}

/** ISO yyyy-mm-dd → "14 ต.ค." (formatted in UTC so the day never shifts). */
const leaveDate = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const DAY_NAME = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const toMin = (hms: string) => Number(hms.slice(0, 2)) * 60 + Number(hms.slice(3, 5));
const hhmm = (hms: string) => hms.slice(0, 5);

function bangkokMinutes(d: Date) {
  const [h = 0, m = 0] = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" })
    .format(d)
    .split(":")
    .map(Number);
  return h * 60 + m;
}

function useNowMinutes() {
  const [now, setNow] = useState(() => bangkokMinutes(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(bangkokMinutes(new Date())), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function TeacherHome({ me }: { me: ProfileWithRoles }) {
  const departmentId = me.department_id ?? "";
  const today = todayIso();
  const nowMin = useNowMinutes();
  const [bannerColors, setBannerColors] = useBannerColors(me.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [assemblyOpen, setAssemblyOpen] = useState(false);
  const setLeaveStatus = useSetStudentLeaveStatus();
  const toast = useToast();
  const { data: clock, isLoading: loadingClock } = useMyTimeClock(me.id, today);
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const clockArgs = { profileId: me.id, departmentId: me.department_id, date: today };
  const onClock = (kind: "in" | "out") =>
    (kind === "in" ? clockIn : clockOut).mutate(clockArgs, {
      onSuccess: () => {
        const at = bangkokTime(new Date().toISOString());
        toast(kind === "in" ? `เข้างานเรียบร้อย เวลา ${at} น.` : `ออกงานเรียบร้อย เวลา ${at} น.`);
      },
      onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
    });
  const roleSubtitle = useRoleSubtitle(me.id, me.roles);

  const { data: departments = [] } = useDepartments();
  const splitsByTerm = departments.find((d) => d.id === departmentId)?.code === "SEC";
  const { data: activeYear } = useActiveAcademicYear(departmentId || null, { includeUpcoming: false });
  const academicYear = activeYear ?? new Date().getFullYear() + 543;
  const { data: activeTerm } = useActiveTerm(departmentId || null);
  const scheduleTerm = splitsByTerm ? (activeTerm?.term_type === "term2" ? 2 : 1) : null;

  const { data: entries = [], isLoading: loadingEntries } = useTeacherSchedule(me.id, academicYear, scheduleTerm);
  // ponytail: department default periods only — a grade with its own override can show slightly different times; read per-grade periods if that matters
  const { data: periods = [], isLoading: loadingPeriods } = useDepartmentPeriods(departmentId || null);
  const { data: events = [] } = useAcademicEvents();
  const { data: subjects = [] } = useSubjects({
    search: "",
    departmentId,
    learningAreaId: "",
    gradeLevelId: "",
    term: "",
    subjectType: "",
    includeInactive: true,
  });
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId || null);
  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const colors = useSubjectColors(gradeLevels);
  const { data: schoolSettings } = useSchoolSettings();
  const showClock = !!schoolSettings?.time_tracking_roles.some((r) => me.roles.includes(r));

  const isHoliday = (iso: string) =>
    events.some(
      (e) =>
        (e.event_type === "holiday" || e.event_type === "suspended") &&
        e.start_date <= iso &&
        iso <= e.end_date &&
        (e.departmentIds.length === 0 || e.departmentIds.includes(departmentId)),
    );

  // First teaching day from today on (a holiday or empty day rolls forward).
  const shown = useMemo(() => {
    for (let offset = 0; offset <= 14; offset++) {
      const iso = addDays(today, offset);
      const day = weekdayOf(iso);
      if (isHoliday(iso) || !entries.some((e) => e.day_of_week === day)) continue;
      return { iso, offset, day };
    }
    return null;
  }, [today, entries, events]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = shown?.offset === 0;
  const dayEntries = useMemo(
    () => (shown ? entries.filter((e) => e.day_of_week === shown.day).sort((a, b) => a.period_no - b.period_no) : []),
    [entries, shown],
  );
  const slotOf = (e: ScheduleEntryRow) =>
    periods.find((p) => p.day_of_week === e.day_of_week && p.period_no === e.period_no && p.period_type === "teaching");
  const timed = dayEntries.flatMap((e) => {
    const slot = slotOf(e);
    return slot ? [{ entry: e, start: toMin(slot.start_time), end: toMin(slot.end_time), startText: hhmm(slot.start_time), endText: hhmm(slot.end_time) }] : [];
  });

  const { data: takenSet = new Set<string>() } = usePeriodAttendanceTakenSet(
    isToday ? dayEntries.map((e) => e.id) : [],
    today,
  );

  const subjectOf = (id: string) => subjects.find((s) => s.id === id);
  const roomLabel = (classroomId: string) => {
    const c = classrooms.find((x) => x.id === classroomId);
    const g = gradeLevels.find((x) => x.id === c?.grade_level_id)?.code;
    return c ? `${g ? gradeShortLabel(g) : "—"}/${c.name}` : "—";
  };
  const styleOf = (e: ScheduleEntryRow) => {
    const area = subjectOf(e.teaching_assignment.subject_id)?.learning_area_id;
    const grade = classrooms.find((c) => c.id === e.teaching_assignment.classroom_id)?.grade_level_id;
    return { gradient: colors.gradient(area, grade), hex: colors.hex(area, grade) };
  };

  const current = isToday ? timed.find((t) => t.start <= nowMin && nowMin < t.end) : undefined;

  // Back of the "เช็คชื่อรายคาบ" tile: the period in progress, else the next one — rolling to the next teaching day when today is done.
  const upNext = (() => {
    for (let offset = 0; offset <= 14; offset++) {
      const iso = addDays(today, offset);
      const day = weekdayOf(iso);
      if (isHoliday(iso)) continue;
      const first = entries
        .filter((e) => e.day_of_week === day)
        .sort((a, b) => a.period_no - b.period_no)
        .flatMap((e) => {
          const slot = periods.find((p) => p.day_of_week === day && p.period_no === e.period_no && p.period_type === "teaching");
          return slot ? [{ entry: e, start: toMin(slot.start_time), end: toMin(slot.end_time), startText: hhmm(slot.start_time), endText: hhmm(slot.end_time) }] : [];
        })
        .find((t) => offset > 0 || t.end > nowMin);
      if (!first) continue;
      const ordinal = periods.filter((p) => p.day_of_week === day && p.period_type === "teaching" && p.period_no <= first.entry.period_no).length;
      const label =
        offset === 0
          ? first.start <= nowMin
            ? "กำลังสอน"
            : "คาบถัดไป"
          : `${offset === 1 ? "พรุ่งนี้" : DAY_NAME[day]} · คาบ ${ordinal}`;
      return { ...first, label };
    }
    return null;
  })();

  const taught = [...new Map(
    entries.flatMap((e) => {
      const sub = subjectOf(e.teaching_assignment.subject_id);
      return sub ? [[sub.code, { code: sub.code, area: sub.learning_area_id }] as const] : [];
    }),
  ).values()].sort((a, b) => a.code.localeCompare(b.code, "th"));

  // ---- open work
  const unchecked = isToday ? timed.filter((t) => t.start <= nowMin && !takenSet.has(t.entry.id)).length : 0;
  const { data: homerooms = [] } = useHomeroomClassrooms(me.id, academicYear);
  const homeroomIds = homerooms.map((h) => h.id);
  const assemblyDay = weekdayOf(today) >= 1 && weekdayOf(today) <= 5 && !isHoliday(today);
  const { data: assemblyDone } = useQuery({
    queryKey: ["attendance_records", "assembly_done", homeroomIds, today],
    enabled: homeroomIds.length > 0 && assemblyDay,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("classroom_id")
        .in("classroom_id", homeroomIds)
        .eq("date", today);
      if (error) throw error;
      return new Set(data.map((r) => r.classroom_id));
    },
  });
  const assemblyPending = assemblyDone ? homerooms.filter((h) => !assemblyDone.has(h.id)) : [];
  const { data: pendingLeave = [] } = usePendingStudentLeaveApprovals();

  async function approveAllLeave() {
    if (!confirm(`อนุมัติใบลา ${pendingLeave.length} ใบทั้งหมดหรือไม่?`)) return;
    const results = await Promise.allSettled(
      pendingLeave.map((l) => setLeaveStatus.mutateAsync({ id: l.id, status: "approved", approvedBy: me.id })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast(`อนุมัติใบลา ${results.length} ใบเรียบร้อย`);
      setLeaveOpen(false);
    } else {
      toast(`อนุมัติสำเร็จ ${results.length - failed} ใบ ไม่สำเร็จ ${failed} ใบ`, "error");
    }
  }

  const work = [
    ...(unchecked > 0 ? [{ key: "periods", label: "คาบที่ยังไม่เช็คชื่อ", count: unchecked, to: "/period-attendance" }] : []),
    ...assemblyPending.map((h) => ({ key: `assembly-${h.id}`, label: `เช็คชื่อเข้าแถว ${roomLabel(h.id)}`, count: null, to: "/attendance" })),
    ...(pendingLeave.length > 0 ? [{ key: "leave", label: "ใบลาที่รออนุมัติ", count: pendingLeave.length, to: "/attendance" }] : []),
  ];

  const loading = loadingEntries || loadingPeriods;
  const heading = !shown ? "วันนี้" : shown.offset === 0 ? "วันนี้" : shown.offset === 1 ? "พรุ่งนี้" : `วัน${DAY_NAME[shown.day]}`;
  const dateText = new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${(shown?.iso ?? today)}T00:00:00Z`),
  );

  return (
    <div>
      <div className="mb-4 lg:hidden">
        <h1 className="font-heading text-[32px] font-bold leading-tight tracking-[-0.02em]">{heading}</h1>
        <p className="text-sm text-muted-foreground">{dateText}</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={cn(WIDGET, "relative hidden overflow-hidden lg:col-span-2 lg:block")}>
          <div className="relative h-36" style={bannerBackground(bannerColors)}>
            <button
              type="button"
              aria-label="เปลี่ยนสีพื้นหลังการ์ด"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-neutral-800 shadow-card transition-transform hover:bg-white active:scale-95"
            >
              <PaletteIcon className="h-4 w-4" />
            </button>
            {pickerOpen && (
              <>
                <button type="button" aria-label="ปิด" className="fixed inset-0 z-10 cursor-default" onClick={() => setPickerOpen(false)} />
                <div className="absolute right-3 top-14 z-20 w-72 space-y-3 rounded-2xl bg-card p-3 text-card-foreground shadow-lg ring-1 ring-border">
                  <p className="text-sm font-semibold">สีพื้นหลังการ์ด</p>
                  <div className="grid grid-cols-3 gap-2">
                    {BANNER_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        title={p.name}
                        aria-label={p.name}
                        onClick={() => setBannerColors(p.colors)}
                        className={cn(
                          "h-10 rounded-xl ring-offset-2 ring-offset-card transition-shadow",
                          p.colors.join() === bannerColors.join() && "ring-2 ring-accent",
                        )}
                        style={bannerBackground(p.colors)}
                      />
                    ))}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">ปรับสีเอง</p>
                    <div className="flex gap-2">
                      {bannerColors.map((c, i) => (
                        <input
                          key={i}
                          type="color"
                          value={c}
                          aria-label={`สีที่ ${i + 1}`}
                          onChange={(e) => setBannerColors(bannerColors.map((x, k) => (k === i ? e.target.value : x)))}
                          className="h-8 w-full min-w-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,26rem)] gap-8 px-8 pb-8">
            <div className="min-w-0">
              <Avatar
                name={profileFullName(me)}
                src={avatarUrl(me)}
                className={cn("relative z-10 -mt-14 h-28 w-28 text-4xl ring-4", me.line_user_id ? "ring-[#06C755]" : "ring-card")}
              />
              <h1 className="font-heading mt-3 truncate text-3xl font-bold tracking-[-0.02em]">{profileFullName(me)}</h1>
              <p className="mt-1 truncate text-base text-muted-foreground">{me.email || "ยังไม่ได้ระบุอีเมล"}</p>
              {homerooms.length > 0 && (
                <p className="truncate text-base text-muted-foreground">ครูที่ปรึกษา {homerooms.map((h) => roomLabel(h.id)).join(", ")}</p>
              )}
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTimetableOpen(true)}
                  className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  ตารางสอน
                </button>
                <Link
                  to="/profile"
                  className="inline-flex h-11 items-center rounded-full border border-input px-6 text-[15px] font-medium transition-colors hover:bg-muted active:scale-[0.98]"
                >
                  โปรไฟล์
                </Link>
              </div>
            </div>
            <div className="flex flex-col items-end gap-4 pt-5 text-right">
              <div>
                <p className="text-sm text-muted-foreground">ตำแหน่ง</p>
                <div className="mt-1.5 flex flex-wrap justify-end gap-2">
                  {roleSubtitle
                    .split(", ")
                    .filter(Boolean)
                    .map((role) => (
                      <span key={role} className="rounded-full bg-muted px-4 py-1.5 text-sm font-medium">
                        {role}
                      </span>
                    ))}
                </div>
              </div>
              {taught.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">วิชาที่สอน</p>
                  <div className="mt-1.5 flex flex-wrap justify-end gap-2">
                    {taught.slice(0, 6).map((t) => (
                      <span key={t.code} className={cn("rounded-full px-3 py-1 text-sm font-medium", colors.shade(t.area))}>
                        {t.code}
                      </span>
                    ))}
                    {taught.length > 6 && <span className="rounded-full bg-muted px-3 py-1 text-sm">+{taught.length - 6}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={cn("grid items-stretch gap-3 px-8 pb-8", showClock ? "grid-cols-4" : "grid-cols-3")}>
            {[
              ...(showClock
                ? [
                    {
                      title: clock?.clock_out_time ? "ลงเวลาแล้ว" : clock?.clock_in_time ? "ออกงาน" : "เข้างาน",
                      text: clock?.clock_out_time
                        ? `เข้า ${bangkokTime(clock.clock_in_time ?? clock.clock_out_time)} · ออก ${bangkokTime(clock.clock_out_time)}`
                        : clock?.clock_in_time
                          ? `เข้างานเวลา ${bangkokTime(clock.clock_in_time)}`
                          : "ยังไม่ได้บันทึกเวลาเข้างาน",
                      busy: clockIn.isPending || clockOut.isPending,
                      disabled: loadingClock || !!clock?.clock_out_time,
                      onClick: () => onClock(clock?.clock_in_time ? "out" : "in"),
                    },
                  ]
                : []),
              { title: "เช็คชื่อรายคาบ", text: unchecked > 0 ? `วันนี้ยังไม่เช็ค ${unchecked} คาบ` : "ไม่มีคาบค้างเช็คชื่อ", to: "/period-attendance", flip: true },
              {
                title: "ใบลารออนุมัติ",
                text: pendingLeave.length > 0 ? `มี ${pendingLeave.length} ใบรอการอนุมัติ` : "ไม่มีใบลาค้าง",
                busy: false,
                disabled: false,
                onClick: () => setLeaveOpen(true),
              },
              {
                title: "เช็คชื่อหน้าเสาธง",
                text:
                  homerooms.length === 0
                    ? "ไม่ได้เป็นครูที่ปรึกษา"
                    : !assemblyDay
                      ? "วันนี้ไม่มีเข้าแถว"
                      : assemblyPending.length > 0
                        ? `ยังไม่เช็ค ${assemblyPending.map((h) => roomLabel(h.id)).join(", ")}`
                        : "เช็คชื่อเรียบร้อยแล้ว",
                busy: false,
                disabled: false,
                onClick: () => setAssemblyOpen(true),
              },
            ].map((t) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{t.title}</span>
                    <span className="block text-sm text-muted-foreground">{t.text}</span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent">
                    {"busy" in t && t.busy ? <Spinner className="h-4 w-4" /> : <ChevronForward className="h-4 w-4" />}
                  </span>
                </>
              );
              const cls = "flex h-full items-center gap-3 rounded-2xl bg-muted/70 p-4 text-left transition-colors hover:bg-muted";
              if ("flip" in t && upNext) {
                const sub = subjectOf(upNext.entry.teaching_assignment.subject_id);
                return (
                  <FlipTile
                    key={t.title}
                    front={
                      <Link to={t.to ?? "/period-attendance"} className={cls}>
                        {body}
                      </Link>
                    }
                    back={
                      <Link
                        to={`/period-attendance?entry=${upNext.entry.id}`}
                        className={cn("flex h-full items-center gap-3 rounded-2xl p-4 text-left", styleOf(upNext.entry).gradient)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium opacity-70">{upNext.label}</span>
                          <span className="block truncate text-[15px] font-semibold">{sub?.name_th ?? "—"}</span>
                          <span className="block truncate text-sm opacity-80">
                            {sub?.code} · {roomLabel(upNext.entry.teaching_assignment.classroom_id)} · {upNext.startText}–{upNext.endText}
                          </span>
                        </span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-current">
                          <ChevronForward className="h-4 w-4" />
                        </span>
                      </Link>
                    }
                  />
                );
              }
              return "onClick" in t ? (
                <button key={t.title} type="button" disabled={t.disabled || t.busy} onClick={t.onClick} className={cn(cls, "disabled:opacity-60")}>
                  {body}
                </button>
              ) : (
                <Link key={t.title} to={t.to} className={cls}>
                  {body}
                </Link>
              );
            })}
          </div>
        </section>
        {showClock && (
          <div className={cn(WIDGET, "p-4 md:p-5 lg:hidden")}>
            <QuickClockSection profileId={me.id} departmentId={me.department_id} />
          </div>
        )}

        <section className="space-y-2 lg:col-start-1 lg:row-start-2">
          <h2 className={SECTION_LABEL}>
            <span className="hidden lg:inline">
              คาบสอน · {heading} · {dateText}
            </span>
            <span className="lg:hidden">คาบสอน</span>
          </h2>
          {loading ? (
            <div role="status" aria-label="กำลังโหลด" className={cn(WIDGET, "space-y-3 p-4")}>
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !shown ? (
            <div className={cn(WIDGET, "px-4 py-12 text-center text-sm text-muted-foreground")}>ยังไม่มีคาบสอนใน 2 สัปดาห์ข้างหน้า</div>
          ) : (
            <>
              {current && (
                <Link
                  to={`/period-attendance?entry=${current.entry.id}`}
                  className={cn(
                    "relative isolate block overflow-hidden rounded-[24px] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_12px_32px_-8px_rgb(0_0_0/0.25)] transition-transform active:scale-[0.99] md:p-5",
                    styleOf(current.entry).gradient,
                  )}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/45 via-transparent to-transparent"
                  />
                  <p className="relative text-xs font-medium opacity-70">
                    กำลังสอน · {current.startText}–{current.endText} · เหลือ {current.end - nowMin} นาที
                  </p>
                  <p className="mt-1 text-xl font-bold leading-snug">
                    {subjectOf(current.entry.teaching_assignment.subject_id)?.name_th ?? "—"}
                  </p>
                  <p className="text-sm opacity-80">
                    {subjectOf(current.entry.teaching_assignment.subject_id)?.code} · {roomLabel(current.entry.teaching_assignment.classroom_id)}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div
                      className="h-full rounded-full bg-current opacity-60"
                      style={{ width: `${Math.min(100, ((nowMin - current.start) / (current.end - current.start)) * 100)}%` }}
                    />
                  </div>
                  <span className="mt-3 inline-flex h-8 items-center rounded-full bg-black/80 px-4 text-sm font-medium text-white dark:bg-white/90 dark:text-black">
                    {takenSet.has(current.entry.id) ? "ดูการเช็คชื่อ" : "เช็คชื่อ"}
                  </span>
                </Link>
              )}

              <ul className={cn(WIDGET, "divide-y divide-border/60 overflow-hidden")}>
                {timed
                  .filter((t) => t !== current)
                  .map((t) => {
                    const past = isToday && t.end <= nowMin;
                    const taken = takenSet.has(t.entry.id);
                    const subject = subjectOf(t.entry.teaching_assignment.subject_id);
                    return (
                      <li key={t.entry.id}>
                        <Link
                          to={`/period-attendance?entry=${t.entry.id}`}
                          className={cn(
                            "flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 active:bg-muted",
                            past && taken && "opacity-55",
                          )}
                        >
                          <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {t.startText}
                          </span>
                          <span
                            aria-hidden
                            className="h-8 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: styleOf(t.entry).hex }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium">{subject?.name_th ?? "—"}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {subject?.code} · {roomLabel(t.entry.teaching_assignment.classroom_id)}
                            </span>
                          </span>
                          {isToday && (taken || past) && (
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                taken ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                              )}
                            >
                              {taken ? "เช็คแล้ว" : "ยังไม่เช็ค"}
                            </span>
                          )}
                          <ChevronForward className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </section>

        {work.length > 0 && (
          <section className="space-y-2 lg:col-start-2 lg:row-start-2">
            <h2 className={SECTION_LABEL}>งานค้าง</h2>
            <ul className={cn(WIDGET, "divide-y divide-border/60 overflow-hidden")}>
              {work.map((w) => (
                <li key={w.key}>
                  <Link
                    to={w.to}
                    className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-[15px] transition-colors hover:bg-muted/50 active:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">{w.label}</span>
                    {w.count !== null && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-warning">
                        {w.count}
                      </span>
                    )}
                    <ChevronForward className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <AssemblyAttendanceSheet
        open={assemblyOpen}
        onOpenChange={setAssemblyOpen}
        homerooms={homerooms}
        academicYear={academicYear}
        departmentId={departmentId}
        recorderId={me.id}
        date={today}
        roomLabel={roomLabel}
      />

      <Modal
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="ใบลารออนุมัติ"
        description={pendingLeave.length > 0 ? `นักเรียนที่รออนุมัติ ${pendingLeave.length} ใบ` : undefined}
        footer={
          <button
            type="button"
            disabled={pendingLeave.length === 0 || setLeaveStatus.isPending}
            onClick={approveAllLeave}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {setLeaveStatus.isPending && <Spinner className="h-4 w-4" />}
            อนุมัติทั้งหมด{pendingLeave.length > 0 && ` (${pendingLeave.length})`}
          </button>
        }
      >
        {pendingLeave.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีใบลาค้าง</p>
        ) : (
          <ul className="-my-1 divide-y divide-border">
            {pendingLeave.map((l) => (
              <li key={l.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-[15px] font-semibold">
                    {l.student ? `${l.student.first_name} ${l.student.last_name}` : "—"}
                  </p>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{l.student?.student_code}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {leaveDate(l.start_date)}
                  {l.end_date !== l.start_date && ` – ${leaveDate(l.end_date)}`} · {l.days} วัน
                </p>
                {l.reason && <p className="mt-0.5 text-sm">{l.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={timetableOpen}
        onOpenChange={setTimetableOpen}
        title="ตารางสอน"
        className="max-w-6xl"
      >
        {timetableOpen && (
          <div className="overflow-auto p-4">
            <TeacherTimetable
              departmentId={departmentId}
              teacherId={me.id}
              academicYear={academicYear}
              term={scheduleTerm}
              mayEdit={false}
              classrooms={classrooms}
              gradeLevels={gradeLevels}
              teachers={[]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Two faces of one tile; flips about the horizontal axis every few seconds, paused while hovered or when motion is reduced. */
function FlipTile({ front, back }: { front: React.ReactNode; back: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || paused) return;
    const t = setInterval(() => setFlipped((f) => !f), 5000);
    return () => clearInterval(t);
  }, [reduce, paused]);

  const face = "h-full [grid-area:1/1] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]";
  return (
    <div className="h-full [perspective:1000px]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <motion.div
        className="grid h-full [transform-style:preserve-3d]"
        animate={{ rotateX: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className={cn(face, flipped && "pointer-events-none")}>{front}</div>
        <div className={cn(face, !flipped && "pointer-events-none")} style={{ transform: "rotateX(180deg)" }}>
          {back}
        </div>
      </motion.div>
    </div>
  );
}
