import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Classroom,
  ClassroomHomeroomTeacher,
  StudentClassroomEnrollment,
  StudentStatus,
} from "@/lib/database.types";
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

/** Every room across every grade level in a department — for pages that aren't grade-level-scoped (e.g. teaching load). */
export function useClassroomsByDepartment(departmentId: string | null) {
  return useQuery({
    queryKey: ["classrooms", "by_department", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<Classroom[]> => {
      const { data, error } = await supabase
        .from("classrooms")
        .select("*, grade_level:grade_levels!inner(department_id)")
        .eq("grade_level.department_id", departmentId!)
        .order("name");
      if (error) throw error;
      return data as unknown as Classroom[];
    },
  });
}

// ------------------------------------------------- classroom_homeroom_teachers
// History per room per academic year, not a mutable pointer (see migration
// 0017) — same shape as student_classroom_enrollments below.

export function useHomeroomTeachers(classroomId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["classroom_homeroom_teachers", classroomId, academicYear],
    enabled: !!classroomId,
    queryFn: async (): Promise<ClassroomHomeroomTeacher[]> => {
      const { data, error } = await supabase
        .from("classroom_homeroom_teachers")
        .select("*")
        .eq("classroom_id", classroomId!)
        .eq("academic_year", academicYear);
      if (error) throw error;
      return data;
    },
  });
}

/** Every homeroom assignment across a department's rooms for one year — for list views that show all rooms at once rather than one room's teachers. */
export function useHomeroomTeachersByDepartment(departmentId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["classroom_homeroom_teachers", "by_department", departmentId, academicYear],
    enabled: !!departmentId,
    queryFn: async (): Promise<ClassroomHomeroomTeacher[]> => {
      const { data, error } = await supabase
        .from("classroom_homeroom_teachers")
        .select("*, classroom:classrooms!inner(grade_level:grade_levels!inner(department_id))")
        .eq("academic_year", academicYear)
        .eq("classroom.grade_level.department_id", departmentId!);
      if (error) throw error;
      return data as unknown as ClassroomHomeroomTeacher[];
    },
  });
}

/** Rooms one teacher currently heads as ครูประจำชั้น — scopes the classroom list page for a teacher who isn't a manager. */
export function useHomeroomClassroomsByTeacher(teacherId: string | null, academicYear: number) {
  return useQuery({
    queryKey: ["classroom_homeroom_teachers", "by_teacher", teacherId, academicYear],
    enabled: !!teacherId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("classroom_homeroom_teachers")
        .select("classroom_id")
        .eq("teacher_id", teacherId!)
        .eq("academic_year", academicYear);
      if (error) throw error;
      return data.map((r) => r.classroom_id);
    },
  });
}

export type HomeroomTeacherDraft = Pick<
  ClassroomHomeroomTeacher,
  "classroom_id" | "teacher_id" | "academic_year"
>;

export function useSetHomeroomTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: HomeroomTeacherDraft) => {
      const { error } = await supabase.from("classroom_homeroom_teachers").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["classroom_homeroom_teachers"] }),
  });
}

export function useRemoveHomeroomTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("classroom_homeroom_teachers").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["classroom_homeroom_teachers"] }),
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

/**
 * Latest classroom_id per currently-studying student across a whole
 * department — NOT filtered to one academic_year, unlike
 * useCurrentClassroomEnrollments. Promotion (usePromoteStudents) only bumps
 * students.grade_level_id; it doesn't insert a new enrollment row until an
 * admin re-assigns the room in ClassroomPanel, so a student can go a whole
 * new academic_year with their latest row still dated last year. A hard
 * `.eq("academic_year", activeYear)` here would silently zero out every
 * classroom nobody has re-assigned yet — this list is read-only headcounts,
 * not a term-scoped roster, so "latest ever" is the right answer, not "latest
 * this year". See grill note in the Classrooms feature discussion.
 */
export function useCurrentClassroomEnrollmentsByDepartment(departmentId: string | null) {
  return useQuery({
    queryKey: ["student_classroom_enrollments", "by_department", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<StudentClassroomEnrollment[]> => {
      const { data, error } = await supabase
        .from("student_classroom_enrollments")
        .select(
          "id, student_id, classroom_id, academic_year, created_at, classroom:classrooms!inner(grade_level:grade_levels!inner(department_id)), student:students!inner(status)",
        )
        .eq("classroom.grade_level.department_id", departmentId!)
        .eq("student.status", "studying")
        .order("created_at", { ascending: false });
      if (error) throw error;
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
