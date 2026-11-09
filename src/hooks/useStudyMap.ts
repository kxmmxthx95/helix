import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
export type StudyMapTemplate = { id: string; name: string; theme: "forest" };
export type StudyMapAssignment = { plan_subject_id: string; grade_level_id: string; map_id: string };

export function useStudyMapLibrary() {
  return useQuery({ queryKey: ["study-map", "library"], queryFn: async () => {
    const { data, error } = await supabase.from("study_map_library").select("*").order("name");
    if (error) throw error;
    return data;
  }});
}
export function useStudyMapAssignment(subject: string, grade: string) {
  return useQuery({ queryKey: ["study-map", "assignment", subject, grade], enabled: !!subject && !!grade, queryFn: async () => {
    const { data, error } = await supabase.from("study_map_assignments").select("*").eq("plan_subject_id", subject).eq("grade_level_id", grade).maybeSingle();
    if (error) throw error;
    return data;
  }});
}
export async function saveMapAssignment(value: StudyMapAssignment) {
  const { data, error } = await supabase.from("study_map_assignments").upsert(value, { onConflict: "plan_subject_id,grade_level_id" }).select("*").single();
  if (error) throw error;
  return data;
}
export async function renameStudyMap(value: { id: string; name: string }) {
  const name = value.name.trim();
  if (!name || name.length > 100) throw new Error("ชื่อแผนที่ต้องมี 1–100 ตัวอักษร");
  const { data, error } = await supabase.from("study_map_library").update({ name }).eq("id", value.id).select("*").single();
  if (error) throw error;
  return data;
}
export function useSaveMapAssignment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: saveMapAssignment, onSuccess: () => qc.invalidateQueries({ queryKey: ["study-map", "assignment"] }) });
}
export function useRenameStudyMap() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: renameStudyMap, onSuccess: () => qc.invalidateQueries({ queryKey: ["study-map", "library"] }) });
}
