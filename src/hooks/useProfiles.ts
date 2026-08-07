import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Department, Profile } from "@/lib/database.types";
import type { Role } from "@/lib/roles";
import { supabase } from "@/lib/supabase";

export type ProfileFilters = {
  search: string;
  departmentId: string; // "" = ทุกแผนก
  role: Role | "";
  active: "" | "true" | "false";
};

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // Departments change roughly never.
  });
}

export function useProfiles(filters: ProfileFilters) {
  return useQuery({
    queryKey: ["profiles", filters],
    queryFn: async (): Promise<Profile[]> => {
      let q = supabase.from("profiles").select("*").order("full_name");

      // RLS already scopes this to the caller's department; these filters
      // only narrow what they are allowed to see, never widen it.
      if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
      if (filters.role) q = q.eq("role", filters.role);
      if (filters.active) q = q.eq("is_active", filters.active === "true");
      if (filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        q = q.or(`full_name.ilike.${term},email.ilike.${term}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    placeholderData: (previous) => previous, // No flash-to-empty while filtering.
  });
}

export type ProfileEdit = Pick<
  Profile,
  "full_name" | "email" | "phone" | "role" | "department_id" | "is_active"
>;

export function useUpdateProfile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: ProfileEdit & { id: string }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    // Optimistic: the row changes under the finger, the write follows.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["profiles"] });
      const snapshots = qc.getQueriesData<Profile[]>({ queryKey: ["profiles"] });

      qc.setQueriesData<Profile[]>({ queryKey: ["profiles"] }, (rows) =>
        rows?.map((r) => (r.id === next.id ? { ...r, ...next } : r)),
      );

      return { snapshots };
    },
    onError: (_err, _next, ctx) => {
      ctx?.snapshots.forEach(([key, rows]) => qc.setQueryData(key, rows));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}
