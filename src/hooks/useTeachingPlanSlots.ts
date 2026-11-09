import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAcademicEvents, useAllAcademicTerms } from "@/hooks/useAcademicTerms";
import type { ScheduleEntry, TeachingAssignment, TeachingPlanSlot } from "@/lib/database.types";
import { computeSlots, termRange } from "@/lib/planSlots";
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
 * Topics offered for an assignment: ผังการเรียน (0088) is independent of subjects, so the
 * plan_subject is matched by name within the department, lessons by the classroom's grade level.
 */
export function usePlanTopics(departmentId: string | null, gradeLevelId: string | null, subjectName: string | null) {
  return useQuery({
    queryKey: ["plan_topics_for", departmentId, gradeLevelId, subjectName],
    enabled: !!departmentId && !!gradeLevelId && !!subjectName,
    queryFn: async (): Promise<PlanTopicItem[]> => {
      const { data: subs, error: e1 } = await supabase.from("plan_subjects").select("id,name").eq("department_id", departmentId!);
      if (e1) throw e1;
      // name prefix: "คณิตศาสตร์พื้นฐาน" ~ ผัง "คณิตศาสตร์" (mirrors check_teaching_plan_slot)
      const matched = subs.filter((s) => subjectName!.trim().startsWith(s.name));
      if (matched.length === 0) return [];
      const { data: lessons, error: e2 } = await supabase
        .from("plan_lessons")
        .select("id,name")
        .in("subject_id", matched.map((s) => s.id))
        .eq("grade_level_id", gradeLevelId!)
        .order("sort_order");
      if (e2) throw e2;
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

/** Slots of many assignments at once — list-card progress and the manager overview. */
export function useTeachingPlanSlots(assignmentIds: string[]) {
  return useQuery({
    queryKey: ["teaching_plan_slots", [...assignmentIds].sort()],
    enabled: assignmentIds.length > 0,
    queryFn: async (): Promise<TeachingPlanSlot[]> => {
      const { data, error } = await supabase
        .from("teaching_plan_slots")
        .select("*")
        .in("teaching_assignment_id", assignmentIds)
        .order("slot_date")
        .order("period_no");
      if (error) throw error;
      return data;
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

/** Puts a topic into a slot (upsert; leaves any taught-state columns untouched). */
export function usePlaceTopic() {
  return useSlotMutation((v: SlotKey & { topic_id: string }) =>
    supabase.from("teaching_plan_slots").upsert(v, { onConflict: "teaching_assignment_id,slot_date,period_no" }),
  );
}

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

export function slotStats(slots: TeachingPlanSlot[], totalSlots: number) {
  const completed = slots.filter((s) => s.completed_at !== null).length;
  const offPlan = slots.filter((s) => s.completed_on_plan === false).length;
  const planned = slots.filter((s) => s.topic_id !== null).length;
  return { completed, offPlan, planned, total: totalSlots, pct: totalSlots ? Math.round((completed / totalSlots) * 100) : 0 };
}

/** Schedule periods of many assignments at once. */
function useScheduleEntriesForAssignments(ids: string[]) {
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
  const progress = useMemo(() => {
    const deptEvents = events.filter((e) => e.departmentIds.length === 0 || (departmentId && e.departmentIds.includes(departmentId)));
    const today = new Date().toISOString().slice(0, 10);
    return new Map(
      assignments.map((a) => {
        const range = termRange(terms, a, departmentId);
        const total = range
          ? computeSlots(range, entries.filter((e) => e.teaching_assignment_id === a.id), deptEvents).length
          : 0;
        const mine = slots.filter((s) => s.teaching_assignment_id === a.id);
        const next = mine.find((s) => s.topic_id && !s.completed_at && s.slot_date >= today);
        return [a.id, { stats: slotStats(mine, total), next }] as const;
      }),
    );
  }, [assignments, departmentId, terms, events, entries, slots]);
  return { progress, isLoading };
}
