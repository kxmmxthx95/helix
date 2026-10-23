import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocFile, DocLesson, DocTopic, GradeLevel, SubjectType } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { supabase } from "@/lib/supabase";

// เอกสาร — วิชา -> ระดับชั้น -> เนื้อหาหลัก -> เนื้อหาย่อย (ไม่บังคับ) -> ไฟล์.
// Own catalog (not practice_lessons). See migration 0071.

const BUCKET = "subject-documents";
export const DOC_MAX_BYTES = 30 * 1024 * 1024;
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

// -------------------------------------------------------------------- topics
// เนื้อหาย่อย under a เนื้อหาหลัก. A file may point at one (doc_files.topic_id) or sit
// directly under the lesson with none. Storage paths stay `${lessonId}/...`.

const refreshTopics = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ["doc_topics"] }).then(() => qc.invalidateQueries({ queryKey: ["doc_summary"] }));

export function useDocTopics(lessonId: string | null) {
  return useQuery({
    queryKey: ["doc_topics", lessonId],
    enabled: !!lessonId,
    queryFn: async (): Promise<DocTopic[]> => {
      const { data, error } = await supabase
        .from("doc_topics")
        .select("*")
        .eq("lesson_id", lessonId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDocTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { lesson_id: string; name: string; sort_order: number }) => {
      const { error } = await supabase.from("doc_topics").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void refreshTopics(qc),
  });
}

export function useUpdateDocTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("doc_topics").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void refreshTopics(qc),
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

/** supabase-js has no upload progress, so POST to the Storage REST endpoint with XHR (same call supabase-js makes). */
async function uploadWithProgress(path: string, file: File, onProgress?: (pct: number) => void) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("หมดเวลาเข้าสู่ระบบ");
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_ANON_KEY);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("อัพโหลดไม่สำเร็จ")));
    xhr.onerror = () => reject(new Error("อัพโหลดไม่สำเร็จ"));
    xhr.send(form);
  });
}

/** The เอกสาร lesson (วิชา + ระดับชั้น + ชื่อบท) a file hangs under — created on first use. Returns its id. */
export async function findOrCreateDocLesson(subjectId: string, gradeLevelId: string, name: string): Promise<string> {
  const { data: found, error } = await supabase
    .from("doc_lessons")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("grade_level_id", gradeLevelId)
    .eq("name", name)
    .limit(1);
  if (error) throw error;
  if (found[0]) return found[0].id;
  const { data, error: insErr } = await supabase
    .from("doc_lessons")
    .insert({ subject_id: subjectId, grade_level_id: gradeLevelId, name })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return data.id;
}

