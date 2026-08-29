import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ExamQuestion,
  ExamQuestionChoice,
  ExamQuestionDifficulty,
  PracticeAttempt,
  PracticeAttemptAnswer,
  PracticeLesson,
  PracticeSet,
  PracticeTopic,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// แบบฝึกหัด — ungraded, retry-anytime practice against the exam_questions
// bank. Separate from สอบออนไลน์ (useExams.ts). See migration 0053.

// ------------------------------------------------------ lessons/topics catalog
// วิชา -> บทเรียนหลัก -> เนื้อหาย่อย — the create-set flow's picker chain.
// See migration 0056.

export function usePracticeLessons(subjectId: string | null) {
  return useQuery({
    queryKey: ["practice_lessons", subjectId],
    enabled: !!subjectId,
    queryFn: async (): Promise<PracticeLesson[]> => {
      const { data, error } = await supabase
        .from("practice_lessons")
        .select("*")
        .eq("subject_id", subjectId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePracticeLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { subject_id: string; name: string; sort_order?: number }): Promise<PracticeLesson> => {
      const { data, error } = await supabase.from("practice_lessons").insert(draft).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_lessons"] }),
  });
}

export function useUpdatePracticeLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; sort_order?: number }) => {
      const { error } = await supabase.from("practice_lessons").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_lessons"] }),
  });
}

export function useDeletePracticeLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("practice_lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_lessons"] }),
  });
}

export function usePracticeTopics(lessonId: string | null) {
  return useQuery({
    queryKey: ["practice_topics", lessonId],
    enabled: !!lessonId,
    queryFn: async (): Promise<PracticeTopic[]> => {
      const { data, error } = await supabase
        .from("practice_topics")
        .select("*")
        .eq("lesson_id", lessonId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

/** Topics by id — used to resolve a practice_set's displayed name (its topic's name) in the sets list/detail without a per-set query. */
export function usePracticeTopicsByIds(topicIds: string[]) {
  return useQuery({
    queryKey: ["practice_topics", "by_ids", topicIds],
    enabled: topicIds.length > 0,
    queryFn: async (): Promise<PracticeTopic[]> => {
      const { data, error } = await supabase.from("practice_topics").select("*").in("id", topicIds);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePracticeTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { lesson_id: string; name: string; sort_order?: number }): Promise<PracticeTopic> => {
      const { data, error } = await supabase.from("practice_topics").insert(draft).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_topics"] }),
  });
}

export function useUpdatePracticeTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; sort_order?: number }) => {
      const { error } = await supabase.from("practice_topics").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_topics"] }),
  });
}

export function useDeletePracticeTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("practice_topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_topics"] }),
  });
}

/** Name-only lookup for practice_sets.created_by — the bank is shared across every teacher of a subject (see useMyPracticeSets), so the set list needs to show who authored each one. */
export function useProfilesByIds(ids: string[]) {
  return useQuery({
    queryKey: ["profiles", "by_ids", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<{ id: string; first_name: string; last_name: string }[]> => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
      if (error) throw error;
      return data;
    },
  });
}

/** Subjects the student is currently taught (via their current classroom's teaching_assignments) — same source the RLS policy reads, used to scope both the available-sets list and the self-serve subject picker. */
export function useMySubjects(classroomId: string | null, academicYear: number | null) {
  return useQuery({
    queryKey: ["teaching_assignments", "subjects_for_classroom", classroomId, academicYear],
    enabled: !!classroomId && !!academicYear,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("teaching_assignments")
        .select("subject_id")
        .eq("classroom_id", classroomId!)
        .eq("academic_year", academicYear!);
      if (error) throw error;
      return [...new Set(data.map((r) => r.subject_id))];
    },
  });
}

