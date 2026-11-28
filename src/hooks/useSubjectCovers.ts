import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubjectCoverLibrary } from "@/lib/database.types";
import { compressImage } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";

export const COVER_MAX_BYTES = 10 * 1024 * 1024; // mirrors the subject-covers bucket limit (0172)
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type CoverWithUsage = SubjectCoverLibrary & { usage: number };

export function useSubjectCoverLibrary() {
  return useQuery({
    queryKey: ["subject-cover-library"],
    queryFn: async (): Promise<CoverWithUsage[]> => {
      const [lib, used] = await Promise.all([
        supabase.from("subject_cover_library").select("*").order("created_at", { ascending: false }),
        supabase.from("subjects").select("cover_id").not("cover_id", "is", null),
      ]);
      if (lib.error) throw lib.error;
      if (used.error) throw used.error;
      const counts = new Map<string, number>();
      for (const r of used.data) if (r.cover_id) counts.set(r.cover_id, (counts.get(r.cover_id) ?? 0) + 1);
      return lib.data.map((c) => ({ ...c, usage: counts.get(c.id) ?? 0 }));
    },
  });
}

/** Cache-busted with updated_at so a replaced image shows at once. */
export function libraryCoverUrl(c: Pick<SubjectCoverLibrary, "id" | "updated_at">): string {
  const { data } = storage.from("subject-covers").getPublicUrl(`lib/${c.id}`);
  return `${data.publicUrl}?v=${encodeURIComponent(c.updated_at)}`;
}

async function putImage(id: string, file: File) {
  if (!COVER_TYPES.includes(file.type)) throw new Error("รองรับเฉพาะไฟล์ JPG, PNG, WebP");
  if (file.size > COVER_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
  const blob = await compressImage(file, 1600, 0.82);
  const { error } = await storage
    .from("subject-covers")
    .upload(`lib/${id}`, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) throw error;
}

/** Several files at once; the file name (minus extension) is the initial name. */
export function useUploadCovers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const { data, error } = await supabase
          .from("subject_cover_library")
          .insert({ name: file.name.replace(/\.[^.]+$/, "") })
          .select("id")
          .single();
        if (error) throw error;
        try {
          await putImage(data.id, file);
        } catch (e) {
          await supabase.from("subject_cover_library").delete().eq("id", data.id);
          throw e;
        }
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["subject-cover-library"] }),
  });
}

export function useReplaceCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, file }: { id: string; name: string; file: File }) => {
      await putImage(id, file);
      // Any update bumps updated_at; the DB trigger then touches bound subjects so their cache-buster changes.
      const { error } = await supabase.from("subject_cover_library").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["subject-cover-library"] });
      void qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

export function useRenameCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("subject_cover_library").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["subject-cover-library"] }),
  });
}

/** FK is on delete restrict — callers disable this while usage > 0. */
export function useDeleteCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subject_cover_library").delete().eq("id", id);
      if (error) throw error;
      await storage.from("subject-covers").remove([`lib/${id}`]);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["subject-cover-library"] }),
  });
}
