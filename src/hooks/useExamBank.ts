import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Classroom,
  ExamQuestion,
  ExamQuestionChoice,
  ExamQuestionType,
  GradeLevel,
  Subject,
} from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// คลังข้อสอบ — the bank, owned by subject_id (any teacher teaching that
// subject shares it). See migration 0047 for the RLS/ownership rationale.

/** Resolves subject code/name for a picker built from teaching_assignments (which only carry subject_id) — cross-department, so useSubjects (department-scoped) doesn't fit here. */
export function useSubjectsByIds(subjectIds: string[]) {
  return useQuery({
    queryKey: ["subjects", "by_ids", subjectIds],
    enabled: subjectIds.length > 0,
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase.from("subjects").select("*").in("id", subjectIds);
      if (error) throw error;
      return data;
    },
  });
}

/** Same shape as useSubjectsByIds — resolves subjects.suggested_grade_level_id for the subject picker's grade-level badge. */
export function useGradeLevelsByIds(gradeLevelIds: string[]) {
  return useQuery({
    queryKey: ["grade_levels", "by_ids", gradeLevelIds],
    enabled: gradeLevelIds.length > 0,
    queryFn: async (): Promise<GradeLevel[]> => {
      const { data, error } = await supabase.from("grade_levels").select("*").in("id", gradeLevelIds);
      if (error) throw error;
      return data;
    },
  });
}

/** Same shape as useSubjectsByIds, for the exam-session target picker (teaching_assignments only carry classroom_id). */
export function useClassroomsByIds(classroomIds: string[]) {
  return useQuery({
    queryKey: ["classrooms", "by_ids", classroomIds],
    enabled: classroomIds.length > 0,
    queryFn: async (): Promise<Classroom[]> => {
      const { data, error } = await supabase.from("classrooms").select("*").in("id", classroomIds);
      if (error) throw error;
      return data;
    },
  });
}

// ------------------------------------------------------------------- questions

export type ExamQuestionWithChoices = ExamQuestion & { choices: ExamQuestionChoice[] };

export function useExamQuestions(subjectId: string | null) {
  return useQuery({
    queryKey: ["exam_questions", subjectId],
    enabled: !!subjectId,
    queryFn: async (): Promise<ExamQuestionWithChoices[]> => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("*, choices:exam_question_choices(*)")
        .eq("subject_id", subjectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Row = ExamQuestion & { choices: ExamQuestionChoice[] };
      return (data as unknown as Row[]).map((row) => ({
        ...row,
        choices: row.choices.sort((a, b) => a.position - b.position),
      }));
    },
  });
}

export type ChoiceDraft = { label: string; is_correct: boolean };

/** Creates one question + its choices (multiple_choice/true_false) in one call — short_answer skips the choices insert. */
export function useCreateExamQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      subject_id: string;
      question_type: ExamQuestionType;
      prompt: string;
      points: number;
      correct_answer: string | null;
      created_by: string;
      choices: ChoiceDraft[];
    }) => {
      const { choices, ...question } = draft;
      const { data: inserted, error } = await supabase.from("exam_questions").insert(question).select().single();
      if (error) throw error;
      if (choices.length > 0) {
        const { error: choicesError } = await supabase.from("exam_question_choices").insert(
          choices.map((c, i) => ({ question_id: inserted.id, label: c.label, is_correct: c.is_correct, position: i })),
        );
        if (choicesError) throw choicesError;
      }
      return inserted as ExamQuestion;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_questions"] }),
  });
}

/** Replaces a question's fields and (if given) its whole choice set — simplest correct way to edit without diffing. */
export function useUpdateExamQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      choices,
      ...patch
    }: {
      id: string;
      prompt?: string;
      points?: number;
      correct_answer?: string | null;
      choices?: ChoiceDraft[];
    }) => {
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("exam_questions").update(patch).eq("id", id);
        if (error) throw error;
      }
      if (choices) {
        const { error: delError } = await supabase.from("exam_question_choices").delete().eq("question_id", id);
        if (delError) throw delError;
        const { error: insError } = await supabase.from("exam_question_choices").insert(
          choices.map((c, i) => ({ question_id: id, label: c.label, is_correct: c.is_correct, position: i })),
        );
        if (insError) throw insError;
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_questions"] }),
  });
}

export function useDeleteExamQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_questions"] }),
  });
}
