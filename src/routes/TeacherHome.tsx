import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { profileFullName, type Profile, type ProfileWithRoles } from "@/lib/database.types";
import { BarChartIcon, CheckmarkCircleIcon, ChevronForward, DocumentTextIcon, LockIcon, PaletteIcon } from "@/components/icons";
import { BannerUpload } from "@/components/BannerUpload";
import { BannerAdjustOverlay, useBannerAdjust } from "@/components/BannerAdjust";
import { HoldButton } from "@/components/HoldButton";
import { NewLeaveSheet } from "@/routes/NewLeaveSheet";
import { Modal } from "@/components/Modal";
import { Sheet, usePhone } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Spinner } from "@/components/ui";
import { useActiveAcademicYear, useActiveTerm, useAcademicEvents } from "@/hooks/useAcademicTerms";
import { useHomeroomClassrooms } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePeriodAttendanceTakenSet } from "@/hooks/usePeriodAttendance";
import { useDepartmentPeriods } from "@/hooks/usePeriodDefinitions";
import { useDepartments, useRoleSubtitle } from "@/hooks/useProfiles";
import { avatarUrl, bannerUrl, studentAvatarUrl } from "@/hooks/useAvatar";
import { useTeacherSchedule, type ScheduleEntryRow } from "@/hooks/useSchedule";
import { useDepartmentSettings, useSchoolSettings } from "@/hooks/useSettings";
import { bangkokMinutes, clockGate, clockHoliday, useClockIn, useClockOut, useMyTimeClock } from "@/hooks/useTimeClock";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { usePendingStudentLeaveApprovals, useSetStudentLeaveStatus } from "@/hooks/useStudentLeave";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { supabase } from "@/lib/supabase";
import { cn, todayIso } from "@/lib/utils";
import { AssemblyAttendanceSheet } from "@/routes/AssemblyAttendanceSheet";
import { CoverTasks } from "@/routes/CoverTasks";
import { useMyCovers } from "@/hooks/useAttendanceCovers";
import { LineLinkCard } from "@/routes/Profile";
import { StaffClockStatsSheet } from "@/routes/StaffClockStatsSheet";
import { PeriodDaySheet, type DayPeriod, type SheetDay } from "@/routes/PeriodDaySheet";
import { bangkokTime } from "@/routes/TimeTracking";
import { TeacherTimetable } from "@/routes/Timetable";

// Teacher home: "what do I teach today" first, open work second. Cards are widget-style (macOS).

