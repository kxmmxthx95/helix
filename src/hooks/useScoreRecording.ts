import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignmentAttachment,
  GradeStatusCode,
  ScoreItem,
  ScoreItemKind,
  StudentGradeStatus,
  StudentItemScore,
  StudentPassFailScore,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------------ score_items
// ระบบบันทึกคะแนน — คะแนนเก็บ+สอบ share one item mechanism (see migration
// 0030). teaching_assignments.split_exam_items decides whether the caller
// lets a teacher manage several kind='exam' items or keeps exactly one
// app-managed item — that's a UI-level rule, not enforced here.

export function useScoreItems(teachingAssignmentId: string | null) {
  return useQuery({
    queryKey: ["score_items", teachingAssignmentId],
    enabled: !!teachingAssignmentId,
    queryFn: async (): Promise<ScoreItem[]> => {
      const { data, error } = await supabase
        .from("score_items")
        .select("*")
        .eq("teaching_assignment_id", teachingAssignmentId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Same insert either way — a draft with `description` set is a posted
 * Google Classroom–style assignment (see migration 0039); the plain
 * label+max_score draft the quick "เพิ่มรายการ" flow has always used still
 * works unchanged, just leaving those columns null.
 */
export function useCreateScoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      teaching_assignment_id: string;
      kind: ScoreItemKind;
      label: string;
      max_score: number;
      description?: string | null;
      due_date?: string | null;
      publish_at?: string;
      requires_submission?: boolean;
    }) => {
      const { data, error } = await supabase.from("score_items").insert(draft).select("id").single();
      if (error) throw error;
      return data;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["score_items"] }),
  });
}

export function useUpdateScoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...draft
    }: {
      id: string;
      label: string;
      max_score: number;
      description?: string | null;
      due_date?: string | null;
      publish_at?: string;
      requires_submission?: boolean;
    }) => {
      const { error } = await supabase.from("score_items").update(draft).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["score_items"] }),
  });
}

// -------------------------------------------------------------- assignment_attachments

export function useAssignmentAttachments(scoreItemId: string | null) {
  return useQuery({
    queryKey: ["assignment_attachments", scoreItemId],
    enabled: !!scoreItemId,
    queryFn: async (): Promise<AssignmentAttachment[]> => {
      const { data, error } = await supabase
        .from("assignment_attachments")
        .select("*")
        .eq("score_item_id", scoreItemId!)
        .order("uploaded_at");
      if (error) throw error;
      return data;
    },
  });
}

const ASSIGNMENT_ATTACHMENTS_BUCKET = "assignment-attachments";

