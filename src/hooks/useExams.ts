import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ExamAttempt,
  ExamAttemptAnswer,
  ExamAttemptEventType,
  ExamQuestionChoiceForAttempt,
  ExamQuestionForAttempt,
  ExamSession,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// สอบออนไลน์ — sessions (an "opening" of hand-picked bank questions against
// the teacher's own classroom(s)) + student attempts. See migration 0047.

/** Latest enrollment row for one student — same "most recent wins" rule as useAssignments.ts's currentClassroomFor, exported here since the exam list needs it too. */
export function useMyCurrentClassroom(studentId: string | null) {
  return useQuery({
    queryKey: ["student_classroom_enrollments", "current", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<{ classroomId: string; academicYear: number } | null> => {
      const { data, error } = await supabase
        .from("student_classroom_enrollments")
        .select("classroom_id, academic_year, created_at")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data[0] as { classroom_id: string; academic_year: number } | undefined;
      return row ? { classroomId: row.classroom_id, academicYear: row.academic_year } : null;
    },
  });
}

// ------------------------------------------------------------------- sessions

export function useMyExamSessions(teacherId: string | null) {
  return useQuery({
    queryKey: ["exam_sessions", "by_teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async (): Promise<ExamSession[]> => {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select("*")
        .eq("teacher_id", teacherId!)
        .order("opens_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useExamSession(id: string | null) {
  return useQuery({
    queryKey: ["exam_sessions", id],
    enabled: !!id,
    queryFn: async (): Promise<ExamSession> => {
      const { data, error } = await supabase.from("exam_sessions").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export type ExamSessionQuestionRow = { question_id: string; position: number; points: number; prompt: string };

export function useExamSessionQuestions(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_session_questions", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamSessionQuestionRow[]> => {
      const { data, error } = await supabase
        .from("exam_session_questions")
        .select("question_id, position, points, question:exam_questions(prompt)")
        .eq("session_id", sessionId!)
        .order("position", { ascending: true });
      if (error) throw error;
      type Row = { question_id: string; position: number; points: number; question: { prompt: string } | null };
      return (data as unknown as Row[]).map((r) => ({
        question_id: r.question_id,
        position: r.position,
        points: r.points,
        prompt: r.question?.prompt ?? "—",
      }));
    },
  });
}

export function useExamSessionTargets(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_session_targets", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("exam_session_targets")
        .select("teaching_assignment_id")
        .eq("session_id", sessionId!);
      if (error) throw error;
      return data.map((r) => r.teaching_assignment_id);
    },
  });
}

/** Creates a session plus its targets + question set in one call. */
export function useCreateExamSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      subject_id: string;
      teacher_id: string;
      title: string;
      opens_at: string;
      closes_at: string;
      duration_minutes: number | null;
      max_attempts: number;
      shuffle_questions: boolean;
      shuffle_choices: boolean;
      sync_to_gradebook: boolean;
      teaching_assignment_ids: string[];
      questions: { question_id: string; points: number }[];
    }) => {
      const { teaching_assignment_ids, questions, ...session } = draft;
      const { data: inserted, error } = await supabase.from("exam_sessions").insert(session).select().single();
      if (error) throw error;

      if (teaching_assignment_ids.length > 0) {
        const { error: targetsError } = await supabase
          .from("exam_session_targets")
          .insert(teaching_assignment_ids.map((teaching_assignment_id) => ({ session_id: inserted.id, teaching_assignment_id })));
        if (targetsError) throw targetsError;
      }
      if (questions.length > 0) {
        const { error: questionsError } = await supabase.from("exam_session_questions").insert(
          questions.map((q, i) => ({ session_id: inserted.id, question_id: q.question_id, position: i, points: q.points })),
        );
        if (questionsError) throw questionsError;
      }
      return inserted as ExamSession;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_sessions"] }),
  });
}

export function useUpdateExamSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<
      Pick<
        ExamSession,
        "title" | "opens_at" | "closes_at" | "duration_minutes" | "max_attempts" | "shuffle_questions" | "shuffle_choices" | "sync_to_gradebook" | "review_released"
      >
    >) => {
      const { error } = await supabase.from("exam_sessions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_sessions"] }),
  });
}

export function useDeleteExamSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_sessions"] }),
  });
}

// --------------------------------------------------------- student: available exams

export type AvailableExam = ExamSession & { my_attempts: number };

/** Sessions targeting the student's current classroom, whole window (not just currently-open) — the UI splits into upcoming/open/closed by opens_at/closes_at itself. */
export function useAvailableExams(studentId: string | null, classroomId: string | null, academicYear: number | null) {
  return useQuery({
    queryKey: ["exam_sessions", "available", studentId, classroomId, academicYear],
    enabled: !!studentId && !!classroomId && !!academicYear,
    queryFn: async (): Promise<AvailableExam[]> => {
      const { data: targets, error: targetsError } = await supabase
        .from("exam_session_targets")
        .select("session_id, teaching_assignment:teaching_assignments!inner(classroom_id, academic_year)")
        .eq("teaching_assignment.classroom_id", classroomId!)
        .eq("teaching_assignment.academic_year", academicYear!);
      if (targetsError) throw targetsError;
      const sessionIds = [...new Set((targets as unknown as { session_id: string }[]).map((t) => t.session_id))];
      if (sessionIds.length === 0) return [];

      const [{ data: sessions, error: sessionsError }, { data: attempts, error: attemptsError }] = await Promise.all([
        supabase.from("exam_sessions").select("*").in("id", sessionIds).order("opens_at", { ascending: false }),
        supabase.from("exam_attempts").select("session_id").eq("student_id", studentId!).in("session_id", sessionIds),
      ]);
      if (sessionsError) throw sessionsError;
      if (attemptsError) throw attemptsError;

      const attemptCounts = new Map<string, number>();
      for (const a of attempts) attemptCounts.set(a.session_id, (attemptCounts.get(a.session_id) ?? 0) + 1);
      return sessions.map((s) => ({ ...s, my_attempts: attemptCounts.get(s.id) ?? 0 }));
    },
  });
}

