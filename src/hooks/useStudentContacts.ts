import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StudentContact, StudentGuardianFinancial } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export function useStudentContacts(studentId: string | null) {
  return useQuery({
    queryKey: ["student_contacts", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<StudentContact[]> => {
      const { data, error } = await supabase
        .from("student_contacts")
        .select("*")
        .eq("student_id", studentId!)
        .order("relationship");
      if (error) throw error;
      return data;
    },
  });
}

export type StudentContactDraft = Pick<
  StudentContact,
  | "student_id"
  | "relationship"
  | "relationship_note"
  | "prefix"
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "address"
>;

/** Returns the saved row — a fresh insert's id is needed right after to attach a financial record. */
export function useSaveStudentContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: StudentContactDraft & { id?: string }): Promise<StudentContact> => {
      const { data, error } = id
        ? await supabase.from("student_contacts").update(draft).eq("id", id).select().single()
        : await supabase.from("student_contacts").insert(draft).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_contacts"] }),
  });
}

export function useDeleteStudentContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_contacts"] }),
  });
}

/** The one-primary-per-student invariant is enforced by a DB trigger (0015) — this just flips the flag. */
export function useSetPrimaryContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_contacts").update({ is_primary: true }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_contacts"] }),
  });
}

export function useGuardianFinancials(contactIds: string[]) {
  return useQuery({
    queryKey: ["student_guardian_financials", contactIds],
    enabled: contactIds.length > 0,
    queryFn: async (): Promise<StudentGuardianFinancial[]> => {
      const { data, error } = await supabase
        .from("student_guardian_financials")
        .select("*")
        .in("contact_id", contactIds);
      if (error) throw error;
      return data;
    },
  });
}

export type GuardianFinancialDraft = Pick<
  StudentGuardianFinancial,
  "contact_id" | "occupation" | "workplace" | "monthly_income"
>;

export function useSaveGuardianFinancial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: GuardianFinancialDraft) => {
      const { error } = await supabase.from("student_guardian_financials").upsert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_guardian_financials"] }),
  });
}