export function useAddAssignmentAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ scoreItemId, file }: { scoreItemId: string; file: File }) => {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
      const path = `${scoreItemId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
      const { error: upErr } = await supabase.storage.from(ASSIGNMENT_ATTACHMENTS_BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("assignment_attachments")
        .insert({ score_item_id: scoreItemId, storage_path: path, file_name: file.name });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["assignment_attachments"] }),
  });
}

export function useDeleteAssignmentAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachment: AssignmentAttachment) => {
      await supabase.storage.from(ASSIGNMENT_ATTACHMENTS_BUCKET).remove([attachment.storage_path]);
      const { error } = await supabase.from("assignment_attachments").delete().eq("id", attachment.id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["assignment_attachments"] }),
  });
}

/** Private bucket — no public URL, sign one on demand (same pattern as Leave.tsx's openAttachment). */
export async function signedAssignmentAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(ASSIGNMENT_ATTACHMENTS_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export function useDeleteScoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("score_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["score_items"] });
      void qc.invalidateQueries({ queryKey: ["student_item_scores"] });
    },
  });
}

// ------------------------------------------------------------ student_item_scores

export function useStudentItemScores(teachingAssignmentId: string | null) {
  return useQuery({
    queryKey: ["student_item_scores", teachingAssignmentId],
    enabled: !!teachingAssignmentId,
    queryFn: async (): Promise<StudentItemScore[]> => {
      const { data, error } = await supabase
        .from("student_item_scores")
        .select("*, score_item:score_items!inner(teaching_assignment_id)")
        .eq("score_item.teaching_assignment_id", teachingAssignmentId!);
      if (error) throw error;
      return (data as unknown as (StudentItemScore & { score_item: unknown })[]).map(
        ({ score_item: _score_item, ...row }) => row,
      );
    },
  });
}

/** One cell of the grid — upserts on (score_item_id, student_id). */
export function useSaveStudentItemScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      score_item_id: string;
      student_id: string;
      score: number;
      feedback?: string | null;
    }) => {
      const { error } = await supabase
        .from("student_item_scores")
        .upsert(draft, { onConflict: "score_item_id,student_id" });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_item_scores"] }),
  });
}

// ------------------------------------------------------------ student_grade_status
// ร/มส override — presence of a row means the grade column shows the status
// code instead of the computed 0-4 grade. Doesn't touch item scores.

export function useGradeStatuses(teachingAssignmentId: string | null) {
  return useQuery({
    queryKey: ["student_grade_status", teachingAssignmentId],
    enabled: !!teachingAssignmentId,
    queryFn: async (): Promise<StudentGradeStatus[]> => {
      const { data, error } = await supabase
        .from("student_grade_status")
        .select("*")
        .eq("teaching_assignment_id", teachingAssignmentId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useSetGradeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { teaching_assignment_id: string; student_id: string; status: GradeStatusCode }) => {
      const { error } = await supabase
        .from("student_grade_status")
        .upsert(draft, { onConflict: "teaching_assignment_id,student_id" });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_grade_status"] }),
  });
}

/** Manual override when set, else auto-computed from attendance/submissions (see migration 0042). */
export function useResolvedGradeStatuses(teachingAssignmentId: string | null) {
  return useQuery({
    queryKey: ["resolved_grade_status", teachingAssignmentId],
    enabled: !!teachingAssignmentId,
    queryFn: async (): Promise<{ student_id: string; status: GradeStatusCode; is_manual: boolean }[]> => {
      const { data, error } = await supabase
        .from("resolved_grade_status")
        .select("student_id, status, is_manual")
        .eq("teaching_assignment_id", teachingAssignmentId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useClearGradeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teachingAssignmentId, studentId }: { teachingAssignmentId: string; studentId: string }) => {
      const { error } = await supabase
        .from("student_grade_status")
        .delete()
        .eq("teaching_assignment_id", teachingAssignmentId)
        .eq("student_id", studentId);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_grade_status"] }),
  });
}

// --------------------------------------------------------- student_pass_fail_scores
// The entire grade for a grading_method='pass_fail' assignment.

export function usePassFailScores(teachingAssignmentId: string | null) {
  return useQuery({
    queryKey: ["student_pass_fail_scores", teachingAssignmentId],
    enabled: !!teachingAssignmentId,
    queryFn: async (): Promise<StudentPassFailScore[]> => {
      const { data, error } = await supabase
        .from("student_pass_fail_scores")
        .select("*")
        .eq("teaching_assignment_id", teachingAssignmentId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useSetPassFailScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      teaching_assignment_id: string;
      student_id: string;
      passed: boolean;
      feedback?: string | null;
    }) => {
      const { error } = await supabase
        .from("student_pass_fail_scores")
        .upsert(draft, { onConflict: "teaching_assignment_id,student_id" });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["student_pass_fail_scores"] }),
  });
}

// -------------------------------------------------------------- score ratio
// teaching_assignments.score_collect_pct/score_exam_pct override — falls
// back to department_settings when unset (see migration 0030 comment: a
// teaching_assignment has no resolvable single curriculum_subjects row to
// sit between the two, since a classroom can mix cohorts/tracks — 0017).

export function useSaveAssignmentScorePct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      id: string;
      score_collect_pct: number | null;
      score_exam_pct: number | null;
      split_exam_items: boolean;
    }) => {
      const { id, ...patch } = draft;
      const { error } = await supabase.from("teaching_assignments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_assignments"] }),
  });
}

export function resolveScorePct(
  assignment: { score_collect_pct: number | null; score_exam_pct: number | null },
  department: { score_collect_pct: number | null; score_exam_pct: number | null } | null | undefined,
): { collectPct: number; examPct: number } | null {
  if (assignment.score_collect_pct !== null && assignment.score_exam_pct !== null) {
    return { collectPct: assignment.score_collect_pct, examPct: assignment.score_exam_pct };
  }
  if (department?.score_collect_pct != null && department.score_exam_pct != null) {
    return { collectPct: department.score_collect_pct, examPct: department.score_exam_pct };
  }
  return null;
}

// -------------------------------------------------------------- grade computation
// 0-4 band table is app-code-only (grill decision carried over from
// migration 0004) — เกณฑ์ สพฐ. มาตรฐาน.

const GRADE_BANDS: { min: number; grade: number }[] = [
  { min: 80, grade: 4 },
  { min: 75, grade: 3.5 },
  { min: 70, grade: 3 },
  { min: 65, grade: 2.5 },
  { min: 60, grade: 2 },
  { min: 55, grade: 1.5 },
  { min: 50, grade: 1 },
  { min: 0, grade: 0 },
];

export const scoreToGrade = (total: number): number =>
  GRADE_BANDS.find((b) => total >= b.min)?.grade ?? 0;

export type ItemTotals = { score: number; max: number };

export function sumItemScores(
  items: ScoreItem[],
  scores: StudentItemScore[],
  studentId: string,
  kind: ScoreItemKind,
): ItemTotals {
  const kindItems = items.filter((i) => i.kind === kind);
  const itemIds = new Set(kindItems.map((i) => i.id));
  const max = kindItems.reduce((sum, i) => sum + i.max_score, 0);
  const score = scores
    .filter((s) => s.student_id === studentId && itemIds.has(s.score_item_id))
    .reduce((sum, s) => sum + s.score, 0);
  return { score, max };
}
