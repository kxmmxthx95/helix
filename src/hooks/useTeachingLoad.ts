import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TeachingAssignment } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- teaching_assignments
// ครูสอนวิชาอะไรให้ห้องไหน + คาบ/สัปดาห์ (see migration 0017). Fetched once per
// department/year/term for every teacher at once — the page groups client-side
// into a per-teacher total (for the load-alert list) and a per-teacher detail
// view, rather than issuing one query per teacher.

export function useDepartmentTeachingAssignments(
  departmentId: string | null,
  academicYear: number,
  term: number | null,
) {
  return useQuery({
    queryKey: ["teaching_assignments", "by_department", departmentId, academicYear, term],
    enabled: !!departmentId,
    queryFn: async (): Promise<TeachingAssignment[]> => {
      let q = supabase
        .from("teaching_assignments")
        .select("*, teacher:profiles!inner(department_id)")
        .eq("teacher.department_id", departmentId!)
        .eq("academic_year", academicYear);
      q = term === null ? q.is("term", null) : q.eq("term", term);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as TeachingAssignment[];
    },
  });
}

export type TeachingAssignmentDraft = Pick<
  TeachingAssignment,
  "teacher_id" | "subject_id" | "classroom_id" | "academic_year" | "term" | "periods_per_week"
>;

export function useCreateTeachingAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: TeachingAssignmentDraft) => {
      const { error } = await supabase.from("teaching_assignments").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_assignments"] }),
  });
}

export function useUpdateTeachingAssignmentPeriods() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, periods_per_week }: { id: string; periods_per_week: number }) => {
      const { error } = await supabase
        .from("teaching_assignments")
        .update({ periods_per_week })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_assignments"] }),
  });
}

export function useDeleteTeachingAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teaching_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_assignments"] }),
  });
}

// ------------------------------------------------------------------ group_id
// Tags 2+ assignment rows as an intentional เรียนรวม/แบ่งคาบ overlap — the
// schedule_entries conflict trigger skips rows that share a group_id (see
// migration 0019). Joining an already-grouped target reuses its group_id
// rather than creating a second group.

export function useLinkAssignmentGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assignmentId, targetId }: { assignmentId: string; targetId: string }) => {
      const { data: target, error: fetchError } = await supabase
        .from("teaching_assignments")
        .select("group_id")
        .eq("id", targetId)
        .single();
      if (fetchError) throw fetchError;

      const groupId = target.group_id ?? crypto.randomUUID();
      const ids = target.group_id ? [assignmentId] : [assignmentId, targetId];
      const { error } = await supabase.from("teaching_assignments").update({ group_id: groupId }).in("id", ids);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_assignments"] }),
  });
}

export function useUnlinkAssignmentGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teaching_assignments").update({ group_id: null }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_assignments"] }),
  });
}

// ------------------------------------------------ classroom → cohort filter
// Latest classroom placement for the year, then latest cohort enrollment per
// student — used to scope the add-assignment drawer (grill 2026-08-12).

/** Cohort ids of students whose current room (this academic year) is `classroomId`. */
export function useCohortIdsInClassroom(classroomId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["classroom_cohort_ids", classroomId, academicYear],
    enabled: !!classroomId,
    queryFn: async (): Promise<string[]> => {
      const { data: inRoom, error } = await supabase
        .from("student_classroom_enrollments")
        .select("student_id, created_at")
        .eq("classroom_id", classroomId!)
        .eq("academic_year", academicYear)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const candidateIds = [...new Set((inRoom ?? []).map((r) => r.student_id))];
      if (candidateIds.length === 0) return [];

      // Confirm each student's latest placement for the year is still this room
      // (reassignment leaves older rows pointing at this classroom).
      const { data: yearRows, error: yearErr } = await supabase
        .from("student_classroom_enrollments")
        .select("student_id, classroom_id, created_at")
        .eq("academic_year", academicYear)
        .in("student_id", candidateIds)
        .order("created_at", { ascending: false });
      if (yearErr) throw yearErr;
      const currentInRoom = new Set<string>();
      const seen = new Set<string>();
      for (const row of yearRows ?? []) {
        if (seen.has(row.student_id)) continue;
        seen.add(row.student_id);
        if (row.classroom_id === classroomId) currentInRoom.add(row.student_id);
      }
      if (currentInRoom.size === 0) return [];

      const { data: cohortRows, error: cohortErr } = await supabase
        .from("student_cohort_enrollments")
        .select("student_id, cohort_id, created_at")
        .in("student_id", [...currentInRoom])
        .order("created_at", { ascending: false });
      if (cohortErr) throw cohortErr;
      const latestCohort = new Map<string, string>();
      for (const row of cohortRows ?? []) {
        if (!latestCohort.has(row.student_id)) latestCohort.set(row.student_id, row.cohort_id);
      }
      return [...new Set(latestCohort.values())];
    },
  });
}

/** Fallback when the room has no enrolled cohorts — any cohort with curriculum at this grade. */
export function useCohortIdsWithCurriculumAtGrade(gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["curriculum_subjects", "cohort_ids_at_grade", gradeLevelId],
    enabled: !!gradeLevelId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("curriculum_subjects")
        .select("cohort_id")
        .eq("grade_level_id", gradeLevelId!);
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.cohort_id))];
    },
  });
}
