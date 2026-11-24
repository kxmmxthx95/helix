import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAcademicEvents, useAllAcademicTerms } from "@/hooks/useAcademicTerms";
import type { ScheduleEntry, TeachingAssignment, TeachingPlanSlot } from "@/lib/database.types";
import { computeSlots, eventApplies, termRange } from "@/lib/planSlots";
import { withTimes } from "@/lib/periods";
import { useAllDepartmentPeriods } from "@/hooks/usePeriodDefinitions";
import { useClassroomsByDepartment } from "@/hooks/useStatusManagement";
import { supabase } from "@/lib/supabase";

// แผนการสอนแบบปฏิทิน — see migration 0142. The slot grid itself is computed
// (lib/planSlots); only placed/taught slots are rows here.

/** A ผังการเรียน topic, flattened with its lesson (บทเรียน) for display. */
export type PlanTopicItem = { id: string; title: string; lessonName: string };

/** Topics grouped by lesson, keeping order — for บทเรียน → หัวข้อ lists. */
export function groupByLesson(topics: PlanTopicItem[]): [string, PlanTopicItem[]][] {
  const m = new Map<string, PlanTopicItem[]>();
  for (const t of topics) m.set(t.lessonName, [...(m.get(t.lessonName) ?? []), t]);
  return [...m];
}

/**
 * Topics offered for an assignment: ผังการเรียน (0088) is independent of subjects, so a lesson counts when
 * its plan_subject name is a prefix of the subject name ("ฟิสิกส์เพิ่มเติม" ~ "ฟิสิกส์"), or when the lesson
 * is tagged with the subject (plan_lesson_subjects, the "ผูกวิชา" link). Name-prefix lessons are of the classroom's grade level; tagged ones may be of any grade (ม.5 biology can use ม.6 lessons).
 * Mirrors check_teaching_plan_slot_topic (0171).
 */
export function usePlanTopics(
  departmentId: string | null,
  gradeLevelId: string | null,
  subjectName: string | null,
  subjectId: string | null,
) {
  return useQuery({
    queryKey: ["plan", "topics_for", departmentId, gradeLevelId, subjectName, subjectId],
    enabled: !!departmentId && !!gradeLevelId && !!subjectName,
    queryFn: async (): Promise<PlanTopicItem[]> => {
      const { data: subs, error: e1 } = await supabase.from("plan_subjects").select("id,name").eq("department_id", departmentId!);
      if (e1) throw e1;
      const matched = subs.filter((s) => subjectName!.trim().startsWith(s.name));
      const byName = matched.length
        ? await supabase
            .from("plan_lessons")
            .select("id,name,sort_order")
            .in("subject_id", matched.map((s) => s.id))
            .eq("grade_level_id", gradeLevelId!)
        : { data: [], error: null };
      if (byName.error) throw byName.error;
      const tagged = subjectId
        ? await supabase
            .from("plan_lesson_subjects")
            .select("plan_lessons!inner(id,name,sort_order)")
            .eq("subject_id", subjectId)
        : { data: [], error: null };
      if (tagged.error) throw tagged.error;
      const byTag = (tagged.data as unknown as { plan_lessons: { id: string; name: string; sort_order: number } }[]).map((r) => r.plan_lessons);
      const lessons = [...new Map([...(byName.data ?? []), ...byTag].map((l) => [l.id, l])).values()].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      if (lessons.length === 0) return [];
      const { data: topics, error: e3 } = await supabase
        .from("plan_topics")
        .select("id,lesson_id,name")
        .in("lesson_id", lessons.map((l) => l.id))
        .order("sort_order");
      if (e3) throw e3;
      return lessons.flatMap((l) =>
        topics.filter((t) => t.lesson_id === l.id).map((t) => ({ id: t.id, title: t.name, lessonName: l.name })),
      );
    },
  });
}

export function useAssignmentScheduleEntries(assignmentId: string | null) {
  return useQuery({
    queryKey: ["schedule_entries", "by_assignment", assignmentId],
    enabled: !!assignmentId,
    queryFn: async (): Promise<Pick<ScheduleEntry, "day_of_week" | "period_no">[]> => {
      const { data, error } = await supabase
        .from("schedule_entries")
        .select("day_of_week,period_no")
        .eq("teaching_assignment_id", assignmentId!);
      if (error) throw error;
      return data;
    },
  });
}

/** A slot row plus the ids of its placed topics, in order. */
export type PlanSlot = TeachingPlanSlot & { topic_ids: string[] };

/** Slots of many assignments at once — list-card progress and the manager overview. */
export function useTeachingPlanSlots(assignmentIds: string[]) {
  return useQuery({
    queryKey: ["teaching_plan_slots", [...assignmentIds].sort()],
    enabled: assignmentIds.length > 0,
    queryFn: async (): Promise<PlanSlot[]> => {
      const { data, error } = await supabase
        .from("teaching_plan_slots")
        .select("*, topics:teaching_plan_slot_topics(topic_id, position)")
        .in("teaching_assignment_id", assignmentIds)
        .order("slot_date")
        .order("period_no");
      if (error) throw error;
      const rows = data as unknown as (TeachingPlanSlot & { topics: { topic_id: string; position: number }[] })[];
      return rows.map(({ topics, ...slot }) => ({
        ...slot,
        topic_ids: [...topics].sort((a, b) => a.position - b.position).map((t) => t.topic_id),
      }));
    },
  });
}

type SlotKey = Pick<TeachingPlanSlot, "teaching_assignment_id" | "slot_date" | "period_no">;

