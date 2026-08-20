import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Classroom, ExamQuestion, ExamQuestionChoice, ExamQuestionType, ExamSet, Subject } from "@/lib/database.types";
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

// ------------------------------------------------------------------- exam sets
// ชุดข้อสอบ — folders within one subject's bank. A question can carry
// several via exam_question_sets (many-to-many, same shape as
// profile_roles). See migration 0048.

export function useExamSets(subjectId: string | null) {
  return useQuery({
    queryKey: ["exam_sets", subjectId],
    enabled: !!subjectId,
    queryFn: async (): Promise<ExamSet[]> => {
      const { data, error } = await supabase
        .from("exam_sets")
        .select("*")
        .eq("subject_id", subjectId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateExamSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: { subject_id: string; name: string; created_by: string }) => {
      const { data, error } = await supabase.from("exam_sets").insert(draft).select().single();
      if (error) throw error;
      return data as ExamSet;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_sets"] }),
  });
}

export function useDeleteExamSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["exam_sets"] });
      void qc.invalidateQueries({ queryKey: ["exam_questions"] });
    },
  });
}

// ------------------------------------------------------------------- questions

export type ExamQuestionWithChoices = ExamQuestion & { choices: ExamQuestionChoice[]; set_ids: string[] };

/** setId narrows to questions tagged into that one set; omit/null for the subject's whole bank. */
export function useExamQuestions(subjectId: string | null, setId?: string | null) {
  return useQuery({
    queryKey: ["exam_questions", subjectId, setId ?? null],
    enabled: !!subjectId,
    queryFn: async (): Promise<ExamQuestionWithChoices[]> => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("*, choices:exam_question_choices(*), sets:exam_question_sets(set_id)")
        .eq("subject_id", subjectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Row = ExamQuestion & { choices: ExamQuestionChoice[]; sets: { set_id: string }[] };
      return (data as unknown as Row[])
        .map(({ sets, ...row }) => ({
          ...row,
          choices: row.choices.sort((a, b) => a.position - b.position),
          set_ids: sets.map((s) => s.set_id),
        }))
        .filter((row) => !setId || row.set_ids.includes(setId));
    },
  });
}

export type ChoiceDraft = { label: string; is_correct: boolean };

/** Creates one question + its choices (multiple_choice/true_false) + its set tags in one call — short_answer skips the choices insert. */
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
      set_ids: string[];
    }) => {
      const { choices, set_ids, ...question } = draft;
      const { data: inserted, error } = await supabase.from("exam_questions").insert(question).select().single();
      if (error) throw error;
      if (choices.length > 0) {
        const { error: choicesError } = await supabase.from("exam_question_choices").insert(
          choices.map((c, i) => ({ question_id: inserted.id, label: c.label, is_correct: c.is_correct, position: i })),
        );
        if (choicesError) throw choicesError;
      }
      if (set_ids.length > 0) {
        const { error: setsError } = await supabase
          .from("exam_question_sets")
          .insert(set_ids.map((set_id) => ({ question_id: inserted.id, set_id })));
        if (setsError) throw setsError;
      }
      return inserted as ExamQuestion;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_questions"] }),
  });
}

/** Replaces a question's fields and (if given) its whole choice set/set-tags — simplest correct way to edit without diffing. */
export function useUpdateExamQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      choices,
      set_ids,
      ...patch
    }: {
      id: string;
      prompt?: string;
      points?: number;
      correct_answer?: string | null;
      choices?: ChoiceDraft[];
      set_ids?: string[];
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
      if (set_ids) {
        const { error: delError } = await supabase.from("exam_question_sets").delete().eq("question_id", id);
        if (delError) throw delError;
        if (set_ids.length > 0) {
          const { error: insError } = await supabase
            .from("exam_question_sets")
            .insert(set_ids.map((set_id) => ({ question_id: id, set_id })));
          if (insError) throw insError;
        }
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