/** Full exam_questions rows (with choices and correct_answer/is_correct) for a set of ids — practice reveals the answer key immediately per question (grill decision), unlike the exam-taking flow's answer-safe views, so it reads the bank directly. RLS still gates this to can_read_practice_subject. */
export function useExamQuestionsByIds(ids: string[]) {
  return useQuery({
    queryKey: ["exam_questions", "by_ids", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<(ExamQuestion & { choices: ExamQuestionChoice[] })[]> => {
      const { data, error } = await supabase.from("exam_questions").select("*, choices:exam_question_choices(*)").in("id", ids);
      if (error) throw error;
      type Row = ExamQuestion & { choices: ExamQuestionChoice[] };
      return (data as unknown as Row[]).map((row) => ({ ...row, choices: row.choices.sort((a, b) => a.position - b.position) }));
    },
  });
}

// -------------------------------------------------------------- teacher side

export function useMyPracticeSets(subjectIds: string[]) {
  return useQuery({
    queryKey: ["practice_sets", "by_subjects", subjectIds],
    enabled: subjectIds.length > 0,
    queryFn: async (): Promise<PracticeSet[]> => {
      const { data, error } = await supabase
        .from("practice_sets")
        .select("*")
        .in("subject_id", subjectIds)
        .eq("is_teacher_curated", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export type PracticeSetQuestionRow = { question_id: string; position: number; points: number; prompt: string };

export function usePracticeSetQuestions(setId: string | null) {
  return useQuery({
    queryKey: ["practice_set_questions", setId],
    enabled: !!setId,
    queryFn: async (): Promise<PracticeSetQuestionRow[]> => {
      const { data, error } = await supabase
        .from("practice_set_questions")
        .select("question_id, position, question:exam_questions(prompt, points)")
        .eq("set_id", setId!)
        .order("position", { ascending: true });
      if (error) throw error;
      type Row = { question_id: string; position: number; question: { prompt: string; points: number } | null };
      return (data as unknown as Row[]).map((r) => ({
        question_id: r.question_id,
        position: r.position,
        prompt: r.question?.prompt ?? "—",
        points: r.question?.points ?? 0,
      }));
    },
  });
}

/** Creates an empty teacher-curated set against a topic (วิชา -> บทเรียนหลัก -> เนื้อหาย่อย, no title input — the set's displayed name is the topic's name) — questions get added afterward in the set's own detail view, same two-step flow as exam_sessions (useCreateExamSession creates the shell, useSetSessionQuestions fills it in). */
export function useCreatePracticeSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { subject_id: string; created_by: string; topic_id: string }) => {
      const { data: inserted, error } = await supabase
        .from("practice_sets")
        .insert({ ...draft, is_teacher_curated: true })
        .select()
        .single();
      if (error) throw error;
      return inserted as PracticeSet;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_sets"] }),
  });
}

/** Replaces a set's full question list (delete then re-insert) — used to add/edit questions after the set already exists. */
export function useSetPracticeSetQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ setId, questionIds }: { setId: string; questionIds: string[] }) => {
      const { error: delError } = await supabase.from("practice_set_questions").delete().eq("set_id", setId);
      if (delError) throw delError;
      if (questionIds.length > 0) {
        const { error: insError } = await supabase.from("practice_set_questions").insert(
          questionIds.map((question_id, i) => ({ set_id: setId, question_id, position: i })),
        );
        if (insError) throw insError;
      }
    },
    onSettled: (_data, _err, vars) => void qc.invalidateQueries({ queryKey: ["practice_set_questions", vars.setId] }),
  });
}

export function useDeletePracticeSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("practice_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_sets"] }),
  });
}

/** Every attempt on a set, joined down to per-question correctness — the teacher progress view drills to "which question do students miss most". */
export function usePracticeSetProgress(setId: string | null) {
  return useQuery({
    queryKey: ["practice_attempts", "progress", setId],
    enabled: !!setId,
    queryFn: async (): Promise<{
      attempts: PracticeAttempt[];
      perQuestion: Map<string, { correct: number; incorrect: number }>;
    }> => {
      const { data: attempts, error: aError } = await supabase
        .from("practice_attempts")
        .select("*")
        .eq("set_id", setId!)
        .eq("status", "submitted");
      if (aError) throw aError;

      const attemptIds = attempts.map((a) => a.id);
      const perQuestion = new Map<string, { correct: number; incorrect: number }>();
      if (attemptIds.length > 0) {
        const { data: answers, error: ansError } = await supabase
          .from("practice_attempt_answers")
          .select("question_id, is_correct")
          .in("attempt_id", attemptIds);
        if (ansError) throw ansError;
        for (const a of answers) {
          const bucket = perQuestion.get(a.question_id) ?? { correct: 0, incorrect: 0 };
          if (a.is_correct) bucket.correct++;
          else if (a.is_correct === false) bucket.incorrect++;
          perQuestion.set(a.question_id, bucket);
        }
      }
      return { attempts, perQuestion };
    },
  });
}

// --------------------------------------------------------------- student side

