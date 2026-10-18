import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocPrintRequest } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// รายการพิมพ์ — see migration 0093.

export type PrintRequestRow = DocPrintRequest & {
  /** null when the viewer may not read the document (doc_files RLS). */
  file: { title: string; file_name: string; file_path: string; subjectLabel: string; gradeCode: string; lessonName: string } | null;
  requester: string;
};

export function usePrintRequests() {
  return useQuery({
    queryKey: ["doc_print_requests"],
    queryFn: async (): Promise<PrintRequestRow[]> => {
      const { data, error } = await supabase
        .from("doc_print_requests")
        .select(
          "*, requester:profiles!requested_by(first_name, last_name), doc_files(title, file_name, file_path, doc_lessons(name, grade_levels(code), subjects(code, name_th)))",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      type Raw = DocPrintRequest & {
        requester: { first_name: string; last_name: string } | null;
        doc_files: {
          title: string;
          file_name: string;
          file_path: string;
          doc_lessons: { name: string; grade_levels: { code: string } | null; subjects: { code: string; name_th: string } | null } | null;
        } | null;
      };
      return (data as unknown as Raw[]).map(({ requester, doc_files: f, ...r }) => ({
        ...r,
        requester: requester ? `${requester.first_name} ${requester.last_name}` : "-",
        file: f && {
          title: f.title,
          file_name: f.file_name,
          file_path: f.file_path,
          subjectLabel: f.doc_lessons?.subjects ? `${f.doc_lessons.subjects.code} ${f.doc_lessons.subjects.name_th}` : "",
          gradeCode: f.doc_lessons?.grade_levels?.code ?? "",
          lessonName: f.doc_lessons?.name ?? "",
        },
      }));
    },
  });
}

function useWrite<V>(fn: (v: V) => PromiseLike<{ error: Error | null }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: V) => {
      const { error } = await fn(v);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["doc_print_requests"] }),
  });
}

/** Queue several documents in one insert, 1 copy each (editable afterwards). */
export const useAddPrintRequests = () =>
  useWrite((docFileIds: string[]) =>
    supabase.from("doc_print_requests").insert(docFileIds.map((doc_file_id) => ({ doc_file_id }))),
  );
export const useUpdatePrintRequest = () =>
  useWrite((v: { id: string; copies?: number; note?: string | null }) => {
    const { id, ...patch } = v;
    return supabase.from("doc_print_requests").update(patch).eq("id", id);
  });
export const useMarkPrinted = () =>
  useWrite((id: string) => supabase.from("doc_print_requests").update({ status: "printed" }).eq("id", id));
export const useDeletePrintRequest = () =>
  useWrite((id: string) => supabase.from("doc_print_requests").delete().eq("id", id));
