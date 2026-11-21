import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ExamAttempt,
  ExamAttemptAnswer,
  ExamAttemptEventType,
  ExamQuestionChoiceForAttempt,
  ExamQuestionForAttempt,
  ExamClaimStatus,
  ExamCodeState,
  ExamSecurityEvent,
  ExamSession,
  ExamTopicSet,
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
      topic_set_id: string;
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
        "title" | "opens_at" | "closes_at" | "duration_minutes" | "max_attempts" | "shuffle_questions" | "shuffle_choices" | "sync_to_gradebook" | "review_released" | "strict_mode"
      >
    >) => {
      const { error } = await supabase.from("exam_sessions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_sessions"] }),
  });
}

/** Replaces a session's full question set (delete then re-insert) — used to add/edit questions after the session already exists. */
export function useSetSessionQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      questions,
    }: {
      sessionId: string;
      questions: { question_id: string; points: number }[];
    }) => {
      const { error: deleteError } = await supabase.from("exam_session_questions").delete().eq("session_id", sessionId);
      if (deleteError) throw deleteError;
      if (questions.length > 0) {
        const { error: insertError } = await supabase.from("exam_session_questions").insert(
          questions.map((q, i) => ({ session_id: sessionId, question_id: q.question_id, position: i, points: q.points })),
        );
        if (insertError) throw insertError;
      }
    },
    onSettled: (_data, _err, vars) => void qc.invalidateQueries({ queryKey: ["exam_session_questions", vars.sessionId] }),
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

// ------------------------------------------------------- anti-impersonation (migration 0132)

/** Student: checks the exam code server-side (5 wrong tries lock it until the teacher unlocks). */
export function useVerifyExamCode() {
  return useMutation({
    mutationFn: async ({ sessionId, code }: { sessionId: string; code: string }) => {
      const { data, error } = await supabase.rpc("verify_exam_code", { p_session_id: sessionId, p_code: code });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Open + heartbeat for one attempt: only 'ok' means this browser session may answer. Polls every 30s while
 * ok, every 10s otherwise so a teacher approval lands quickly. A failed poll keeps the last status.
 */
export function useClaimAttempt(attemptId: string | null) {
  return useQuery({
    queryKey: ["exam_claim", attemptId],
    enabled: !!attemptId,
    gcTime: 0,
    refetchInterval: (q) => (q.state.data === "ok" ? 30_000 : 10_000),
    refetchIntervalInBackground: true, // a hidden tab must keep the heartbeat or the lock goes stale
    queryFn: async (): Promise<ExamClaimStatus> => {
      const { data, error } = await supabase.rpc("claim_exam_attempt", { p_attempt_id: attemptId! });
      if (error) throw error;
      return data;
    },
  });
}

/** Teacher: the exam code (RLS: only the session's teacher/manager can read it). */
export function useExamCode(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_session_codes", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from("exam_session_codes").select("code").eq("session_id", sessionId!).maybeSingle();
      if (error) throw error;
      return data?.code ?? null;
    },
  });
}

export function useApproveTakeover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptId: string) => {
      const { error } = await supabase.rpc("approve_exam_takeover", { p_attempt_id: attemptId });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_attempts"] }),
  });
}

export function useLockedCodeStudents(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_code_state", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamCodeState[]> => {
      const { data, error } = await supabase.from("exam_code_state").select("*").eq("session_id", sessionId!).eq("locked", true);
      if (error) throw error;
      return data;
    },
  });
}

export function useUnlockExamCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, studentId }: { sessionId: string; studentId: string }) => {
      const { error } = await supabase.rpc("unlock_exam_code", { p_session_id: sessionId, p_student_id: studentId });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["exam_code_state"] });
      void qc.invalidateQueries({ queryKey: ["exam_security_events"] });
    },
  });
}