// ------------------------------------------------------------------- attempts

/** The student's own attempts on one session, most recent first. */
export function useMyAttempts(sessionId: string | null, studentId: string | null) {
  return useQuery({
    queryKey: ["exam_attempts", "mine", sessionId, studentId],
    enabled: !!sessionId && !!studentId,
    queryFn: async (): Promise<ExamAttempt[]> => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("session_id", sessionId!)
        .eq("student_id", studentId!)
        .order("attempt_no", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Starts a fresh attempt, or resumes the existing in_progress one if a refresh/drop already created it — never double-inserts (unique session_id+student_id+attempt_no plus this read-first check). */
export function useStartOrResumeAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      studentId,
      questionIds,
      shuffle,
    }: {
      sessionId: string;
      studentId: string;
      questionIds: string[];
      shuffle: boolean;
    }): Promise<ExamAttempt> => {
      const { data: existing, error: existingError } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("session_id", sessionId)
        .eq("student_id", studentId)
        .eq("status", "in_progress")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return existing;

      const { count, error: countError } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("student_id", studentId);
      if (countError) throw countError;

      const order = shuffle ? [...questionIds].sort(() => Math.random() - 0.5) : questionIds;
      const { data: inserted, error } = await supabase
        .from("exam_attempts")
        .insert({ session_id: sessionId, student_id: studentId, attempt_no: (count ?? 0) + 1, question_order: order })
        .select()
        .single();
      if (error) throw error;
      return inserted;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_attempts"] }),
  });
}

/** Answer-safe reads while an attempt is in progress — no correct_answer/is_correct in the payload (see exam_questions_for_attempt/exam_question_choices_for_attempt views, migration 0047). */
export function useAttemptQuestions(questionIds: string[]) {
  return useQuery({
    queryKey: ["exam_questions_for_attempt", ...questionIds],
    enabled: questionIds.length > 0,
    queryFn: async (): Promise<{ questions: ExamQuestionForAttempt[]; choicesByQuestion: Map<string, ExamQuestionChoiceForAttempt[]> }> => {
      const [{ data: questions, error: qError }, { data: choices, error: cError }] = await Promise.all([
        supabase.from("exam_questions_for_attempt").select("*").in("id", questionIds),
        supabase.from("exam_question_choices_for_attempt").select("*").in("question_id", questionIds).order("position"),
      ]);
      if (qError) throw qError;
      if (cError) throw cError;
      const choicesByQuestion = new Map<string, ExamQuestionChoiceForAttempt[]>();
      for (const c of choices as unknown as ExamQuestionChoiceForAttempt[]) {
        const list = choicesByQuestion.get(c.question_id) ?? [];
        list.push(c);
        choicesByQuestion.set(c.question_id, list);
      }
      return { questions: questions as unknown as ExamQuestionForAttempt[], choicesByQuestion };
    },
  });
}

export function useAttemptAnswers(attemptId: string | null) {
  return useQuery({
    queryKey: ["exam_attempt_answers", attemptId],
    enabled: !!attemptId,
    queryFn: async (): Promise<Map<string, ExamAttemptAnswer>> => {
      const { data, error } = await supabase.from("exam_attempt_answers").select("*").eq("attempt_id", attemptId!);
      if (error) throw error;
      return new Map(data.map((a) => [a.question_id, a]));
    },
  });
}

/** One question's answer, upserted on every change — autosave, no separate save button. */
export function useSaveAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (answer: { attempt_id: string; question_id: string; choice_id: string | null; short_answer: string | null }) => {
      const { error } = await supabase
        .from("exam_attempt_answers")
        .upsert({ ...answer, answered_at: new Date().toISOString() }, { onConflict: "attempt_id,question_id" });
      if (error) throw error;
    },
    onSettled: (_data, _err, vars) =>
      void qc.invalidateQueries({ queryKey: ["exam_attempt_answers", vars.attempt_id] }),
  });
}

export function useLogAttemptEvent() {
  return useMutation({
    mutationFn: async ({ attemptId, eventType }: { attemptId: string; eventType: ExamAttemptEventType }) => {
      const { error } = await supabase.from("exam_attempt_events").insert({ attempt_id: attemptId, event_type: eventType });
      if (error) throw error;
    },
  });
}

/** Grades server-side (submit_exam_attempt RPC) — the client never computes or trusts its own score. */
export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptId: string) => {
      const { error } = await supabase.rpc("submit_exam_attempt", { p_attempt_id: attemptId });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["exam_attempts"] });
      void qc.invalidateQueries({ queryKey: ["exam_attempt_answers"] });
    },
  });
}

// ------------------------------------------------------------- teacher: grading view

/** Every attempt on one session, for the teacher's results list. */
export function useSessionAttempts(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_attempts", "by_session", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamAttempt[]> => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("session_id", sessionId!)
        .order("submitted_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAttemptEvents(attemptId: string | null) {
  return useQuery({
    queryKey: ["exam_attempt_events", attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempt_events")
        .select("*")
        .eq("attempt_id", attemptId!)
        .order("at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
