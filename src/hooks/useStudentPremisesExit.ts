import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StudentPremisesExitRequest } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// student_premises_exit_requests — see migration 0184. Student asks, the
// current homeroom teacher (or can_manage()) approves BEFORE they leave and
// confirms the return. RLS scopes reads/writes; no client-side re-filtering.

export function useMyTodayStudentExits(studentId: string | null, date: string) {
  return useQuery({
    queryKey: ["student_premises_exit_requests", "by_student_date", studentId, date],
    enabled: !!studentId && !!date,
    queryFn: async (): Promise<StudentPremisesExitRequest[]> => {
      const { data, error } = await supabase
        .from("student_premises_exit_requests")
        .select("*")
        .eq("student_id", studentId!)
        .eq("date", date)
        .order("exit_time");
      if (error) throw error;
      return data;
    },
  });
}

export type StudentExitWithStudent = StudentPremisesExitRequest & {
  student: { student_code: string; first_name: string; last_name: string; avatar_path: string | null; updated_at: string; profile: { avatar_path: string | null; updated_at: string } | null } | null;
};

/** Pending, plus approved-but-not-yet-returned, within the caller's approval scope (RLS). */
export function useOpenStudentExits(date: string) {
  return useQuery({
    queryKey: ["student_premises_exit_requests", "open", date],
    queryFn: async (): Promise<StudentExitWithStudent[]> => {
      const { data, error } = await supabase
        .from("student_premises_exit_requests")
        .select("*, student:students(student_code, first_name, last_name, avatar_path, updated_at, profile:profiles!profile_id(avatar_path, updated_at))")
        .eq("date", date)
        .or("status.eq.pending,and(status.eq.approved,no_return.eq.false,return_time.is.null)")
        .order("exit_time");
      if (error) throw error;
      return data as unknown as StudentExitWithStudent[];
    },
  });
}

export function useRequestStudentExit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { studentId: string; submittedBy: string; date: string; reason: string; exitTime: string; plannedReturnTime: string | null; noReturn: boolean }) => {
      const { error } = await supabase.from("student_premises_exit_requests").insert({
        student_id: p.studentId,
        submitted_by: p.submittedBy,
        date: p.date,
        reason: p.reason,
        exit_time: p.exitTime,
        planned_return_time: p.plannedReturnTime,
        no_return: p.noReturn,
      });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_premises_exit_requests"] }),
  });
}

export function useDecideStudentExit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, approvedBy }: { id: string; status: "approved" | "rejected"; approvedBy: string }) => {
      const { error } = await supabase
        .from("student_premises_exit_requests")
        .update({ status, approved_by: approvedBy, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_premises_exit_requests"] }),
  });
}

export function useConfirmStudentReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_premises_exit_requests").update({ return_time: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_premises_exit_requests"] }),
  });
}