function useSlotMutation<V>(fn: (v: V) => PromiseLike<{ error: Error | null }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: V) => {
      const { error } = await fn(v);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["teaching_plan_slots"] }),
  });
}

/** Adds a topic to a period (creates the slot row if needed; re-adding is a no-op). */
export function usePlaceTopic() {
  return useSlotMutation(async (v: SlotKey & { topic_id: string; position: number }) => {
    const { teaching_assignment_id, slot_date, period_no } = v;
    const slot = await supabase
      .from("teaching_plan_slots")
      .upsert({ teaching_assignment_id, slot_date, period_no }, { onConflict: "teaching_assignment_id,slot_date,period_no" })
      .select("id")
      .single();
    if (slot.error) return slot;
    return supabase
      .from("teaching_plan_slot_topics")
      .upsert({ slot_id: slot.data.id, topic_id: v.topic_id, position: v.position }, { onConflict: "slot_id,topic_id", ignoreDuplicates: true });
  });
}

/** Removes one topic; a slot left with no topic and not taught is deleted too. */
export function useRemoveTopic() {
  return useSlotMutation(async (v: { slot: PlanSlot; topic_id: string }) => {
    const res = await supabase.from("teaching_plan_slot_topics").delete().eq("slot_id", v.slot.id).eq("topic_id", v.topic_id);
    if (res.error || v.slot.completed_at || v.slot.topic_ids.length > 1) return res;
    return supabase.from("teaching_plan_slots").delete().eq("id", v.slot.id);
  });
}

/** รวมแผน: links the source with exactly these mates (SQL set_plan_link, 0169). */
export function useSetPlanLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { source: string; mates: string[] }) => {
      const { data, error } = await supabase.rpc("set_plan_link", { p_assignment: v.source, p_mates: v.mates });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["teaching_plan_slots"] });
      void qc.invalidateQueries({ queryKey: ["teaching_assignments"] });
    },
  });
}

/** Clears the whole period (its topics go with it). */
export function useClearSlot() {
  return useSlotMutation((id: string) => supabase.from("teaching_plan_slots").delete().eq("id", id));
}

/** Marks a slot taught — creates the row when the slot has no topic yet. */
export function useMarkSlotTaught() {
  return useSlotMutation((v: SlotKey & { onPlan: boolean; note: string | null }) =>
    supabase.from("teaching_plan_slots").upsert(
      {
        teaching_assignment_id: v.teaching_assignment_id,
        slot_date: v.slot_date,
        period_no: v.period_no,
        completed_at: new Date().toISOString(),
        completed_on_plan: v.onPlan,
        note: v.note,
      },
      { onConflict: "teaching_assignment_id,slot_date,period_no" },
    ),
  );
}

export function useReopenSlot() {
  return useSlotMutation((id: string) =>
    supabase
      .from("teaching_plan_slots")
      .update({ completed_at: null, completed_on_plan: null, note: null })
      .eq("id", id),
  );
}

export function slotStats(slots: PlanSlot[], totalSlots: number) {
  const completed = slots.filter((s) => s.completed_at !== null).length;
  const offPlan = slots.filter((s) => s.completed_on_plan === false).length;
  const planned = slots.filter((s) => s.topic_ids.length > 0).length;
  return { completed, offPlan, planned, total: totalSlots, pct: totalSlots ? Math.round((completed / totalSlots) * 100) : 0 };
}

/** Schedule periods of many assignments at once. */
export function useScheduleEntriesForAssignments(ids: string[]) {
  return useQuery({
    queryKey: ["schedule_entries", "by_assignments", [...ids].sort()],
    enabled: ids.length > 0,
    queryFn: async (): Promise<(Pick<ScheduleEntry, "day_of_week" | "period_no"> & { teaching_assignment_id: string })[]> => {
      const { data, error } = await supabase
        .from("schedule_entries")
        .select("teaching_assignment_id,day_of_week,period_no")
        .in("teaching_assignment_id", ids);
      if (error) throw error;
      return data;
    },
  });
}

/** Per-assignment plan progress (slots from schedule x term - events) plus the next planned, untaught slot. */
export function useAssignmentProgress(assignments: TeachingAssignment[], departmentId: string | null) {
  const ids = useMemo(() => assignments.map((a) => a.id), [assignments]);
  const { data: slots = [], isLoading } = useTeachingPlanSlots(ids);
  const { data: entries = [] } = useScheduleEntriesForAssignments(ids);
  const { data: terms = [] } = useAllAcademicTerms();
  const { data: events = [] } = useAcademicEvents();
  const { data: periods = [] } = useAllDepartmentPeriods(departmentId);
  const { data: classrooms = [] } = useClassroomsByDepartment(departmentId);
  const progress = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return new Map(
      assignments.map((a) => {
        const range = termRange(terms, a, departmentId);
        const gradeId = classrooms.find((c) => c.id === a.classroom_id)?.grade_level_id ?? null;
        const total = range
          ? computeSlots(
              range,
              withTimes(entries.filter((e) => e.teaching_assignment_id === a.id), periods, gradeId),
              events.filter((e) => eventApplies(e, departmentId, gradeId)),
            ).length
          : 0;
        const mine = slots.filter((s) => s.teaching_assignment_id === a.id);
        const next = mine.find((s) => s.topic_ids.length > 0 && !s.completed_at && s.slot_date >= today);
        return [a.id, { stats: slotStats(mine, total), next }] as const;
      }),
    );
  }, [assignments, departmentId, terms, events, entries, slots, periods, classrooms]);
  return { progress, isLoading };
}