export function useSecurityEvents(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_security_events", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamSecurityEvent[]> => {
      const { data, error } = await supabase
        .from("exam_security_events")
        .select("*")
        .eq("session_id", sessionId!)
        .order("at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

/** student_id -> display name for the teacher's security panel (the attempts table still shows raw ids elsewhere). */
export function useStudentNames(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["student_names", ...key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from("students").select("id, student_code, prefix, first_name, last_name").in("id", key);
      if (error) throw error;
      return new Map(data.map((s) => [s.id, `${s.student_code} ${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim()]));
    },
  });
}

// ------------------------------------------------ ชุดหัวข้อการสอบ (migration 0183)

export type ExamTopicLabel = { topic_id: string; topic: string; lesson: string };

/** The teacher's own topic sets, newest first. */
export function useMyTopicSets(teacherId: string | null) {
  return useQuery({
    queryKey: ["exam_topic_sets", "mine", teacherId],
    enabled: !!teacherId,
    queryFn: async (): Promise<ExamTopicSet[]> => {
      const { data, error } = await supabase
        .from("exam_topic_sets")
        .select("*")
        .eq("teacher_id", teacherId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Topics (with their lesson name) of each of the given sets. */
export function useTopicSetsTopics(setIds: string[]) {
  const key = [...setIds].sort();
  return useQuery({
    queryKey: ["exam_topic_set_topics", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Map<string, ExamTopicLabel[]>> => {
      const { data, error } = await supabase
        .from("exam_topic_set_topics")
        .select("set_id, topic_id, topic:plan_topics(name, sort_order, lesson:plan_lessons(name, sort_order))")
        .in("set_id", key);
      if (error) throw error;
      type Row = {
        set_id: string;
        topic_id: string;
        topic: { name: string; sort_order: number; lesson: { name: string; sort_order: number } | null } | null;
      };
      const map = new Map<string, ExamTopicLabel[]>();
      for (const r of data as unknown as Row[]) {
        const list = map.get(r.set_id) ?? [];
        list.push({ topic_id: r.topic_id, topic: r.topic?.name ?? "—", lesson: r.topic?.lesson?.name ?? "—" });
        map.set(r.set_id, list);
      }
      return map;
    },
  });
}

/** Ids (of the given sets) that at least one exam session already uses — those are locked. */
export function useTopicSetsInUse(setIds: string[]) {
  const key = [...setIds].sort();
  return useQuery({
    queryKey: ["exam_topic_sets", "in_use", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("exam_sessions").select("topic_set_id").in("topic_set_id", key);
      if (error) throw error;
      return new Set(data.map((r) => r.topic_set_id));
    },
  });
}

/** Creates the set of one teaching assignment (subject × room). Heads' sets are born approved (server-side). */
export function useCreateTopicSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { teacher_id: string; subject_id: string; teaching_assignment_id: string; no_exam?: boolean }) => {
      const { data, error } = await supabase.from("exam_topic_sets").insert(row).select().single();
      if (error) throw error;
      return data as ExamTopicSet;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_topic_sets"] }),
  });
}

/** Replaces a set's topics, touching only the diff. */
export function useSetTopicSetTopics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ setId, current, next }: { setId: string; current: string[]; next: string[] }) => {
      const removed = current.filter((id) => !next.includes(id));
      const added = next.filter((id) => !current.includes(id));
      if (removed.length > 0) {
        const { error } = await supabase.from("exam_topic_set_topics").delete().eq("set_id", setId).in("topic_id", removed);
        if (error) throw error;
      }
      if (added.length > 0) {
        const { error } = await supabase.from("exam_topic_set_topics").insert(added.map((topic_id) => ({ set_id: setId, topic_id })));
        if (error) throw error;
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["exam_topic_set_topics"] });
      void qc.invalidateQueries({ queryKey: ["exam_topic_sets"] });
    },
  });
}

export function useSetNoExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, no_exam }: { id: string; no_exam: boolean }) => {
      const { error } = await supabase.from("exam_topic_sets").update({ no_exam }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_topic_sets"] }),
  });
}

export function useDeleteTopicSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_topic_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_topic_sets"] }),
  });
}

export function useSubmitTopicSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("submit_exam_topic_set", { p_id: id });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_topic_sets"] }),
  });
}

/** Sets the caller can decide on (never their own) — pending, approved and rejected; RLS limits it to their department. */
export function useTopicSetQueue(enabled: boolean, ownId: string | null) {
  return useQuery({
    queryKey: ["exam_topic_sets", "queue", ownId],
    enabled: enabled && !!ownId,
    queryFn: async (): Promise<ExamTopicSet[]> => {
      const { data, error } = await supabase
        .from("exam_topic_sets")
        .select("*")
        .neq("teacher_id", ownId!)
        .neq("approval_status", "draft")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDecideTopicSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => {
      const { error } = await supabase.rpc("decide_exam_topic_set", { p_id: id, p_approve: approve, p_note: note ?? null });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_topic_sets"] }),
  });
}

/** topic_ids of one set — the question picker only offers bank questions inside them. */
export function useTopicSetTopicIds(setId: string | null) {
  const { data } = useTopicSetsTopics(setId ? [setId] : []);
  return setId ? (data?.get(setId)?.map((t) => t.topic_id) ?? []) : [];
}