const WIDGET = "min-w-0 rounded-[24px] bg-card text-card-foreground shadow-card";
// Banner gradient: five colours laid out as soft blobs; the teacher picks a preset or tunes the colours.
export const BANNER_PRESETS: { name: string; colors: string[] }[] = [
  { name: "พระอาทิตย์ตก", colors: ["#ff9a3c", "#ffd86b", "#ff7a8a", "#5ad6e8", "#7ee8d0"] },
  { name: "ชมพูหวาน", colors: ["#ff6fae", "#ffc2dc", "#ff8fb8", "#c9a7ff", "#ffd6e8"] },
  { name: "มหาสมุทร", colors: ["#2f80ed", "#56ccf2", "#6ee7d0", "#a5b4fc", "#38bdf8"] },
  { name: "ป่าเขียว", colors: ["#16a34a", "#a3e635", "#34d399", "#fde68a", "#2dd4bf"] },
  { name: "ม่วงยามค่ำ", colors: ["#7c3aed", "#c084fc", "#f472b6", "#60a5fa", "#a78bfa"] },
  { name: "เงินเมทัลลิก", colors: ["#e5e7eb", "#9ca3af", "#f9fafb", "#6b7280", "#d1d5db"] },
];
const BANNER_POS = ["0% 10%", "38% 100%", "62% 60%", "85% 0%", "100% 100%"];
export const bannerBackground = (c: string[]) => ({
  backgroundColor: c[0],
  backgroundImage: c.map((col, i) => `radial-gradient(38% 120% at ${BANNER_POS[i]}, ${col}, transparent 70%)`).join(", "),
});
/** Uploaded cover wins over the gradient. */
export const bannerStyle = (
  profile: Pick<Profile, "banner_path" | "updated_at" | "banner_focus_x" | "banner_focus_y">,
  colors: string[],
  focus?: { x: number; y: number }, // live value while the user is dragging
): React.CSSProperties => {
  const url = bannerUrl(profile);
  const f = focus ?? { x: profile.banner_focus_x, y: profile.banner_focus_y };
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: `${f.x}% ${f.y}%` } : bannerBackground(colors);
};
// ponytail: stored per device in localStorage — move to a profiles column if it should follow the teacher across devices
export function useBannerColors(profileId: string) {
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

function useNowMinutes() {
  const [now, setNow] = useState(() => bangkokMinutes(new Date()));
  useEffect(() => {
    const tick = () => setNow(bangkokMinutes(new Date()));
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick); // timers pause while the tab/PWA is backgrounded
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

export function TeacherHome({ me }: { me: ProfileWithRoles }) {
  const departmentId = me.department_id ?? "";
  const today = todayIso();
  const nowMin = useNowMinutes();
  const [bannerColors, setBannerColors] = useBannerColors(me.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const adjust = useBannerAdjust(me);
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const phone = usePhone();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [newLeaveOpen, setNewLeaveOpen] = useState(false);
  const [leaveRevealed, setLeaveRevealed] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [assemblyOpen, setAssemblyOpen] = useState(false);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const setLeaveStatus = useSetStudentLeaveStatus();
  const toast = useToast();
  const { data: clock, isLoading: loadingClock } = useMyTimeClock(me.id, today);
  const { data: deptSettings } = useDepartmentSettings(me.department_id);
  const { data: events = [] } = useAcademicEvents();
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
  // ponytail: after clock-in the card stays locked until work_end_time (no end time set = no lock)
  // Holiday locks clock-in only; an open record can still clock out.
  const holidayLock = clock?.clock_in_time ? null : clockHoliday(today, events.filter((e) => e.start_date <= today && today <= e.end_date), me.department_id);
  const clockLock = clock?.clock_out_time ? null : holidayLock ?? clockGate(clock?.clock_in_time ? "out" : "in", deptSettings, nowMin);
  const roleSubtitle = useRoleSubtitle(me.id, me.roles);

  const { data: departments = [] } = useDepartments();
  const splitsByTerm = departments.find((d) => d.id === departmentId)?.code === "SEC";
  const { data: activeYear } = useActiveAcademicYear(departmentId || null, { includeUpcoming: false });
  const academicYear = activeYear ?? new Date().getFullYear() + 543;
  const { data: activeTerm } = useActiveTerm(departmentId || null);
  const scheduleTerm = splitsByTerm ? (activeTerm?.term_type === "term2" ? 2 : 1) : null;

  const { data: entries = [] } = useTeacherSchedule(me.id, academicYear, scheduleTerm);
  // ponytail: department default periods only — a grade with its own override can show slightly different times; read per-grade periods if that matters
  const { data: periods = [] } = useDepartmentPeriods(departmentId || null);
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

  const ordinalOf = (day: number, periodNo: number) =>
    periods.filter((p) => p.day_of_week === day && p.period_type === "teaching" && p.period_no <= periodNo).length;
  const timedOf = (iso: string) => {
    const day = weekdayOf(iso);
    return entries
      .filter((e) => e.day_of_week === day)
      .sort((a, b) => a.period_no - b.period_no)
      .flatMap((e) => {
        const slot = periods.find((p) => p.day_of_week === day && p.period_no === e.period_no && p.period_type === "teaching");
        return slot ? [{ entry: e, start: toMin(slot.start_time), end: toMin(slot.end_time), startText: hhmm(slot.start_time), endText: hhmm(slot.end_time) }] : [];
      });
  };
  // The sheet lists the whole day, not just the next period.
  const periodsOf = (iso: string): DayPeriod[] =>
    timedOf(iso).map((t) => {
      const sub = subjectOf(t.entry.teaching_assignment.subject_id);
      return {
        entryId: t.entry.id,
        classroomId: t.entry.teaching_assignment.classroom_id,
        ordinal: ordinalOf(weekdayOf(iso), t.entry.period_no),
        time: `${t.startText}–${t.endText}`,
        subjectCode: sub?.code ?? "—",
        subjectName: sub?.name_th ?? "—",
        room: roomLabel(t.entry.teaching_assignment.classroom_id),
        gradient: styleOf(t.entry).gradient,
        hex: styleOf(t.entry).hex,
      };
    });

  // Back of the "เช็คชื่อเข้าเรียน" tile: the period in progress, else the next one — rolling to the next teaching day when today is done.
  const upNext = (() => {
    for (let offset = 0; offset <= 14; offset++) {
      const iso = addDays(today, offset);
      const day = weekdayOf(iso);
      if (isHoliday(iso)) continue;
      const first = timedOf(iso).find((t) => offset > 0 || t.end > nowMin);
      if (!first) continue;
      const label =
        offset === 0
          ? first.start <= nowMin
            ? "กำลังสอน"
            : "คาบถัดไป"
          : `${offset === 1 ? "พรุ่งนี้" : DAY_NAME[day]} · คาบ ${ordinalOf(day, first.entry.period_no)}`;
      return { ...first, label, iso };
    }
    return null;
  })();

  // Drawer: today's periods only (missed ones stay reachable after school hours).
  // ครูแทน (migration 0139): today's confirmed covers join the same drawers. Their classrooms/subjects can be
  // outside this teacher's department, so labels come from the RPC rather than the department-scoped lookups.
  const { data: covers = [] } = useMyCovers(today, addDays(today, 14));
  const todayCovers = covers.filter((c) => c.status === "confirmed" && c.date === today && c.leave_status === "approved");
  const coverPeriods = todayCovers.flatMap((c) =>
    c.schedule_entry_id && c.period_no != null
      ? [{
          entryId: c.schedule_entry_id,
          classroomId: c.classroom_id,
          ordinal: c.period_no,
          time: "",
          subjectCode: c.subject_code ?? "—",
          subjectName: `${c.subject_name ?? "—"} (แทน ${c.owner_name})`,
          room: c.room_label,
          gradient: "",
          hex: "#64748b",
        }]
      : [],
  );
  const coverHomerooms = todayCovers.flatMap((c) =>
    c.schedule_entry_id ? [] : [{ id: c.classroom_id, grade_level_id: "", department_id: "", label: c.room_label }],
  );
  const ownDays: SheetDay[] =
    !isHoliday(today) && timedOf(today).length > 0 ? [{ date: today, label: "วันนี้", periods: periodsOf(today) }] : [];
  const sheetDays: SheetDay[] =
    coverPeriods.length === 0
      ? ownDays
      : ownDays.length > 0
        ? ownDays.map((d) => ({ ...d, periods: [...d.periods, ...coverPeriods].sort((a, b) => a.ordinal - b.ordinal) }))
        : [{ date: today, label: "วันนี้", periods: coverPeriods }];

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

  function approveOneLeave(id: string) {
    setLeaveStatus.mutate(
      { id, status: "approved", approvedBy: me.id },
      { onSuccess: () => toast("อนุมัติใบลาเรียบร้อย"), onError: () => toast("อนุมัติไม่สำเร็จ", "error") },
    );
  }

  // Hold-to-confirm guards the irreversible in/out punch; null while locked or already clocked out.
  const clockHold = !clock?.clock_out_time && !clockLock ? (clock?.clock_in_time ? "ออกงาน" : "เข้างาน") : null;
  const tiles = [
    ...(showClock
      ? [
          {
            clock: true,
      title: clock?.clock_out_time ? "ลงเวลาแล้ว" : clock?.clock_in_time ? "ออกงาน" : "เข้างาน",
            hold: clockHold,
            text: ((clock?.clock_in_time && clockLock ? `เข้างานเวลา ${bangkokTime(clock.clock_in_time)}\n${clockLock}` : clockLock) ?? (clock?.clock_out_time
                ? `เข้า ${bangkokTime(clock.clock_in_time ?? clock.clock_out_time)} · ออก ${bangkokTime(clock.clock_out_time)}`
                : clock?.clock_in_time
                  ? `เข้างานเวลา ${bangkokTime(clock.clock_in_time)}`
                  : "ยังไม่ได้บันทึกเวลาเข้างาน")) + (clockHold ? ` · กดค้างเพื่อ${clockHold}` : ""),
            busy: clockIn.isPending || clockOut.isPending,
            disabled: loadingClock || !!clockLock,
            locked: !!clockLock,
            onClick: () => (clock?.clock_out_time ? setClockOpen(true) : onClock(clock?.clock_in_time ? "out" : "in")),
          },
        ]
      : []),
    { title: "เช็คชื่อเข้าเรียน", text: unchecked > 0 ? `วันนี้ยังไม่เช็ค ${unchecked} คาบ` : "ไม่มีคาบค้างเช็คชื่อ", to: "/period-attendance", sheet: true, badge: unchecked },
    {
      title: "จัดการใบลา",
      text: pendingLeave.length > 0 ? `มี ${pendingLeave.length} ใบรอการอนุมัติ` : "ไม่มีใบลาค้าง",
      busy: false,
      disabled: false,
      badge: pendingLeave.length,
      reveal: true,
      onClick: () => setLeaveRevealed((v) => !v),
    },
    {
      title: "เช็คชื่อเข้าแถว",
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
      badge: assemblyDay ? assemblyPending.length : 0,
      onClick: () => setAssemblyOpen(true),
    },
  ];
  type Tile = (typeof tiles)[number];
  const renderTile = (t: Tile, surface: string) => {
    const body = (
      <>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{t.title}</span>
          <span className="block whitespace-pre-line text-sm text-muted-foreground">{t.text}</span>
        </span>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2", "locked" in t && t.locked ? "border-muted-foreground/50 text-muted-foreground" : "border-accent text-accent")}>
          {"busy" in t && t.busy ? <Spinner className="h-4 w-4" /> : "locked" in t && t.locked ? <LockIcon className="h-4 w-4" /> : <ChevronForward className="h-4 w-4" />}
        </span>
        {"badge" in t && !!t.badge && (
          <span
            aria-label={`${t.badge} รายการรอดำเนินการ`}
            className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none text-white"
          >
            {t.badge > 99 ? "99+" : t.badge}
          </span>
        )}
      </>
    );
    const cls = cn("relative flex h-full items-center gap-3 rounded-2xl p-4 text-left transition-colors", surface);
    if ("sheet" in t && upNext) {
      return (
        <button
          key={t.title}
          type="button"
          onClick={() => setPeriodsOpen(true)}
          className={cls}
        >
          {body}
        </button>
      );
    }
    if ("clock" in t) {
      return (
        <div key={t.title} className="relative">
          {t.hold ? (
            <HoldButton
              disabled={t.disabled || t.busy}
              onConfirm={() => t.onClick?.()}
              onEarly={() => toast("กดค้างไว้เพื่อลงเวลา")}
              className={cn(cls, "w-full disabled:opacity-60")}
            >
              {body}
            </HoldButton>
          ) : (
            <button type="button" disabled={t.disabled || t.busy} onClick={t.onClick} className={cn(cls, "w-full disabled:opacity-60")}>
              {body}
            </button>
          )}
          <button
            type="button"
            onClick={() => setStatsOpen(true)}
            aria-label="ดูสถิติ"
            className="absolute right-[4.25rem] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-accent text-accent transition-transform active:scale-95"
          >
            <BarChartIcon className="h-4 w-4" />
          </button>
        </div>
      );
    }
    if ("reveal" in t) {
      const act = (open: () => void) => () => {
        setLeaveRevealed(false);
        open();
      };
      const actionCls = "flex w-20 flex-col items-center justify-center gap-1 text-xs font-medium text-white";
      return (
        <div key={t.title} className="relative h-full overflow-hidden rounded-2xl">
          {leaveRevealed && <button type="button" aria-label="ปิด" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setLeaveRevealed(false)} />}
          <div className={cn("absolute inset-y-0 right-0 z-20 flex transition-[visibility] duration-[250ms]", !leaveRevealed && "invisible")}>
            <button type="button" tabIndex={leaveRevealed ? 0 : -1} onClick={act(() => setLeaveOpen(true))} className={cn(actionCls, "bg-neutral-600")}>
              <CheckmarkCircleIcon className="h-6 w-6" />
              รออนุมัติ
            </button>
            <button type="button" tabIndex={leaveRevealed ? 0 : -1} onClick={act(() => setNewLeaveOpen(true))} className={cn(actionCls, "bg-accent")}>
              <DocumentTextIcon className="h-6 w-6" />
              ยื่นคำลา
            </button>
          </div>
          <button
            type="button"
            aria-expanded={leaveRevealed}
            onClick={t.onClick}
            className={cn(cls, "z-20 w-full transition-transform duration-[250ms] ease-out motion-reduce:transition-none", leaveRevealed && "-translate-x-40")}
          >
            {body}
          </button>
        </div>
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
};

  return (
    <div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={cn(WIDGET, "relative overflow-hidden lg:col-span-2")}>
          <div className="relative h-24 sm:h-36" style={bannerStyle(me, bannerColors, adjust.draft ?? undefined)} {...adjust.dragProps}>
            <BannerAdjustOverlay adjust={adjust} />
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
                  <BannerUpload profile={me} onAdjust={() => { setPickerOpen(false); adjust.start(); }} />
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
          <div className="grid gap-5 px-4 pb-5 sm:px-8 sm:pb-8 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:gap-8">
            <div className="min-w-0">
              <Avatar
                name={profileFullName(me)}
                src={avatarUrl(me)}
                className={cn("relative z-10 -mt-10 h-20 w-20 text-3xl ring-4 sm:-mt-14 sm:h-28 sm:w-28 sm:text-4xl", me.line_user_id ? "ring-[#06C755]" : "ring-card")}
              />
              <h1 className="font-heading mt-3 truncate text-2xl font-bold sm:text-3xl tracking-[-0.02em]">{profileFullName(me)}</h1>
              <p className="mt-1 truncate text-base text-muted-foreground">{me.email || "ยังไม่ได้ระบุอีเมล"}</p>
              {homerooms.length > 0 && (
                <p className="truncate text-base text-muted-foreground">ครูที่ปรึกษา {homerooms.map((h) => roomLabel(h.id)).join(", ")}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-5">
                <button
                  type="button"
                  onClick={() => setTimetableOpen(true)}
                  className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-transform active:scale-[0.98]"
                >
                  ตารางสอน
                </button>
                <Link
                  to="/profile"
                  className="inline-flex h-9 items-center rounded-full border border-input px-4 text-[13px] font-medium transition-colors hover:bg-muted active:scale-[0.98]"
                >
                  โปรไฟล์
                </Link>
                <button
                  type="button"
                  disabled={!!me.line_user_id}
                  onClick={() => setLineOpen(true)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium transition-transform active:scale-[0.98]",
                    me.line_user_id ? "bg-[#06C755] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {me.line_user_id ? "เชื่อมไลน์แล้ว" : "เชื่อมไลน์"}
                </button>
              </div>
            </div>
            <div className="flex flex-col items-start gap-4 text-left md:items-end md:pt-5 md:text-right">
              <div>
                <p className="text-sm text-muted-foreground">ตำแหน่ง</p>
                <div className="mt-1.5 flex flex-wrap gap-2 md:justify-end">
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
                  <div className="mt-1.5 flex flex-wrap gap-2 md:justify-end">
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
          <CoverTasks
            today={today}
            covers={covers}
            onCheck={(c) => (c.schedule_entry_id ? setPeriodsOpen(true) : setAssemblyOpen(true))}
          />
          <div className={cn("grid grid-cols-1 items-stretch gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-8 sm:pb-8", showClock ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
            {tiles.map((t) => renderTile(t, "bg-muted/70 hover:bg-muted"))}
          </div>
        </section>
      </div>
      {(upNext || coverPeriods.length > 0) && (
        <PeriodDaySheet
          open={periodsOpen}
          onOpenChange={setPeriodsOpen}
          days={sheetDays}
          academicYear={academicYear}
          recorderId={me.id}
        />
      )}
      <AssemblyAttendanceSheet
        open={assemblyOpen}
        onOpenChange={setAssemblyOpen}
        homerooms={[...homerooms, ...coverHomerooms.filter((c) => !homeroomIds.includes(c.id))]}
        academicYear={academicYear}
        departmentId={departmentId}
        recorderId={me.id}
        date={today}
        roomLabel={(id) => coverHomerooms.find((c) => c.id === id)?.label ?? roomLabel(id)}
      />

      <Modal open={lineOpen} onOpenChange={setLineOpen} title="เชื่อมต่อไลน์">
        <LineLinkCard />
      </Modal>
      <NewLeaveSheet profileId={me.id} open={newLeaveOpen} onOpenChange={setNewLeaveOpen} />
      <StaffClockStatsSheet open={statsOpen} onOpenChange={setStatsOpen} me={me} />
      <Modal open={clockOpen} onOpenChange={setClockOpen} title="ลงเวลาวันนี้">
        <dl className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-muted p-4">
            <dt className="text-sm text-muted-foreground">เข้างาน</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {clock?.clock_in_time ? bangkokTime(clock.clock_in_time) : "—"}
            </dd>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <dt className="text-sm text-muted-foreground">ออกงาน</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {clock?.clock_out_time ? bangkokTime(clock.clock_out_time) : "—"}
            </dd>
          </div>
        </dl>
      </Modal>

      {(() => {
        const leaveFooter = (
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setLeaveOpen(false)}>
              ปิด
            </Button>
            <Button type="button" className="flex-1" disabled={pendingLeave.length === 0 || setLeaveStatus.isPending} onClick={approveAllLeave}>
              {setLeaveStatus.isPending ? <Spinner className="h-3 w-3" /> : `อนุมัติทั้งหมด${pendingLeave.length > 0 ? ` (${pendingLeave.length})` : ""}`}
            </Button>
          </div>
        );
        const leaveBody = (
          <>
        {pendingLeave.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีใบลาค้าง</p>
        ) : (
          <ul className="-my-1 divide-y divide-border">
            {pendingLeave.map((l) => (
              <li key={l.id} className="flex gap-3 py-3">
                <Avatar
                  name={l.student ? `${l.student.first_name} ${l.student.last_name}` : "—"}
                  src={l.student ? (studentAvatarUrl(l.student) ?? (l.student.profile ? avatarUrl(l.student.profile) : null)) : null}
                  className="h-11 w-11 shrink-0 text-sm"
                />
                <div className="min-w-0 flex-1">
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
                  <button
                    type="button"
                    disabled={setLeaveStatus.isPending}
                    onClick={() => approveOneLeave(l.id)}
                    className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-medium transition-colors hover:bg-muted active:scale-[0.98] disabled:opacity-50"
                  >
                    {setLeaveStatus.isPending && setLeaveStatus.variables?.id === l.id && <Spinner className="h-3.5 w-3.5" />}
                    อนุมัติ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
          </>
        );
        const title = "ใบลารออนุมัติ";
        const description = pendingLeave.length > 0 ? `นักเรียนที่รออนุมัติ ${pendingLeave.length} ใบ` : undefined;
        return phone ? (
          <Sheet open={leaveOpen} onOpenChange={setLeaveOpen} title={title} description={description} footer={leaveFooter} bottomOnPhone>
            {leaveBody}
          </Sheet>
        ) : (
          <Modal open={leaveOpen} onOpenChange={setLeaveOpen} title={title} description={description} footer={leaveFooter}>
            {leaveBody}
          </Modal>
        );
      })()}

      {(() => {
        const timetable = timetableOpen && (
          <div className={phone ? "overflow-x-hidden touch-pan-y pb-4" : "scrollbar-hidden overflow-auto pb-4 sm:p-4"}>
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
        );
        return phone ? (
          <Sheet open={timetableOpen} onOpenChange={setTimetableOpen} title="ตารางสอน" bottomOnPhone>
            {timetable}
          </Sheet>
        ) : (
          <Modal open={timetableOpen} onOpenChange={setTimetableOpen} title="ตารางสอน" className="max-w-6xl">
            {timetable}
          </Modal>
        );
      })()}
    </div>
  );
}
