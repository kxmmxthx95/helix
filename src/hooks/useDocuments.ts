import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocFile, DocLesson, GradeLevel } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// เอกสาร — วิชา -> ระดับชั้น -> เนื้อหาหลัก -> ไฟล์.
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

export function useCreateDocLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { subject_id: string; grade_level_id: string; name: string; sort_order?: number }) => {
      const { error } = await supabase.from("doc_lessons").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_lessons"] }).then(() => qc.invalidateQueries({ queryKey: ["doc_summary"] })),
  });
}

export function useUpdateDocLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("doc_lessons").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_lessons"] }).then(() => qc.invalidateQueries({ queryKey: ["doc_summary"] })),
  });
}

// --------------------------------------------------------------------- files

export function useDocFiles(lessonId: string | null) {
  return useQuery({
    queryKey: ["doc_files", lessonId],
    enabled: !!lessonId,
    queryFn: async (): Promise<DocFile[]> => {
      const { data, error } = await supabase
        .from("doc_files")
        .select("*")
        .eq("lesson_id", lessonId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** Checks type/size, uploads to the private bucket under `${lessonId}/`, then inserts the row; removes the object again if the insert fails. */
export function useUploadDocFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      lessonId,
      title,
      description,
      uploadedBy,
    }: {
      file: File;
      lessonId: string;
      title: string;
      description: string | null;
      uploadedBy: string;
    }) => {
      if (!DOC_MIME_TYPES.includes(file.type)) throw new Error("ชนิดไฟล์ไม่รองรับ");
      if (file.size > DOC_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 20 MB");
      // Storage keys must be ASCII-safe; the original name is kept in file_name.
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
      const path = `${lessonId}/${crypto.randomUUID()}${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from("doc_files").insert({
        lesson_id: lessonId,
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
    onSettled: (_d, _e, vars) => void qc.invalidateQueries({ queryKey: ["doc_files", vars.lessonId] }).then(() => qc.invalidateQueries({ queryKey: ["doc_summary"] })),
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
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_files"] }).then(() => qc.invalidateQueries({ queryKey: ["doc_summary"] })),
  });
}

/** Bucket is private — every open needs a short-lived signed URL. */
export async function docFileSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  return error ? null : data.signedUrl;
}

// ------------------------------------------------------------ cascade delete

/** Paths of every file under a lesson — for the "จะลบเอกสาร N ไฟล์ด้วย" confirm and the pre-delete Storage cleanup. */
export async function docFilePaths(lessonId: string): Promise<string[]> {
  const { data, error } = await supabase.from("doc_files").select("file_path").eq("lesson_id", lessonId);
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
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_lessons"] }).then(() => qc.invalidateQueries({ queryKey: ["doc_summary"] })),
  });
}

// ------------------------------------------------------------------- summary

export type DocSubjectSummary = { gradeLevelIds: Set<string>; fileCount: number };

/** Per-subject grade levels that have lessons + total file count, for the subject cards. RLS already limits this to what the caller can read. */
export function useDocSummary() {
  return useQuery({
    queryKey: ["doc_summary"],
    queryFn: async (): Promise<Map<string, DocSubjectSummary>> => {
      const { data, error } = await supabase
        .from("doc_lessons")
        .select("subject_id, grade_level_id, doc_files(count)");
      if (error) throw error;
      const rows = data as unknown as {
        subject_id: string;
        grade_level_id: string;
        doc_files: { count: number }[];
      }[];
      const out = new Map<string, DocSubjectSummary>();
      for (const r of rows) {
        const s = out.get(r.subject_id) ?? { gradeLevelIds: new Set<string>(), fileCount: 0 };
        s.gradeLevelIds.add(r.grade_level_id);
        for (const f of r.doc_files) s.fileCount += f.count;
        out.set(r.subject_id, s);
      }
      return out;
    },
  });
}

/** Grade levels a subject is bound to in any academic year's curriculum (curriculum_subjects) — the grade tabs' source. */
export function useSubjectGradeLevelIds(subjectId: string | null) {
  return useQuery({
    queryKey: ["curriculum_subjects", "grade_levels_of", subjectId],
    enabled: !!subjectId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("curriculum_subjects")
        .select("grade_level_id")
        .eq("subject_id", subjectId!);
      if (error) throw error;
      return [...new Set(data.map((r) => r.grade_level_id))];
    },
  });
}

// ---------------------------------------------------------------------- tree

export type DocLessonNode = DocLesson & { fileCount: number };

/** Lessons of one (subject, grade) with per-lesson file counts. Keyed under "doc_summary" so every file/lesson mutation (which already invalidates it) refreshes this too. */
export function useDocTree(subjectId: string | null, gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["doc_summary", "tree", subjectId, gradeLevelId],
    enabled: !!subjectId && !!gradeLevelId,
    queryFn: async (): Promise<DocLessonNode[]> => {
      const { data, error } = await supabase
        .from("doc_lessons")
        .select("*, doc_files(count)")
        .eq("subject_id", subjectId!)
        .eq("grade_level_id", gradeLevelId!)
        .order("sort_order");
      if (error) throw error;
      const rows = data as unknown as (DocLesson & { doc_files: { count: number }[] })[];
      return rows.map(({ doc_files, ...lesson }) => ({ ...lesson, fileCount: doc_files[0]?.count ?? 0 }));
    },
  });
}

/** Classrooms of this grade that have a teaching assignment for the subject (any year) — the "ห้องเรียนที่ใช้" stat. */
export function useSubjectClassroomCount(subjectId: string | null, gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["teaching_assignments", "classroom_count", subjectId, gradeLevelId],
    enabled: !!subjectId && !!gradeLevelId,
    queryFn: async (): Promise<number> => {
      const { data: ta, error } = await supabase
        .from("teaching_assignments")
        .select("classroom_id")
        .eq("subject_id", subjectId!);
      if (error) throw error;
      const ids = [...new Set(ta.map((r) => r.classroom_id))];
      if (ids.length === 0) return 0;
      const { data, error: cErr } = await supabase
        .from("classrooms")
        .select("id")
        .in("id", ids)
        .eq("grade_level_id", gradeLevelId!);
      if (cErr) throw cErr;
      return data.length;
    },
  });
}