/** Teacher-curated sets open to the student's currently-enrolled subjects (any classroom studying it — no per-set targets, see migration 0053). */
export function useAvailablePracticeSets(subjectIds: string[]) {
  return useQuery({
    queryKey: ["practice_sets", "available", subjectIds],
    enabled: subjectIds.length > 0,
    queryFn: async (): Promise<PracticeSet[]> => {
      const { data, error } = await supabase
        .from("practice_sets")
        .select("*")
        .in("subject_id", subjectIds)
        .eq("is_teacher_curated", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Rolls a fresh self-serve set: 10 random bank questions matching subject/topic/difficulty, wrapped in a throwaway practice_set. */
export function useCreateSelfServePracticeSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      subject_id: string;
      created_by: string;
      topic: string | null;
      difficulty: ExamQuestionDifficulty | null;
    }): Promise<PracticeSet> => {
      let query = supabase.from("exam_questions").select("id").eq("subject_id", draft.subject_id);
      if (draft.topic) query = query.eq("topic", draft.topic);
      if (draft.difficulty) query = query.eq("difficulty", draft.difficulty);
      const { data: pool, error: poolError } = await query;
      if (poolError) throw poolError;
      if (pool.length === 0) throw new Error("ไม่มีโจทย์ตรงเงื่อนไข");

      const questionIds = [...pool].sort(() => Math.random() - 0.5).slice(0, 10).map((q) => q.id);

      const { data: inserted, error } = await supabase
        .from("practice_sets")
        .insert({
          subject_id: draft.subject_id,
          created_by: draft.created_by,
          is_teacher_curated: false,
          topic: draft.topic,
          difficulty: draft.difficulty,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: qError } = await supabase.from("practice_set_questions").insert(
        questionIds.map((question_id, i) => ({ set_id: inserted.id, question_id, position: i })),
      );
      if (qError) throw qError;

      return inserted as PracticeSet;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_sets"] }),
  });
}

/** The student's own attempts on one set, most recent first — for a "history" list and to compute retry count. */
export function useMyPracticeAttempts(setId: string | null, studentId: string | null) {
  return useQuery({
    queryKey: ["practice_attempts", "mine", setId, studentId],
    enabled: !!setId && !!studentId,
    queryFn: async (): Promise<PracticeAttempt[]> => {
      const { data, error } = await supabase
        .from("practice_attempts")
        .select("*")
        .eq("set_id", setId!)
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Starts a fresh attempt, or resumes the existing in_progress one if a refresh/drop already created it. */
export function useStartOrResumePracticeAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      setId,
      studentId,
      questionIds,
    }: {
      setId: string;
      studentId: string;
      questionIds: string[];
    }): Promise<PracticeAttempt> => {
      const { data: existing, error: existingError } = await supabase
        .from("practice_attempts")
        .select("*")
        .eq("set_id", setId)
        .eq("student_id", studentId)
        .eq("status", "in_progress")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return existing;

      const order = [...questionIds].sort(() => Math.random() - 0.5);
      const { data: inserted, error } = await supabase
        .from("practice_attempts")
        .insert({ set_id: setId, student_id: studentId, question_order: order })
        .select()
        .single();
      if (error) throw error;
      return inserted;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_attempts"] }),
  });
}

export function usePracticeAttemptAnswers(attemptId: string | null) {
  return useQuery({
    queryKey: ["practice_attempt_answers", attemptId],
    enabled: !!attemptId,
    queryFn: async (): Promise<Map<string, PracticeAttemptAnswer>> => {
      const { data, error } = await supabase.from("practice_attempt_answers").select("*").eq("attempt_id", attemptId!);
      if (error) throw error;
      return new Map(data.map((a) => [a.question_id, a]));
    },
  });
}

/** Saves + grades one answer server-side (save_practice_answer RPC) and returns it with is_correct/points_awarded filled in — instant per-question feedback, no separate submit-to-see-answer step. */
export function useSavePracticeAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (answer: {
      attempt_id: string;
      question_id: string;
      choice_id: string | null;
      short_answer: string | null;
    }): Promise<PracticeAttemptAnswer> => {
      const { data, error } = await supabase.rpc("save_practice_answer", {
        p_attempt_id: answer.attempt_id,
        p_question_id: answer.question_id,
        p_choice_id: answer.choice_id,
        p_short_answer: answer.short_answer,
      });
      if (error) throw error;
      return data as unknown as PracticeAttemptAnswer;
    },
    onSuccess: (row) => {
      qc.setQueryData(["practice_attempt_answers", row.attempt_id], (prev: Map<string, PracticeAttemptAnswer> | undefined) => {
        const next = new Map(prev ?? []);
        next.set(row.question_id, row);
        return next;
      });
    },
    onSettled: (_data, _err, vars) => void qc.invalidateQueries({ queryKey: ["practice_attempt_answers", vars.attempt_id] }),
  });
}

export function useSubmitPracticeAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptId: string) => {
      const { error } = await supabase.rpc("submit_practice_attempt", { p_attempt_id: attemptId });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["practice_attempts"] }),
  });
}
