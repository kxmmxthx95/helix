import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DOC_MAX_BYTES, DOC_MIME_TYPES } from "@/hooks/useDocuments";
import type { DocTask, DocTaskFile } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// งานเอกสาร — see migration 0072. Tasks/files come back already scoped by RLS
// (admin: all, dept_head: own department, teacher: tasks that target them).

const BUCKET = "subject-documents";

export function useDocTasks() {
  return useQuery({
    queryKey: ["doc_tasks"],
    queryFn: async (): Promise<DocTask[]> => {
      const { data, error } = await supabase.from("doc_tasks").select("*").order("due_date");
      if (error) throw error;
      return data;
    },
  });
}

export function useDocTaskFiles() {
  return useQuery({
    queryKey: ["doc_task_files"],
    queryFn: async (): Promise<DocTaskFile[]> => {
      const { data, error } = await supabase.from("doc_task_files").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export type DocTaskDraft = Pick<
  DocTask,
  "title" | "description" | "doc_type" | "due_date" | "department_id" | "learning_area_id" | "created_by"
>;

export function useCreateDocTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: DocTaskDraft) => {
      const { error } = await supabase.from("doc_tasks").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_tasks"] }),
  });
}

/** Files hang off the task by FK cascade; their Storage objects are removed first. */
export function useDeleteDocTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data } = await supabase.from("doc_task_files").select("file_path").eq("task_id", taskId);
      const paths = (data ?? []).map((f) => f.file_path);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      const { error } = await supabase.from("doc_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["doc_tasks"] });
      void qc.invalidateQueries({ queryKey: ["doc_task_files"] });
    },
  });
}

export function useUploadDocTaskFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      taskId,
      teacherId,
      title,
    }: {
      file: File;
      taskId: string;
      teacherId: string;
      title: string;
    }) => {
      if (!DOC_MIME_TYPES.includes(file.type)) throw new Error("ชนิดไฟล์ไม่รองรับ");
      if (file.size > DOC_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 20 MB");
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
      const path = `tasks/${taskId}/${teacherId}/${crypto.randomUUID()}${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from("doc_task_files").insert({
        task_id: taskId,
        teacher_id: teacherId,
        title,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_task_files"] }),
  });
}

export function useDeleteDocTaskFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: DocTaskFile) => {
      const { error } = await supabase.from("doc_task_files").delete().eq("id", file.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([file.file_path]);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_task_files"] }),
  });
}
