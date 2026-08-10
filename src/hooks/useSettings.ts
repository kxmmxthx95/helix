import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DepartmentSettings, SchoolSettings } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const LOGO_PATH = "logo"; // fixed name, no extension — always overwrites, no orphaned files

export function useSchoolSettings() {
  return useQuery({
    queryKey: ["school_settings"],
    queryFn: async (): Promise<SchoolSettings> => {
      const { data, error } = await supabase.from("school_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });
}

export type SchoolSettingsEdit = Pick<SchoolSettings, "name_th" | "name_en">;

export function useUpdateSchoolSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SchoolSettingsEdit) => {
      const { error } = await supabase.from("school_settings").update(patch).eq("id", 1);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["school_settings"] }),
  });
}

/** Uploads to the public school-assets bucket and points school_settings.logo_path at it. */
export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { error: upErr } = await supabase.storage
        .from("school-assets")
        .upload(LOGO_PATH, file, { upsert: true });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("school_settings")
        .update({ logo_path: LOGO_PATH })
        .eq("id", 1);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["school_settings"] }),
  });
}

/** Cache-busted with updated_at so a re-upload shows immediately, not the CDN's stale copy. */
export function schoolLogoUrl(settings: Pick<SchoolSettings, "logo_path" | "updated_at">): string | null {
  if (!settings.logo_path) return null;
  const { data } = supabase.storage.from("school-assets").getPublicUrl(settings.logo_path);
  return `${data.publicUrl}?v=${encodeURIComponent(settings.updated_at)}`;
}

export function useDepartmentSettings(departmentId: string | null) {
  return useQuery({
    queryKey: ["department_settings", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<DepartmentSettings> => {
      const { data, error } = await supabase
        .from("department_settings")
        .select("*")
        .eq("department_id", departmentId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export type DepartmentSettingsEdit = Pick<
  DepartmentSettings,
  "score_collect_pct" | "score_exam_pct" | "min_periods_per_week" | "max_periods_per_week"
>;

export function useUpdateDepartmentSettings(departmentId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: DepartmentSettingsEdit) => {
      if (!departmentId) throw new Error("no department");
      const { error } = await supabase
        .from("department_settings")
        .update(patch)
        .eq("department_id", departmentId);
      if (error) throw error;
    },
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: ["department_settings", departmentId] }),
  });
}
