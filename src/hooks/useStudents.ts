import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile, Student, StudentStatus } from "@/lib/database.types";
import { compressImage } from "@/lib/image";
import { supabase } from "@/lib/supabase";

export type StudentFilters = {
  search: string;
  departmentId: string;
  status: StudentStatus | "";
  gradeLevelId?: string;
  classroomId?: string;
};

/** Roster list row — linked login avatar when the student has an account. */
export type StudentListItem = Student & {
  profile: Pick<Profile, "avatar_path" | "updated_at" | "is_active"> | null;
};

export type StudentDraft = Pick<
  Student,
  | "student_code"
  | "prefix"
  | "first_name"
  | "last_name"
  | "department_id"
  | "grade_level_id"
  | "status"
  | "national_id"
  | "date_of_birth"
  | "phone"
  | "email"
  | "house_no"
  | "village_no"
  | "alley"
  | "road"
  | "subdistrict"
  | "district"
  | "province"
  | "postal_code"
  | "latitude"
  | "longitude"
  | "family_status"
  | "blood_type"
  | "chronic_disease"
  | "drug_allergy"
  | "food_allergy"
>;

/** Students whose most recent student_classroom_enrollments row (across all years) points at this room — "current room" is just the latest placement, whichever year it was made in. */
async function studentIdsCurrentlyInClassroom(classroomId: string): Promise<string[]> {
  const { data: everInRoom, error: eirError } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id")
    .eq("classroom_id", classroomId);
  if (eirError) throw eirError;
  const candidateIds = [...new Set(everInRoom.map((r) => r.student_id))];
  if (candidateIds.length === 0) return [];

  const { data: history, error: historyError } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id, classroom_id, created_at")
    .in("student_id", candidateIds)
    .order("created_at", { ascending: false });
  if (historyError) throw historyError;

  const latestByStudent = new Map<string, string>();
  for (const row of history) {
    if (!latestByStudent.has(row.student_id)) latestByStudent.set(row.student_id, row.classroom_id);
  }
  return candidateIds.filter((id) => latestByStudent.get(id) === classroomId);
}

export function useStudents(filters: StudentFilters) {
  return useQuery({
    queryKey: ["students", filters],
    queryFn: async (): Promise<StudentListItem[]> => {
      let q = supabase
        .from("students")
        .select("*, profile:profiles!profile_id(avatar_path, updated_at, is_active)")
        .order("student_code");

      if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.gradeLevelId) q = q.eq("grade_level_id", filters.gradeLevelId);
      if (filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        q = q.or(
          `first_name.ilike.${term},last_name.ilike.${term},student_code.ilike.${term}`,
        );
      }
      if (filters.classroomId) {
        const studentIds = await studentIdsCurrentlyInClassroom(filters.classroomId);
        if (studentIds.length === 0) return [];
        q = q.in("id", studentIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as StudentListItem[];
    },
    placeholderData: (previous) => previous,
  });
}

/** The roster row a student's login account is linked to (students.profile_id is unique). */
export function useStudentByProfile(profileId: string | null) {
  return useQuery({
    queryKey: ["students", "by_profile", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<Student | null> => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("profile_id", profileId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveStudent() {
  const qc = useQueryClient();

  return useMutation({
    // `avatar`: a File to upload after the row is saved, "remove" to clear it, undefined to leave it alone.
    mutationFn: async ({ id, avatar, ...draft }: StudentDraft & { id?: string; avatar?: File | "remove" }): Promise<string> => {
      const { data, error } = id
        ? await supabase.from("students").update(draft).eq("id", id).select("id").single()
        : await supabase.from("students").insert(draft).select("id").single();
      if (error) throw error;
      if (!avatar) return data.id;
      if (avatar === "remove") {
        const { error: rmErr } = await supabase.from("students").update({ avatar_path: null }).eq("id", data.id);
        if (rmErr) throw rmErr;
        // The linked login's avatar_path is cleared by the students_sync_avatar_to_profile trigger (0141).
        return data.id;
      }
      const path = `students/${data.id}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, await compressImage(avatar), { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error: pathErr } = await supabase.from("students").update({ avatar_path: path }).eq("id", data.id);
      if (pathErr) throw pathErr;
      return data.id;
    },
    onSettled: (_id, _err, vars) => {
      // A photo change shows up on rosters embedded in many other queries (attendance, scores, classrooms…), so refresh them all.
      if (vars?.avatar) return void qc.invalidateQueries();
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

/** Hard delete — cascades to guardianships, contacts, cohort/classroom enrollments, transfer intake. */
export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

export type ImportOutcome = { inserted: number; skipped: string[] };

/**
 * Bulk insert from CSV. Codes that already exist are reported back rather
 * than overwritten — an import must never silently replace a live record.
 */
export function useImportStudents() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (drafts: StudentDraft[]): Promise<ImportOutcome> => {
      const codes = drafts.map((d) => d.student_code);
      const { data: existing, error: lookupError } = await supabase
        .from("students")
        .select("student_code")
        .in("student_code", codes);
      if (lookupError) throw lookupError;

      const taken = new Set(existing.map((r) => r.student_code));
      const fresh = drafts.filter((d) => !taken.has(d.student_code));

      if (fresh.length > 0) {
        const { error } = await supabase.from("students").insert(fresh);
        if (error) throw error;
      }

      return { inserted: fresh.length, skipped: [...taken] };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["students"] }),
  });
}

/** Latest placement (any year) → classroom name, or null when never placed. */
export function useStudentClassroomName(studentId: string | null) {
  return useQuery({
    queryKey: ["students", "classroom_name", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("student_classroom_enrollments")
        .select("classroom:classrooms(name)")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as { classroom: { name: string } | null } | null)?.classroom?.name ?? null;
    },
  });
}

/** Suspend / re-enable a student's login (profiles.is_active) — AuthProvider signs suspended accounts out. */
export function useSetAccountActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, is_active }: { profileId: string; is_active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active }).eq("id", profileId);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}
