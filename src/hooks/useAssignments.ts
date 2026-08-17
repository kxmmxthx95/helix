import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssignmentSubmission, ScoreItem, SubmissionAttachment } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// Google Classroom–style student/parent side — see migration 0039 and
// useScoreRecording.ts (teacher side: posting, attachments, grading). A
// score_item with `description` set is a posted assignment; `due_date`/
// `requires_submission` drive the status shown here.

/** App-enforced cap (no DB constraint elsewhere in this app has one either — see Leave.tsx). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

export type AssignmentStatus = "missing" | "submitted" | "late" | "graded";

export function assignmentStatus(
  item: Pick<ScoreItem, "due_date" | "requires_submission">,
  submission: AssignmentSubmission | null,
  graded: boolean,
): AssignmentStatus {
  if (graded) return "graded";
  if (!submission) return "missing";
  if (item.due_date && submission.submitted_at.slice(0, 10) > item.due_date) return "late";
  return "submitted";
}

// -------------------------------------------------------------------- to-do list

/** This student's current homeroom classroom+year — assignments are always whole-class (see 0039), so this is the join key. */
async function currentClassroomFor(studentId: string): Promise<{ classroomId: string; academicYear: number } | null> {
  const { data, error } = await supabase
    .from("student_classroom_enrollments")
    .select("classroom_id, academic_year, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data[0] as { classroom_id: string; academic_year: number } | undefined;
  return row ? { classroomId: row.classroom_id, academicYear: row.academic_year } : null;
}

export type MyAssignment = ScoreItem & { subjectCode: string; subjectName: string };

/** Cross-subject to-do list for one student (self or a parent's child) — grilled: no per-class stream, one combined list. */
export function useMyAssignments(studentId: string | null) {
  return useQuery({
    queryKey: ["assignments", "my", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<MyAssignment[]> => {
      const classroom = await currentClassroomFor(studentId!);
      if (!classroom) return [];
      const { data, error } = await supabase
        .from("score_items")
        .select(
          "*, teaching_assignment:teaching_assignments!inner(classroom_id, academic_year, subject:subjects(code, name_th))",
        )
        .eq("teaching_assignment.classroom_id", classroom.classroomId)
        .eq("teaching_assignment.academic_year", classroom.academicYear)
        .not("description", "is", null)
        .lte("publish_at", new Date().toISOString())
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      type Row = ScoreItem & { teaching_assignment: { subject: { code: string; name_th: string } | null } };
      return (data as unknown as Row[]).map(({ teaching_assignment, ...row }) => ({
        ...row,
        subjectCode: teaching_assignment.subject?.code ?? "—",
        subjectName: teaching_assignment.subject?.name_th ?? "—",
      }));
    },
  });
}

/**
 * All of this student's item scores in one query (not one per assignment) —
 * RLS on student_item_scores already resolves row-by-row through
 * score_items -> can_read_teaching_assignment, so an unscoped
 * `eq("student_id", ...)` naturally returns only what the caller (self or
 * guardian) may see.
 */
export function useMyItemScores(studentId: string | null) {
  return useQuery({
    queryKey: ["assignments", "my_scores", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<Map<string, { score: number; feedback: string | null }>> => {
      const { data, error } = await supabase
        .from("student_item_scores")
        .select("score_item_id, score, feedback")
        .eq("student_id", studentId!);
      if (error) throw error;
      return new Map(data.map((r) => [r.score_item_id, { score: r.score, feedback: r.feedback }]));
    },
  });
}

// -------------------------------------------------------------------- submission

/** All of this student's submissions in one query — same RLS-bounded-batch trick as useMyItemScores. Used for summary counts (e.g. Dashboard). */
export function useMySubmissions(studentId: string | null) {
  return useQuery({
    queryKey: ["assignment_submissions", "my", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<Map<string, AssignmentSubmission>> => {
      const { data, error } = await supabase.from("assignment_submissions").select("*").eq("student_id", studentId!);
      if (error) throw error;
      return new Map(data.map((r) => [r.score_item_id, r]));
    },
  });
}

export function useSubmission(scoreItemId: string | null, studentId: string | null) {
  return useQuery({
    queryKey: ["assignment_submissions", scoreItemId, studentId],
    enabled: !!scoreItemId && !!studentId,
    queryFn: async (): Promise<(AssignmentSubmission & { attachments: SubmissionAttachment[] }) | null> => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*, attachments:submission_attachments(*)")
        .eq("score_item_id", scoreItemId!)
        .eq("student_id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as (AssignmentSubmission & { attachments: SubmissionAttachment[] }) | null;
    },
  });
}

/** Teacher-side: every submission for one posted assignment, for the grading list. */
export function useAssignmentSubmissions(scoreItemId: string | null) {
  return useQuery({
    queryKey: ["assignment_submissions", "all", scoreItemId],
    enabled: !!scoreItemId,
    queryFn: async (): Promise<(AssignmentSubmission & { attachments: SubmissionAttachment[] })[]> => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*, attachments:submission_attachments(*)")
        .eq("score_item_id", scoreItemId!);
      if (error) throw error;
      return data as unknown as (AssignmentSubmission & { attachments: SubmissionAttachment[] })[];
    },
  });
}

const SUBMISSIONS_BUCKET = "assignment-submissions";

/** Upserts the text content, then uploads any new files — same upload-then-point-row-at-path shape as useAvatar.ts/useLeave.ts. */
export function useSubmitAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scoreItemId,
      studentId,
      content,
      files,
    }: {
      scoreItemId: string;
      studentId: string;
      content: string | null;
      files: File[];
    }) => {
      if (files.length > MAX_ATTACHMENTS) throw new Error(`แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS} ไฟล์`);
      if (files.some((f) => f.size > MAX_ATTACHMENT_BYTES)) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 10MB");

      const { data: submission, error } = await supabase
        .from("assignment_submissions")
        .upsert(
          { score_item_id: scoreItemId, student_id: studentId, content, submitted_at: new Date().toISOString() },
          { onConflict: "score_item_id,student_id" },
        )
        .select()
        .single();
      if (error) throw error;

      for (const file of files) {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
        const path = `${scoreItemId}/${studentId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
        const { error: upErr } = await supabase.storage.from(SUBMISSIONS_BUCKET).upload(path, file);
        if (upErr) throw upErr;
        const { error: attErr } = await supabase
          .from("submission_attachments")
          .insert({ submission_id: submission.id, storage_path: path, file_name: file.name });
        if (attErr) throw attErr;
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["assignment_submissions"] });
      void qc.invalidateQueries({ queryKey: ["assignments"] });
    },
  });
}

/** Teacher-only — lets a student resubmit after a grade was already given (see the assignment_submissions_resubmit_check trigger, 0039). */
export function useReopenSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reopened }: { id: string; reopened: boolean }) => {
      const { error } = await supabase.from("assignment_submissions").update({ reopened }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["assignment_submissions"] }),
  });
}

/** Private bucket — no public URL, sign one on demand (same pattern as Leave.tsx's openAttachment). */
export async function signedSubmissionAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(SUBMISSIONS_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
