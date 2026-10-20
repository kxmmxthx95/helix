import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlanLesson, PlanSubject, PlanTopic } from "@/lib/database.types";
import { docFileSignedUrl } from "@/hooks/useDocuments";
import { supabase } from "@/lib/supabase";

// ผังการเรียน — see migration 0088. Everything shares one query-key root so any write refreshes all views.

export type PlanSubjectSummary = PlanSubject & { lessonCount: number; topicCount: number; gradeLevelIds: string[] };

export function usePlanSubjects(departmentId: string | null) {
  return useQuery({
    queryKey: ["plan", "subjects", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<PlanSubjectSummary[]> => {
      const { data, error } = await supabase
        .from("plan_subjects")
        .select("*, plan_lessons(grade_level_id, plan_topics(count))")
        .eq("department_id", departmentId!)
        .order("name");
      if (error) throw error;
      const rows = data as unknown as (PlanSubject & {
        plan_lessons: { grade_level_id: string; plan_topics: { count: number }[] }[];
      })[];
      return rows.map(({ plan_lessons, ...s }) => ({
        ...s,
        lessonCount: plan_lessons.length,
        topicCount: plan_lessons.reduce((n, l) => n + (l.plan_topics[0]?.count ?? 0), 0),
        gradeLevelIds: [...new Set(plan_lessons.map((l) => l.grade_level_id))],
      }));
    },
  });
}

/** A linked document; `file` is null when the viewer may not read it (doc_files RLS). */
export type PlanLinkedFile = {
  linkId: string;
  file: { id: string; title: string; file_name: string; file_path: string; mime_type: string } | null;
};
export type PlanTopicNode = PlanTopic & { files: PlanLinkedFile[] };
export type PlanLessonTag = { linkId: string; subject: { id: string; code: string; name_th: string } };
export type PlanLessonNode = PlanLesson & { topics: PlanTopicNode[]; files: PlanLinkedFile[]; tags: PlanLessonTag[] };

/** Every lesson of one subject across all grades, topics nested, in display order. */
export function usePlanOutline(subjectId: string | null) {
  return useQuery({
    queryKey: ["plan", "outline", subjectId],
    enabled: !!subjectId,
    queryFn: async (): Promise<PlanLessonNode[]> => {
      const { data, error } = await supabase
        .from("plan_lessons")
        .select(
          "*, plan_lesson_subjects(id, subjects(id, code, name_th)), plan_lesson_files(id, doc_files(id, title, file_name, file_path, mime_type)), plan_topics(*, plan_topic_files(id, doc_files(id, title, file_name, file_path, mime_type)))",
        )
        .eq("subject_id", subjectId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      type Raw = PlanTopic & { plan_topic_files: { id: string; doc_files: PlanLinkedFile["file"] }[] };
      type RawLesson = PlanLesson & {
        plan_topics: Raw[];
        plan_lesson_files: { id: string; doc_files: PlanLinkedFile["file"] }[];
        plan_lesson_subjects: { id: string; subjects: PlanLessonTag["subject"] | null }[];
      };
      const rows = data as unknown as RawLesson[];
      return rows.map(({ plan_topics, plan_lesson_files, plan_lesson_subjects, ...l }) => ({
        ...l,
        tags: plan_lesson_subjects.flatMap((t) => (t.subjects ? [{ linkId: t.id, subject: t.subjects }] : [])),
        files: plan_lesson_files.map((f) => ({ linkId: f.id, file: f.doc_files })),
        topics: plan_topics
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          .map(({ plan_topic_files, ...t }) => ({
            ...t,
            files: plan_topic_files.map((f) => ({ linkId: f.id, file: f.doc_files })),
          })),
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
    onSettled: () => void qc.invalidateQueries({ queryKey: ["plan"] }),
  });
}

export const useCreatePlanSubject = () =>
  useWrite((v: { department_id: string; name: string }) => supabase.from("plan_subjects").insert(v));
export const useRenamePlanSubject = () =>
  useWrite((v: { id: string; name: string }) => supabase.from("plan_subjects").update({ name: v.name }).eq("id", v.id));
export const useStylePlanSubject = () =>
  useWrite((v: { id: string; color: string | null; icon: string | null }) =>
    supabase.from("plan_subjects").update({ color: v.color, icon: v.icon }).eq("id", v.id),
  );
export const useDeletePlanSubject = () =>
  useWrite((id: string) => supabase.from("plan_subjects").delete().eq("id", id));

export const useCreatePlanLesson = () =>
  useWrite((v: { subject_id: string; grade_level_id: string; name: string; sort_order: number }) =>
    supabase.from("plan_lessons").insert(v),
  );
export const useRenamePlanLesson = () =>
  useWrite((v: { id: string; name: string }) => supabase.from("plan_lessons").update({ name: v.name }).eq("id", v.id));
export const useDeletePlanLesson = () =>
  useWrite((id: string) => supabase.from("plan_lessons").delete().eq("id", id));

export const useCreatePlanTopic = () =>
  useWrite((v: { lesson_id: string; name: string; sort_order: number }) => supabase.from("plan_topics").insert(v));
export const useRenamePlanTopic = () =>
  useWrite((v: { id: string; name: string }) => supabase.from("plan_topics").update({ name: v.name }).eq("id", v.id));
export const useReorderPlanTopics = () =>
  useWrite(async (ids: string[]) => {
    const rs = await Promise.all(ids.map((id, i) => supabase.from("plan_topics").update({ sort_order: i }).eq("id", id)));
    return { error: rs.find((r) => r.error)?.error ?? null };
  });
export const useDeletePlanTopic = () =>
  useWrite((id: string) => supabase.from("plan_topics").delete().eq("id", id));

// ------------------------------------------------------------------- import

export type PlanImportEntry = { subject: string; gradeLevelId: string; lesson: string; topic: string | null };
export type PlanImportOutcome = { subjects: number; lessons: number; topics: number };

/**
 * CSV import: finds or creates each วิชา / บทเรียน, then adds the หัวข้อ — existing ones (same name)
 * are left alone, new ones are appended after what is already there, in file order.
 */
export function useImportPlan(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: PlanImportEntry[]): Promise<PlanImportOutcome> => {
      const out: PlanImportOutcome = { subjects: 0, lessons: 0, topics: 0 };
      if (entries.length === 0) return out;

      const { data: subjectRows, error: se } = await supabase
        .from("plan_subjects")
        .select("id, name")
        .eq("department_id", departmentId);
      if (se) throw se;
      const subjectId = new Map(subjectRows.map((s) => [s.name, s.id]));
      const newSubjects = [...new Set(entries.map((e) => e.subject))].filter((n) => !subjectId.has(n));
      if (newSubjects.length > 0) {
        const { data, error } = await supabase
          .from("plan_subjects")
          .insert(newSubjects.map((name) => ({ department_id: departmentId, name })))
          .select("id, name");
        if (error) throw error;
        for (const s of data) subjectId.set(s.name, s.id);
        out.subjects = data.length;
      }

      const { data: lessonRows, error: le } = await supabase
        .from("plan_lessons")
        .select("id, subject_id, grade_level_id, name")
        .in("subject_id", [...subjectId.values()]);
      if (le) throw le;
      const lessonKey = (sid: string, gid: string, name: string) => `${sid}|${gid}|${name}`;
      const scopeKey = (sid: string, gid: string) => `${sid}|${gid}`;
      const lessonId = new Map(lessonRows.map((l) => [lessonKey(l.subject_id, l.grade_level_id, l.name), l.id]));
      const scopeCount = new Map<string, number>();
      for (const l of lessonRows) {
        const k = scopeKey(l.subject_id, l.grade_level_id);
        scopeCount.set(k, (scopeCount.get(k) ?? 0) + 1);
      }
      const newLessons: { subject_id: string; grade_level_id: string; name: string; sort_order: number }[] = [];
      for (const e of entries) {
        const sid = subjectId.get(e.subject)!;
        const k = lessonKey(sid, e.gradeLevelId, e.lesson);
        if (lessonId.has(k) || newLessons.some((l) => lessonKey(l.subject_id, l.grade_level_id, l.name) === k)) continue;
        const sk = scopeKey(sid, e.gradeLevelId);
        const n = scopeCount.get(sk) ?? 0;
        scopeCount.set(sk, n + 1);
        newLessons.push({ subject_id: sid, grade_level_id: e.gradeLevelId, name: e.lesson, sort_order: n });
      }
      if (newLessons.length > 0) {
        const { data, error } = await supabase.from("plan_lessons").insert(newLessons).select("id, subject_id, grade_level_id, name");
        if (error) throw error;
        for (const l of data) lessonId.set(lessonKey(l.subject_id, l.grade_level_id, l.name), l.id);
        out.lessons = data.length;
      }

      const wanted = entries.filter((e) => e.topic);
      if (wanted.length > 0) {
        const { data: topicRows, error: te } = await supabase
          .from("plan_topics")
          .select("lesson_id, name")
          .in("lesson_id", [...lessonId.values()]);
        if (te) throw te;
        const topicKey = (lid: string, name: string) => `${lid}|${name}`;
        const have = new Set(topicRows.map((t) => topicKey(t.lesson_id, t.name)));
        const topicCount = new Map<string, number>();
        for (const t of topicRows) topicCount.set(t.lesson_id, (topicCount.get(t.lesson_id) ?? 0) + 1);
        const newTopics: { lesson_id: string; name: string; sort_order: number }[] = [];
        for (const e of wanted) {
          const lid = lessonId.get(lessonKey(subjectId.get(e.subject)!, e.gradeLevelId, e.lesson))!;
          const k = topicKey(lid, e.topic!);
          if (have.has(k)) continue;
          have.add(k);
          const n = topicCount.get(lid) ?? 0;
          topicCount.set(lid, n + 1);
          newTopics.push({ lesson_id: lid, name: e.topic!, sort_order: n });
        }
        if (newTopics.length > 0) {
          const { error } = await supabase.from("plan_topics").insert(newTopics);
          if (error) throw error;
        }
        out.topics = newTopics.length;
      }
      return out;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["plan"] }),
  });
}

// ---------------------------------------------------------------- doc links

export type DocFileChoice = {
  id: string;
  title: string;
  fileName: string;
  /** "รหัส ชื่อวิชา" / grade code / บทเรียน — "" when the document's lesson is not readable. */
  subjectLabel: string;
  gradeCode: string;
  lessonName: string;
  /** subjects.department_id / learning_area_id of the document's subject ("" when unreadable). */
  departmentId: string;
  areaId: string;
};

/** Every document the viewer can read, flattened with "วิชา · ชั้น · บทเรียน" context, for the link picker. */
export function useDocFileChoices(enabled: boolean) {
  return useQuery({
    queryKey: ["plan", "doc_file_choices"],
    enabled,
    queryFn: async (): Promise<DocFileChoice[]> => {
      const { data, error } = await supabase
        .from("doc_files")
        .select("id, title, file_name, doc_lessons(name, grade_levels(code), subjects(code, name_th, department_id, learning_area_id))")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      type Raw = {
        id: string;
        title: string;
        file_name: string;
        doc_lessons: { name: string; grade_levels: { code: string } | null; subjects: { code: string; name_th: string; department_id: string; learning_area_id: string } | null } | null;
      };
      return (data as unknown as Raw[]).map((f) => ({
        id: f.id,
        title: f.title,
        fileName: f.file_name,
        subjectLabel: f.doc_lessons?.subjects ? `${f.doc_lessons.subjects.code} ${f.doc_lessons.subjects.name_th}` : "",
        gradeCode: f.doc_lessons?.grade_levels?.code ?? "",
        lessonName: f.doc_lessons?.name ?? "",
        departmentId: f.doc_lessons?.subjects?.department_id ?? "",
        areaId: f.doc_lessons?.subjects?.learning_area_id ?? "",
      }));
    },
  });
}

export const useLinkPlanFile = () =>
  useWrite((v: { topic_id: string; doc_file_id: string }) => supabase.from("plan_topic_files").insert(v));
export const useLinkPlanLessonFile = () =>
  useWrite((v: { lesson_id: string; doc_file_id: string }) => supabase.from("plan_lesson_files").insert(v));
export const useUnlinkPlanLessonFile = () =>
  useWrite((linkId: string) => supabase.from("plan_lesson_files").delete().eq("id", linkId));
export const useUnlinkPlanFile = () =>
  useWrite((linkId: string) => supabase.from("plan_topic_files").delete().eq("id", linkId));

/** Opens a linked file in a new tab; the blank tab is opened synchronously so popup blockers allow it. */
export async function openDocFile(path: string): Promise<boolean> {
  const tab = window.open("", "_blank");
  const url = await docFileSignedUrl(path);
  if (!url) {
    tab?.close();
    return false;
  }
  if (tab) tab.location.href = url;
  else window.location.href = url;
  return true;
}

export const useTagPlanLesson = () =>
  useWrite((v: { lesson_id: string; subject_id: string }) => supabase.from("plan_lesson_subjects").insert(v));
export const useUntagPlanLesson = () =>
  useWrite((linkId: string) => supabase.from("plan_lesson_subjects").delete().eq("id", linkId));
