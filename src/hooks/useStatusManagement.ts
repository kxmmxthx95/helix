import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Classroom, StudentClassroomEnrollment, StudentStatus } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- classrooms
// Durable per grade level, reused every year — not recreated annually.

export function useClassrooms(gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["classrooms", gradeLevelId],
    enabled: !!gradeLevelId,
    queryFn: async (): Promise<Classroom[]> => {
      const { data, error } = await supabase
        .from("classrooms")
        .select("*")
        .eq("grade_level_id", gradeLevelId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export type ClassroomDraft = Pick<Classroom, "grade_level_id" | "name">;

export function useCreateClassroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ClassroomDraft) => {
      const { error } = await supabase.from("classrooms").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

/** Soft delete / restore — past enrollments may still reference a retired room. */
export function useSetClassroomActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("classrooms").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

// ----------------------------------------------- student_classroom_enrollments
// History, not a mutable pointer (see migration 0013) — "current" placement
// for a given year is just the latest row per student.

export function useCurrentClassroomEnrollments(gradeLevelId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["student_classroom_enrollments", "by_grade_level", gradeLevelId, academicYear],
    enabled: !!gradeLevelId,
    queryFn: async (): Promise<StudentClassroomEnrollment[]> => {
      const { data, error } = await supabase
        .from("student_classroom_enrollments")
        .select("id, student_id, classroom_id, academic_year, created_at, classroom:classrooms!inner(grade_level_id)")
        .eq("academic_year", academicYear)
        .eq("classroom.grade_level_id", gradeLevelId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Latest row per student wins — a reassignment leaves the old row in place.
      const latest = new Map<string, StudentClassroomEnrollment>();
      for (const row of data as unknown as StudentClassroomEnrollment[]) {
        if (!latest.has(row.student_id)) latest.set(row.student_id, row);
      }
      return [...latest.values()];
    },
  });
}

export type ClassroomAssignmentDraft = Pick<
  StudentClassroomEnrollment,
  "student_id" | "classroom_id" | "academic_year"
>;

/** Assigns one or more students into a room in one go — each insert is a new history row. */
export function useAssignClassroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: ClassroomAssignmentDraft[]) => {
      const { error } = await supabase.from("student_classroom_enrollments").insert(drafts);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_classroom_enrollments"] }),
  });
}

// --------------------------------------------------------- annual promotion
// Acts directly on students.grade_level_id / students.status — already
// covered by the existing students_manage RLS policy and audit trigger.

/** targetGradeLevelId null = this is the department's top grade -> graduate instead of moving up. */
export function usePromoteStudents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      studentIds,
      targetGradeLevelId,
    }: {
      studentIds: string[];
      targetGradeLevelId: string | null;
    }) => {
      const { error } = targetGradeLevelId
        ? await supabase.from("students").update({ grade_level_id: targetGradeLevelId }).in("id", studentIds)
        : await supabase.from("students").update({ status: "graduated" as StudentStatus }).in("id", studentIds);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

// ----------------------------------------------------------- bulk status change

export function useBulkSetStudentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentIds, status }: { studentIds: string[]; status: StudentStatus }) => {
      const { error } = await supabase.from("students").update({ status }).in("id", studentIds);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["students"] }),
  });
}
