import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { distanceMeters, getCurrentPosition } from "@/lib/geofence";
import type { TimeClockRecord } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// --------------------------------------------------------------- time_clock_records
// One row per person per day — see migration 0032. clock_in/out reuse the
// GPS-error / self-edit-trigger surface as the "already clocked in/out
// today" guard; the UI still disables the buttons client-side once
// useMyTimeClock shows a time set, this is just the backstop.

const GPS_ERROR_MESSAGE = {
  denied: "ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ location ก่อน",
  unavailable: "อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง",
  timeout: "หาตำแหน่งไม่สำเร็จ (หมดเวลา) ลองใหม่อีกครั้ง",
} as const;

const GEOFENCE_UNSET_MESSAGE = "แผนกยังไม่ได้ตั้งพื้นที่ลงเวลา — แจ้งผู้ดูแลให้ปักหมุดใน ตั้งค่า ก่อน";

export function useMyTimeClock(profileId: string | null, date: string) {
  return useQuery({
    queryKey: ["time_clock_records", "one", profileId, date],
    enabled: !!profileId && !!date,
    queryFn: async (): Promise<TimeClockRecord | null> => {
      const { data, error } = await supabase
        .from("time_clock_records")
        .select("*")
        .eq("profile_id", profileId!)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTimeClockRange(profileId: string | null, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["time_clock_records", "range", profileId, startDate, endDate],
    enabled: !!profileId,
    queryFn: async (): Promise<TimeClockRecord[]> => {
      const { data, error } = await supabase
        .from("time_clock_records")
        .select("*")
        .eq("profile_id", profileId!)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

const CLOCK_IN_EARLY_MIN = 60;

export function bangkokMinutes(d: Date) {
  const [h = 0, m = 0] = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" })
    .format(d)
    .split(":")
    .map(Number);
  return h * 60 + m;
}

const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

type ClockTimes = { work_start_time: string | null; work_end_time: string | null };

/** Time-window gate shared by the home card and the mutations. Returns a Thai reason when locked, null when allowed. Unset time = no limit. */
export function clockGate(kind: "in" | "out", s: ClockTimes | undefined, nowMin: number): string | null {
  if (kind === "in" && s?.work_start_time) {
    const opens = Math.max(0, toMin(s.work_start_time) - CLOCK_IN_EARLY_MIN);
    if (nowMin < opens) return `เช็คอินได้ตั้งแต่ ${hhmm(opens)} น.`;
  }
  if (kind === "out" && s?.work_end_time && nowMin < toMin(s.work_end_time)) {
    return `ออกงานได้ตั้งแต่ ${hhmm(toMin(s.work_end_time))} น.`;
  }
  return null;
}

/** Unset geofence (or no department) = fail-closed: clocking is refused until an admin sets it. Throws with a Thai message on time-window, GPS failure or outside-radius. */
async function checkedPosition(kind: "in" | "out", departmentId: string | null): Promise<{ lat: number; lng: number }> {
  if (!departmentId) throw new Error(GEOFENCE_UNSET_MESSAGE);
  const { data: dept, error } = await supabase
    .from("department_settings")
    .select("checkin_lat, checkin_lng, checkin_radius_m, work_start_time, work_end_time")
    .eq("department_id", departmentId)
    .single();
  if (error) throw error;
  const locked = clockGate(kind, dept, bangkokMinutes(new Date()));
  if (locked) throw new Error(locked);

  const pos = await getCurrentPosition();
  if ("error" in pos) throw new Error(GPS_ERROR_MESSAGE[pos.error]);
  if (dept.checkin_lat === null || dept.checkin_lng === null || dept.checkin_radius_m === null) {
    throw new Error(GEOFENCE_UNSET_MESSAGE);
  }

  const distance = distanceMeters(pos.lat, pos.lng, dept.checkin_lat, dept.checkin_lng);
  if (distance > dept.checkin_radius_m) {
    throw new Error(`อยู่นอกพื้นที่ที่กำหนด (ห่างจากจุดที่ตั้งไว้ ${Math.round(distance)} เมตร)`);
  }
  return pos;
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, departmentId, date }: { profileId: string; departmentId: string | null; date: string }) => {
      const pos = await checkedPosition("in", departmentId);
      const { error } = await supabase.from("time_clock_records").upsert(
        {
          profile_id: profileId,
          date,
          clock_in_time: new Date().toISOString(),
          clock_in_lat: pos.lat,
          clock_in_lng: pos.lng,
          recorded_by: profileId,
        },
        { onConflict: "profile_id,date" },
      );
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["time_clock_records"] }),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, departmentId, date }: { profileId: string; departmentId: string | null; date: string }) => {
      const pos = await checkedPosition("out", departmentId);
      const { error } = await supabase
        .from("time_clock_records")
        .update({ clock_out_time: new Date().toISOString(), clock_out_lat: pos.lat, clock_out_lng: pos.lng })
        .eq("profile_id", profileId)
        .eq("date", date);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["time_clock_records"] }),
  });
}

/** Manager manual override — no geofence check, for the "GPS ล่ม" escape hatch (grill decision). */
export function useRecordTimeClockForOthers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      profileId: string;
      date: string;
      clockInTime: string | null;
      clockOutTime: string | null;
      recordedBy: string;
    }) => {
      const { error } = await supabase.from("time_clock_records").upsert(
        {
          profile_id: params.profileId,
          date: params.date,
          clock_in_time: params.clockInTime,
          clock_out_time: params.clockOutTime,
          recorded_by: params.recordedBy,
        },
        { onConflict: "profile_id,date" },
      );
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["time_clock_records"] }),
  });
}

/** Manager removes a person's clock record for a day (RLS limits it to their department; the audit trigger logs who did it). */
export function useDeleteTimeClockRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, date }: { profileId: string; date: string }) => {
      const { error } = await supabase.from("time_clock_records").delete().eq("profile_id", profileId).eq("date", date);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["time_clock_records"] }),
  });
}
