import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Value as PlateValue } from "platejs";
import type {
  Classroom,
  ExamQuestion,
  ExamQuestionChoice,
  ExamQuestionDifficulty,
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

export type ChoiceDraft = { label: string; label_json: PlateValue; is_correct: boolean };

/** Creates one question + its choices (multiple_choice/true_false) in one call — short_answer skips the choices insert. */
export function useCreateExamQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      subject_id: string;
      question_type: ExamQuestionType;
      prompt: string;
      prompt_json: PlateValue;
      points: number;
      correct_answer: string | null;
      difficulty: ExamQuestionDifficulty;
      topic: string | null;
      created_by: string;
      choices: ChoiceDraft[];
    }) => {
      const { choices, ...question } = draft;
      const { data: inserted, error } = await supabase.from("exam_questions").insert(question).select().single();
      if (error) throw error;
      if (choices.length > 0) {
        const { error: choicesError } = await supabase.from("exam_question_choices").insert(
          choices.map((c, i) => ({
            question_id: inserted.id,
            label: c.label,
            label_json: c.label_json,
            is_correct: c.is_correct,
            position: i,
          })),
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
      prompt_json?: PlateValue;
      points?: number;
      correct_answer?: string | null;
      difficulty?: ExamQuestionDifficulty;
      topic?: string | null;
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
          choices.map((c, i) => ({
            question_id: id,
            label: c.label,
            label_json: c.label_json,
            is_correct: c.is_correct,
            position: i,
          })),
        );
        if (insError) throw insError;
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_questions"] }),
  });
}

// Public bucket — question images render live during a timed exam, a
// per-image signed-URL round trip is bad UX there, and the question itself
// is already RLS-gated via can_read_exam_question. See migration 0050.
const EXAM_IMAGES_BUCKET = "exam-question-images";

/** Plate's image upload hook hands us a base64 dataUrl, not a File — see @platejs/media's ImagePlugin uploadImage option. */
export async function uploadExamQuestionImage(dataUrl: string, questionId: string): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.split("/")[1] ?? "png";
  const path = `${questionId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(EXAM_IMAGES_BUCKET).upload(path, blob);
  if (error) throw error;
  return supabase.storage.from(EXAM_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

export type AiChatMessage = { role: "user" | "assistant"; content: string };

export type GeneratedQuestion = {
  type: ExamQuestionType;
  difficulty: ExamQuestionDifficulty;
  topic: string;
  prompt: string;
  correct_answer: string | null;
  /** Plain text only — the AI chat edge function doesn't produce Plate JSON. ExamBank's applyGenerated wraps each into a full ChoiceDraft. */
  choices: { label: string; is_correct: boolean }[];
};

export type AiChatTurn = { reply: string; done: boolean; question: GeneratedQuestion | null };

/** One turn of the AI chat drawer — sends the whole conversation so far (edge function is stateless), gets back a chat reply and, once the model has enough info, a finished question. */
export function useChatExamQuestion() {
  return useMutation({
    mutationFn: async (messages: AiChatMessage[]): Promise<AiChatTurn> => {
      const { data, error } = await supabase.functions.invoke("generate-exam-question", { body: { messages } });
      if (error) throw error;
      return data as AiChatTurn;
    },
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
