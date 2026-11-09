import { useQuery } from "@tanstack/react-query";
import type { TeachingAssignment } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// A teacher's own assigned subjects — reused from teaching_assignments (0017).
// The plan itself is teaching_plan_slots (see useTeachingPlanSlots).

export function useMyTeachingAssignments(teacherId: string | null) {
  return useQuery({
    queryKey: ["teaching_assignments", "by_teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async (): Promise<TeachingAssignment[]> => {
      const { data, error } = await supabase
        .from("teaching_assignments")
        .select("*")
        .eq("teacher_id", teacherId!)
        .order("academic_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
