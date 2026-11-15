import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Room, ScheduleEntry, TeachingAssignment } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- schedule_entries
// Weekly recurring placement of a teaching_assignment into a day+period slot
// (see migration 0019). Fetched per classroom or per teacher, joined with the
// assignment for display — the DB trigger (not this hook) enforces
// conflicts, period validity, and term locks.

export type ScheduleEntryRow = ScheduleEntry & {
  teaching_assignment: Pick<
    TeachingAssignment,
    "teacher_id" | "subject_id" | "classroom_id" | "periods_per_week" | "group_id"
  >;
};

function mapRow(row: unknown): ScheduleEntryRow {
  const r = row as ScheduleEntry & { teaching_assignments: ScheduleEntryRow["teaching_assignment"] };
  const { teaching_assignments, ...rest } = r;
  return { ...rest, teaching_assignment: teaching_assignments };
}

export function useClassroomSchedule(classroomId: string | null, academicYear: number, term: number | null) {
  return useQuery({
    queryKey: ["schedule_entries", "by_classroom", classroomId, academicYear, term],
    enabled: !!classroomId,
    queryFn: async (): Promise<ScheduleEntryRow[]> => {
      let q = supabase
        .from("schedule_entries")
        .select("*, teaching_assignments!inner(teacher_id,subject_id,classroom_id,periods_per_week,group_id)")
        .eq("teaching_assignments.classroom_id", classroomId!)
        .eq("teaching_assignments.academic_year", academicYear);
      q = term === null ? q.is("teaching_assignments.term", null) : q.eq("teaching_assignments.term", term);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useTeacherSchedule(teacherId: string | null, academicYear: number, term: number | null) {
  return useQuery({
    queryKey: ["schedule_entries", "by_teacher", teacherId, academicYear, term],
    enabled: !!teacherId,
    queryFn: async (): Promise<ScheduleEntryRow[]> => {
      let q = supabase
        .from("schedule_entries")
        .select("*, teaching_assignments!inner(teacher_id,subject_id,classroom_id,periods_per_week,group_id)")
        .eq("teaching_assignments.teacher_id", teacherId!)
        .eq("teaching_assignments.academic_year", academicYear);
      q = term === null ? q.is("teaching_assignments.term", null) : q.eq("teaching_assignments.term", term);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

/** Every placed entry of a department for one year/term. Also called directly to explain a conflict with fresh data. */
export async function fetchDepartmentSchedule(
  departmentId: string,
  academicYear: number,
  term: number | null,
): Promise<ScheduleEntryRow[]> {
  let q = supabase
    .from("schedule_entries")
    .select(
      "*, teaching_assignments!inner(teacher_id,subject_id,classroom_id,periods_per_week,group_id,academic_year,term,classroom:classrooms!inner(grade_level:grade_levels!inner(department_id)))",
    )
    .eq("teaching_assignments.academic_year", academicYear)
    .eq("teaching_assignments.classroom.grade_level.department_id", departmentId);
  q = term === null ? q.is("teaching_assignments.term", null) : q.eq("teaching_assignments.term", term);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** The faint "other teachers" layer. Off until `enabled`. */
export function useDepartmentSchedule(
  departmentId: string | null,
  academicYear: number,
  term: number | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["schedule_entries", "by_department", departmentId, academicYear, term],
    enabled: enabled && !!departmentId,
    queryFn: () => fetchDepartmentSchedule(departmentId!, academicYear, term),
  });
}

export type ScheduleEntryDraft = Pick<ScheduleEntry, "teaching_assignment_id" | "day_of_week" | "period_no"> & {
  room_id?: string | null;
};

export function useCreateScheduleEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ScheduleEntryDraft) => {
      const { error } = await supabase.from("schedule_entries").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["schedule_entries"] }),
  });
}

/** Drag-move: same assignment, new slot. The DB trigger re-checks period type, conflicts and term lock. */
export function useMoveScheduleEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, day_of_week, period_no }: { id: string; day_of_week: number; period_no: number }) => {
      const { error } = await supabase.from("schedule_entries").update({ day_of_week, period_no }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["schedule_entries"] }),
  });
}

export function useDeleteScheduleEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["schedule_entries"] }),
  });
}

/** Set or clear the physical room of a placed entry. The DB trigger rejects a double-booked room. */
export function useSetEntryRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, room_id }: { id: string; room_id: string | null }) => {
      const { error } = await supabase.from("schedule_entries").update({ room_id }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["schedule_entries"] }),
  });
}

// ----------------------------------------------------------------------- rooms
// Per-department physical rooms (migration 0161). Retired rooms stay listed
// so old entries still show a name; pickers filter on is_active themselves.

export function useRooms(departmentId: string | null) {
  return useQuery({
    queryKey: ["rooms", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<Room[]> => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("department_id", departmentId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { id?: string; department_id: string; name: string; is_active?: boolean }) => {
      const { id, ...fields } = r;
      const { error } = id
        ? await supabase.from("rooms").update(fields).eq("id", id)
        : await supabase.from("rooms").insert(fields);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["rooms"] }),
  });
}