/** Checks type/size, uploads to the private bucket under `${lessonId}/`, then inserts the row and returns its id; removes the object again if the insert fails. */
export function useUploadDocFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      lessonId,
      topicId = null,
      title,
      description,
      uploadedBy,
      onProgress,
    }: {
      file: File;
      lessonId: string;
      topicId?: string | null;
      title: string;
      description: string | null;
      uploadedBy: string;
      onProgress?: (pct: number) => void;
    }) => {
      if (!DOC_MIME_TYPES.includes(file.type)) throw new Error("ชนิดไฟล์ไม่รองรับ");
      if (file.size > DOC_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 30 MB");
      // Storage keys must be ASCII-safe; the original name is kept in file_name.
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
      const path = `${lessonId}/${crypto.randomUUID()}${ext}`;
      await uploadWithProgress(path, file, onProgress);
      const { data: row, error } = await supabase.from("doc_files").insert({
        lesson_id: lessonId,
        topic_id: topicId,
        title,
        description,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: uploadedBy,
      }).select("id").single();
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return row.id;
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

/** Paths of every file under one เนื้อหาย่อย — for the delete confirm and Storage cleanup. */
export async function docTopicFilePaths(topicId: string): Promise<string[]> {
  const { data, error } = await supabase.from("doc_files").select("file_path").eq("topic_id", topicId);
  if (error) throw error;
  return data.map((f) => f.file_path);
}

/** Deletes a เนื้อหาย่อย and (via the FK cascade) its files; Storage objects go first, same as a lesson. */
export function useDeleteDocTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paths }: { id: string; paths: string[] }) => {
      await removeObjects(paths);
      const { error } = await supabase.from("doc_topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void refreshTopics(qc).then(() => qc.invalidateQueries({ queryKey: ["doc_files"] })),
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

export type DocLessonNode = DocLesson & { fileCount: number; topicCount: number };

/** Lessons of one (subject, grade) with per-lesson file counts. Keyed under "doc_summary" so every file/lesson mutation (which already invalidates it) refreshes this too. */
export function useDocTree(subjectId: string | null, gradeLevelId: string | null) {
  return useQuery({
    queryKey: ["doc_summary", "tree", subjectId, gradeLevelId],
    enabled: !!subjectId && !!gradeLevelId,
    queryFn: async (): Promise<DocLessonNode[]> => {
      const { data, error } = await supabase
        .from("doc_lessons")
        .select("*, doc_files(count), doc_topics(count)")
        .eq("subject_id", subjectId!)
        .eq("grade_level_id", gradeLevelId!)
        .order("sort_order");
      if (error) throw error;
      const rows = data as unknown as (DocLesson & { doc_files: { count: number }[]; doc_topics: { count: number }[] })[];
      return rows.map(({ doc_files, doc_topics, ...lesson }) => ({
        ...lesson,
        fileCount: doc_files[0]?.count ?? 0,
        topicCount: doc_topics[0]?.count ?? 0,
      }));
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

export type RecentDocFile = DocFile & {
  doc_lessons: { name: string; subjects: { code: string; name_th: string } | null } | null;
  doc_topics: { name: string } | null;
  reviewer: { first_name: string; last_name: string } | null;
};

/** Uploads for the ตรวจเอกสาร tab: RLS returns files in subjects the caller can write plus files of teachers they review. */
export function useRecentDocFiles() {
  return useQuery({
    queryKey: ["doc_files", "recent"],
    queryFn: async (): Promise<RecentDocFile[]> => {
      const { data, error } = await supabase
        .from("doc_files")
        .select("*, doc_lessons(name, subjects(code, name_th)), doc_topics(name), reviewer:profiles!reviewed_by(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as RecentDocFile[];
    },
  });
}

/** Approve, or send back with a note (required) — through review_doc_file(), see migration 0076. */
export function useReviewDocFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fileId, status, note }: { fileId: string; status: "approved" | "returned"; note: string | null }) => {
      const { error } = await supabase.rpc("review_doc_file", { p_file_id: fileId, p_status: status, p_note: note });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_files"] }),
  });
}

// ------------------------------------------------------------------ coverage

export type CoverageLesson = { id: string; name: string; createdBy: string | null; sortOrder: number; topicCount: number; fileCount: number; /** Files not returned for rework — the ones that count as uploaded. */ okFileCount: number; lastAt: string; lastBy: string | null };
export type CoverageRow = {
  key: string;
  subjectId: string;
  code: string;
  nameTh: string;
  departmentId: string;
  learningAreaId: string;
  subjectType: SubjectType;
  gradeLevelId: string;
  gradeName: string;
  gradeSort: number;
  lessonTarget: number;
  topicTarget: number;
  lessons: CoverageLesson[];
};

type CoverageSubject = { code: string; name_th: string; department_id: string; learning_area_id: string; subject_type: SubjectType };
type CoverageGrade = { name: string; code: string; sort_order: number };
const SUBJECT_COLS = "code, name_th, department_id, learning_area_id, subject_type";

/** Every curriculum (subject x grade) plus any that already have lessons, with per-lesson topic/file counts and targets — for the ติดตามเนื้อหา tab. RLS limits lessons to what the caller reads. */
export function useDocCoverage() {
  return useQuery({
    queryKey: ["doc_summary", "coverage"],
    queryFn: async (): Promise<CoverageRow[]> => {
      const [cur, les, tgt] = await Promise.all([
        supabase
          .from("curriculum_subjects")
          .select(`subject_id, grade_level_id, subjects!inner(${SUBJECT_COLS}, is_active), grade_levels(name, code, sort_order)`)
          .eq("subjects.is_active", true),
        supabase
          .from("doc_lessons")
          .select(`*, subjects(${SUBJECT_COLS}), grade_levels(name, code, sort_order), doc_topics(count), doc_files(created_at, uploaded_by, review_status)`)
          .order("sort_order"),
        supabase.from("doc_targets").select("*"),
      ]);
      if (cur.error) throw cur.error;
      if (les.error) throw les.error;
      if (tgt.error) throw tgt.error;
      const targets = new Map(tgt.data.map((t) => [`${t.subject_id}:${t.grade_level_id}`, t]));
      const out = new Map<string, CoverageRow>();
      const row = (subjectId: string, gradeId: string, s: CoverageSubject | null, g: CoverageGrade | null) => {
        const key = `${subjectId}:${gradeId}`;
        let r = out.get(key);
        if (!r && s) {
          const t = targets.get(key);
          r = {
            key, subjectId, code: s.code, nameTh: s.name_th, departmentId: s.department_id, learningAreaId: s.learning_area_id, subjectType: s.subject_type,
            gradeLevelId: gradeId, gradeName: g ? gradeShortLabel(g.code) : "—", gradeSort: g?.sort_order ?? 0,
            lessonTarget: t?.lesson_target ?? 0, topicTarget: t?.topic_target ?? 0, lessons: [],
          };
          out.set(key, r);
        }
        return r;
      };
      for (const c of cur.data as unknown as { subject_id: string; grade_level_id: string; subjects: CoverageSubject; grade_levels: CoverageGrade }[])
        row(c.subject_id, c.grade_level_id, c.subjects, c.grade_levels);
      for (const l of les.data as unknown as (DocLesson & {
        subjects: CoverageSubject | null;
        grade_levels: CoverageGrade | null;
        doc_topics: { count: number }[];
        doc_files: { created_at: string; uploaded_by: string; review_status: string }[];
      })[]) {
        row(l.subject_id, l.grade_level_id, l.subjects, l.grade_levels)?.lessons.push({
          id: l.id,
          name: l.name,
          sortOrder: l.sort_order,
          topicCount: l.doc_topics[0]?.count ?? 0,
          fileCount: l.doc_files.length,
          okFileCount: l.doc_files.filter((f) => f.review_status !== "returned").length,
          createdBy: l.created_by,
          lastAt: [l.updated_at, ...l.doc_files.map((f) => f.created_at)].sort().at(-1)!,
          lastBy: [...l.doc_files].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1)?.uploaded_by ?? null,
        });
      }
      return [...out.values()];
    },
  });
}

/** Sets the lesson / topic targets for (subject x grade) pairs — one row each, upserted on the pair. */
export function useSaveDocTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pairs, lessonTarget, topicTarget }: { pairs: { subjectId: string; gradeLevelId: string }[]; lessonTarget: number; topicTarget: number }) => {
      const { error } = await supabase.from("doc_targets").upsert(
        pairs.map((p) => ({ subject_id: p.subjectId, grade_level_id: p.gradeLevelId, lesson_target: lessonTarget, topic_target: topicTarget })),
        { onConflict: "subject_id,grade_level_id" },
      );
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_summary", "coverage"] }),
  });
}

/** teacher id -> "subjectId:gradeLevelId" pairs they teach in the latest academic year that has assignments — keys match CoverageRow.key. */
export function useTeacherPairs() {
  return useQuery({
    queryKey: ["teaching_assignments", "doc_pairs"],
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      const { data, error } = await supabase.from("teaching_assignments").select("teacher_id, subject_id, academic_year, classrooms(grade_level_id)");
      if (error) throw error;
      const rows = data as unknown as { teacher_id: string | null; subject_id: string; academic_year: number; classrooms: { grade_level_id: string } | null }[];
      const year = Math.max(0, ...rows.map((r) => r.academic_year));
      const out = new Map<string, Set<string>>();
      for (const r of rows) {
        if (r.academic_year !== year || !r.classrooms || !r.teacher_id) continue;
        const set = out.get(r.teacher_id) ?? new Set<string>();
        set.add(`${r.subject_id}:${r.classrooms.grade_level_id}`);
        out.set(r.teacher_id, set);
      }
      return out;
    },
  });
}
