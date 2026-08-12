import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceRecord, AttendanceStatus, Student } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- roster
// Current room + still studying — see migration 0026 grill decision: the
// check-in list is always "who's here now", not who sat there historically.

export function useClassroomRoster(classroomId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["attendance", "roster", classroomId, academicYear],
    enabled: !!classroomId,
    queryFn: async (): Promise<Student[]> => {
      const { data, error } = await supabase
        .from("student_classroom_enrollments")
        .select("student_id, created_at, student:students!inner(*)")
        .eq("classroom_id", classroomId!)
        .eq("academic_year", academicYear)
        .eq("student.status", "studying")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Latest enrollment row per student wins, same rule as useCurrentClassroomEnrollments.
      const latest = new Map<string, Student>();
      for (const row of data as unknown as { student_id: string; student: Student }[]) {
        if (!latest.has(row.student_id)) latest.set(row.student_id, row.student);
      }
      return [...latest.values()].sort((a, b) => a.student_code.localeCompare(b.student_code));
    },
  });
}

// -------------------------------------------------- homeroom classroom picker
// A teacher's own room(s) for the year — the classroom picker for the
// non-manager path. Managers instead use the existing department → grade
// level → classroom cascade (useDepartments/useGradeLevels/useClassrooms).

export type HomeroomClassroomOption = {
  id: string;
  grade_level_id: string;
  department_id: string;
  label: string;
};

export function useHomeroomClassrooms(teacherId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["classroom_homeroom_teachers", "by_teacher", teacherId, academicYear],
    enabled: !!teacherId,
    queryFn: async (): Promise<HomeroomClassroomOption[]> => {
      const { data, error } = await supabase
        .from("classroom_homeroom_teachers")
        .select(
          "classroom:classrooms!inner(id, name, grade_level_id, grade_level:grade_levels(name, department_id))",
        )
        .eq("teacher_id", teacherId!)
        .eq("academic_year", academicYear);
      if (error) throw error;
      return (
        data as unknown as {
          classroom: {
            id: string;
            name: string;
            grade_level_id: string;
            grade_level: { name: string; department_id: string } | null;
          };
        }[]
      ).map((r) => ({
        id: r.classroom.id,
        grade_level_id: r.classroom.grade_level_id,
        department_id: r.classroom.grade_level?.department_id ?? "",
        label: `${r.classroom.grade_level?.name ?? ""}/${r.classroom.name}`,
      }));
    },
  });
}

// --------------------------------------------------------- attendance_records

export function useAttendanceForDate(classroomId: string | null, date: string) {
  return useQuery({
    queryKey: ["attendance_records", "by_date", classroomId, date],
    enabled: !!classroomId && !!date,
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("classroom_id", classroomId!)
        .eq("date", date);
      if (error) throw error;
      return data;
    },
  });
}

/** Raw rows for a date range, scoped to a classroom and/or a single student — feeds the monthly summary tab/card. */
export function useAttendanceRange(params: {
  classroomId?: string | null;
  studentId?: string | null;
  startDate: string;
  endDate: string;
}) {
  const { classroomId, studentId, startDate, endDate } = params;
  return useQuery({
    queryKey: ["attendance_records", "range", classroomId ?? null, studentId ?? null, startDate, endDate],
    enabled: !!(classroomId || studentId),
    queryFn: async (): Promise<AttendanceRecord[]> => {
      let q = supabase.from("attendance_records").select("*").gte("date", startDate).lte("date", endDate);
      if (classroomId) q = q.eq("classroom_id", classroomId);
      if (studentId) q = q.eq("student_id", studentId);
      const { data, error } = await q.order("date");
      if (error) throw error;
      return data;
    },
  });
}

export function summarizeAttendance(records: AttendanceRecord[]): Record<AttendanceStatus, number> {
  const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, leave: 0 };
  for (const r of records) counts[r.status]++;
  return counts;
}

export type AttendanceDraft = Pick<
  AttendanceRecord,
  "student_id" | "classroom_id" | "date" | "status" | "note" | "recorded_by"
>;

/** One save = the whole day's marks for a room, upserted in one round trip (re-saving a day just overwrites it). */
export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: AttendanceDraft[]) => {
      const { error } = await supabase
        .from("attendance_records")
        .upsert(rows, { onConflict: "student_id,date" });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["attendance_records"] }),
  });
}

// --------------------------------------------------------------- my children
// role="parent" dashboard card — which students they're guardian of.

export function useMyChildren(parentId: string | null) {
  return useQuery({
    queryKey: ["guardianships", "my_children", parentId],
    enabled: !!parentId,
    queryFn: async (): Promise<Student[]> => {
      const { data, error } = await supabase
        .from("guardianships")
        .select("student:students!inner(*)")
        .eq("parent_id", parentId!);
      if (error) throw error;
      return (data as unknown as { student: Student }[]).map((r) => r.student);
    },
  });
}
