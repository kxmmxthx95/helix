import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocFile, DocLesson, DocTopic, GradeLevel } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// เอกสาร — วิชา -> ระดับชั้น -> เนื้อหาหลัก -> เนื้อหาย่อย -> ไฟล์.
// Own catalog (not practice_lessons). See migration 0071.

const BUCKET = "subject-documents";
export const DOC_MAX_BYTES = 20 * 1024 * 1024;
/** Mirrors the bucket's allowed_mime_types — checked client-side for a friendly error before upload. */
export const DOC_ACCEPT =
  ".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.gif";
export const DOC_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Every grade level RLS lets the caller see, for the grade picker. */
export function useAllGradeLevels() {
  return useQuery({
    queryKey: ["grade_levels", "all"],
    queryFn: async (): Promise<GradeLevel[]> => {
      const { data, error } = await supabase.from("grade_levels").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

// ------------------------------------------------------------------- lessons

export function useDocLessons(subjectId: string | null, gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["doc_lessons", subjectId, gradeLevelId],
    enabled: !!subjectId && !!gradeLevelId,
    queryFn: async (): Promise<DocLesson[]> => {
      const { data, error } = await supabase
        .from("doc_lessons")
        .select("*")
        .eq("subject_id", subjectId!)
        .eq("grade_level_id", gradeLevelId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDocLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { subject_id: string; grade_level_id: string; name: string; sort_order?: number }) => {
      const { error } = await supabase.from("doc_lessons").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_lessons"] }),
  });
}

export function useUpdateDocLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("doc_lessons").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_lessons"] }),
  });
}

// -------------------------------------------------------------------- topics

export function useDocTopics(lessonId: string | null) {
  return useQuery({
    queryKey: ["doc_topics", lessonId],
    enabled: !!lessonId,
    queryFn: async (): Promise<DocTopic[]> => {
      const { data, error } = await supabase
        .from("doc_topics")
        .select("*")
        .eq("lesson_id", lessonId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDocTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { lesson_id: string; name: string; sort_order?: number }) => {
      const { error } = await supabase.from("doc_topics").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_topics"] }),
  });
}

export function useUpdateDocTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("doc_topics").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_topics"] }),
  });
}

// --------------------------------------------------------------------- files

export function useDocFiles(topicId: string | null) {
  return useQuery({
    queryKey: ["doc_files", topicId],
    enabled: !!topicId,
    queryFn: async (): Promise<DocFile[]> => {
      const { data, error } = await supabase
        .from("doc_files")
        .select("*")
        .eq("topic_id", topicId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** Checks type/size, uploads to the private bucket under `${topicId}/`, then inserts the row; removes the object again if the insert fails. */
export function useUploadDocFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      topicId,
      title,
      description,
      uploadedBy,
    }: {
      file: File;
      topicId: string;
      title: string;
      description: string | null;
      uploadedBy: string;
    }) => {
      if (!DOC_MIME_TYPES.includes(file.type)) throw new Error("ชนิดไฟล์ไม่รองรับ");
      if (file.size > DOC_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 20 MB");
      // Storage keys must be ASCII-safe; the original name is kept in file_name.
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
      const path = `${topicId}/${crypto.randomUUID()}${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from("doc_files").insert({
        topic_id: topicId,
        title,
        description,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: uploadedBy,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
    },
    onSettled: (_d, _e, vars) => void qc.invalidateQueries({ queryKey: ["doc_files", vars.topicId] }),
  });
}

export function useDeleteDocFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: Pick<DocFile, "id" | "file_path">) => {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([file.file_path]);
      if (rmErr) throw rmErr;
      const { error } = await supabase.from("doc_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_files"] }),
  });
}

/** Bucket is private — every open needs a short-lived signed URL. */
export async function docFileSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  return error ? null : data.signedUrl;
}

// ------------------------------------------------------------ cascade delete

type Scope = { lessonId: string } | { topicId: string };

/** Paths of every file under a lesson or topic — for the "จะลบเอกสาร N ไฟล์ด้วย" confirm and the pre-delete Storage cleanup. */
export async function docFilePaths(scope: Scope): Promise<string[]> {
  let topicIds: string[];
  if ("topicId" in scope) topicIds = [scope.topicId];
  else {
    const { data, error } = await supabase.from("doc_topics").select("id").eq("lesson_id", scope.lessonId);
    if (error) throw error;
    topicIds = data.map((t) => t.id);
  }
  if (topicIds.length === 0) return [];
  const { data, error } = await supabase.from("doc_files").select("file_path").in("topic_id", topicIds);
  if (error) throw error;
  return data.map((f) => f.file_path);
}

// The DB cascade can't reach Storage, so objects are removed first; a failure
// there aborts before any row is deleted (no orphaned rows pointing at nothing).
async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

export function useDeleteDocLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paths }: { id: string; paths: string[] }) => {
      await removeObjects(paths);
      const { error } = await supabase.from("doc_lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_lessons"] }),
  });
}

export function useDeleteDocTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paths }: { id: string; paths: string[] }) => {
      await removeObjects(paths);
      const { error } = await supabase.from("doc_topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_topics"] }),
  });
}
