import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Contract,
  ContractType,
  DocumentCategory,
  EmployeeDocument,
  EmployeePosition,
  EmployeeStatus,
  EmployeeStatusHistoryEntry,
  Profile,
  SalaryGrade,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export type EmployeeFilters = {
  search: string;
  departmentId: string; // "" = ทุกแผนก
  status: EmployeeStatus | "";
};

/**
 * A profile plus its employee_positions row. "Employee" = has a position row
 * at all (see ensure_employee_position trigger, migration 0061) — this is
 * what decides who's included, not profile_roles, which non-super_admin
 * callers can't read for anyone but themselves (profile_roles_read_scope).
 * salaryGradeId comes back null both when unset AND when RLS hides it
 * (employee_compensation is self + can_manage_hr() only) — the UI can't
 * tell those apart, which is the point.
 */
export type EmployeeRow = Profile & {
  position: EmployeePosition;
  salaryGradeId: string | null;
};

export function useSalaryGrades() {
  return useQuery({
    queryKey: ["salary_grades"],
    queryFn: async (): Promise<SalaryGrade[]> => {
      const { data, error } = await supabase.from("salary_grades").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // reference data, changes roughly never
  });
}

export type SalaryGradeDraft = Pick<SalaryGrade, "code" | "name" | "min_salary" | "max_salary">;

export function useSaveSalaryGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: SalaryGradeDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("salary_grades").update(draft).eq("id", id)
        : await supabase.from("salary_grades").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["salary_grades"] }),
  });
}

export function useDeleteSalaryGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("salary_grades").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["salary_grades"] }),
  });
}

export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: ["employees", filters],
    queryFn: async (): Promise<EmployeeRow[]> => {
      let q = supabase.from("profiles").select("*").order("first_name").order("last_name");
      if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
      if (filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        q = q.or(`first_name.ilike.${term},last_name.ilike.${term}`);
      }
      const { data: profiles, error } = await q;
      if (error) throw error;
      if (profiles.length === 0) return [];

      const ids = profiles.map((p) => p.id);
      const [{ data: positions, error: posErr }, { data: comp, error: compErr }] = await Promise.all([
        supabase.from("employee_positions").select("*").in("profile_id", ids),
        supabase.from("employee_compensation").select("profile_id, salary_grade_id").in("profile_id", ids),
      ]);
      if (posErr) throw posErr;
      if (compErr) throw compErr;

      const positionByProfile = new Map((positions ?? []).map((p) => [p.profile_id, p]));
      const salaryByProfile = new Map((comp ?? []).map((c) => [c.profile_id, c.salary_grade_id]));

      const rows: EmployeeRow[] = [];
      for (const p of profiles) {
        const position = positionByProfile.get(p.id);
        if (!position) continue; // not an employee (e.g. a parent-only profile)
        rows.push({ ...p, position, salaryGradeId: salaryByProfile.get(p.id) ?? null });
      }

      return filters.status ? rows.filter((r) => r.position.employee_status === filters.status) : rows;
    },
    placeholderData: (previous) => previous,
  });
}

export type EmployeePositionEdit = Pick<EmployeePosition, "manager_id" | "job_title_id" | "career_path_notes">;

/** Never touches employee_status — that only ever changes via useChangeEmployeeStatus, so the history log can't drift from it (migration 0061 sync_employee_status trigger). */
export function useUpdateEmployeePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, ...patch }: EmployeePositionEdit & { profileId: string }) => {
      const { error } = await supabase
        .from("employee_positions")
        .upsert({ profile_id: profileId, ...patch }, { onConflict: "profile_id" });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployeeCompensation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, salaryGradeId }: { profileId: string; salaryGradeId: string | null }) => {
      const { error } = await supabase
        .from("employee_compensation")
        .upsert({ profile_id: profileId, salary_grade_id: salaryGradeId }, { onConflict: "profile_id" });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useEmployeeStatusHistory(profileId: string | undefined) {
  return useQuery({
    queryKey: ["employee-status-history", profileId],
    queryFn: async (): Promise<EmployeeStatusHistoryEntry[]> => {
      const { data, error } = await supabase
        .from("employee_status_history")
        .select("*")
        .eq("profile_id", profileId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
  });
}

/**
 * The only path that may change employee_status — inserting the history row
 * fires sync_employee_status, which updates employee_positions.employee_status
 * and profiles.is_active together. See migration 0061.
 */
export function useChangeEmployeeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: { profileId: string; status: EmployeeStatus; reason: string; changedBy: string }) => {
      const { error } = await supabase.from("employee_status_history").insert({
        profile_id: entry.profileId,
        status: entry.status,
        reason: entry.reason,
        changed_by: entry.changedBy,
      });
      if (error) throw error;
    },
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: ["employees"] });
      void qc.invalidateQueries({ queryKey: ["employee-status-history", vars.profileId] });
      void qc.invalidateQueries({ queryKey: ["profiles"] }); // is_active changed too
    },
  });
}

export function useContracts(profileId: string | undefined) {
  return useQuery({
    queryKey: ["contracts", profileId],
    queryFn: async (): Promise<Contract[]> => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("profile_id", profileId as string)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
  });
}

export type ContractDraft = {
  profile_id: string;
  contract_type: ContractType;
  start_date: string;
  end_date: string | null;
  document_id: string | null;
};

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ContractDraft) => {
      const { error } = await supabase.from("contracts").insert(draft);
      if (error) throw error;
    },
    onSettled: (_d, _e, vars) => void qc.invalidateQueries({ queryKey: ["contracts", vars.profile_id] }),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: ContractDraft & { id: string }) => {
      const { error } = await supabase.from("contracts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: (_d, _e, vars) => void qc.invalidateQueries({ queryKey: ["contracts", vars.profile_id] }),
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; profile_id: string }) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: (_d, _e, vars) => void qc.invalidateQueries({ queryKey: ["contracts", vars.profile_id] }),
  });
}

export function useEmployeeDocuments(profileId: string | undefined) {
  return useQuery({
    queryKey: ["employee-documents", profileId],
    queryFn: async (): Promise<EmployeeDocument[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("profile_id", profileId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
  });
}

/** Object path is `${profileId}/...`, matching the leave-attachments folder-scoping convention (migration 0033). */
export function useUploadEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      profileId,
      category,
      uploadedBy,
    }: {
      file: File;
      profileId: string;
      category: DocumentCategory;
      uploadedBy: string;
    }): Promise<EmployeeDocument> => {
      const path = `${profileId}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("employee-documents").upload(path, file);
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from("documents")
        .insert({ profile_id: profileId, category, file_path: path, file_name: file.name, uploaded_by: uploadedBy })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: (_d, _e, vars) => void qc.invalidateQueries({ queryKey: ["employee-documents", vars.profileId] }),
  });
}

export function useDeleteEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Pick<EmployeeDocument, "id" | "file_path" | "profile_id">) => {
      const { error: rmErr } = await supabase.storage.from("employee-documents").remove([doc.file_path]);
      if (rmErr) throw rmErr;
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSettled: (_d, _e, vars) => void qc.invalidateQueries({ queryKey: ["employee-documents", vars.profile_id] }),
  });
}

/** Bucket is private — every download needs a short-lived signed URL, no public getPublicUrl(). */
export async function employeeDocumentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("employee-documents").createSignedUrl(path, 5 * 60);
  if (error) return null;
  return data.signedUrl;
}
