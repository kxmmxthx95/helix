import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcademicEvent, AcademicTerm, TermStatus } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------- academic_terms
// Per department — status='locked'/'archived' freezes writes on
// teaching_assignments/student_classroom_enrollments (see migration 0018).

const termsQuery = (departmentId: string | null) => ({
  queryKey: ["academic_terms", departmentId] as const,
  enabled: !!departmentId,
  queryFn: async (): Promise<AcademicTerm[]> => {
    const { data, error } = await supabase
      .from("academic_terms")
      .select("*")
      .eq("department_id", departmentId!)
      .order("academic_year", { ascending: false })
      .order("term_type");
    if (error) throw error;
    return data;
  },
});

export function useAcademicTerms(departmentId: string | null) {
  return useQuery(termsQuery(departmentId));
}

export type CurrentTerm = { academicYear: number; term: 1 | 2 };

const TERM_ORDER: Record<AcademicTerm["term_type"], number> = { term1: 1, term2: 2, summer: 3 };
const byTime = (a: AcademicTerm, b: AcademicTerm) =>
  a.academic_year - b.academic_year || TERM_ORDER[a.term_type] - TERM_ORDER[b.term_type];

/**
 * The term a page should open on: the active one, else the nearest upcoming,
 * else (so there is still something real to show) the most recent term of any
 * status. `includeUpcoming: false` keeps only the active term — for daily work
 * like attendance that must not jump ahead. Summer counts as ภาคเรียน 2.
 */
function pickCurrentTerm(terms: AcademicTerm[], includeUpcoming: boolean): CurrentTerm | null {
  const sorted = [...terms].sort(byTime);
  const row =
    sorted.find((t) => t.status === "active") ??
    (includeUpcoming ? (sorted.find((t) => t.status === "upcoming") ?? sorted[sorted.length - 1]) : undefined);
  return row ? { academicYear: row.academic_year, term: row.term_type === "term1" ? 1 : 2 } : null;
}

export function useCurrentTerm(departmentId: string | null, opts?: { includeUpcoming?: boolean }) {
  const includeUpcoming = opts?.includeUpcoming ?? true;
  return useQuery({
    ...termsQuery(departmentId),
    select: (terms) => pickCurrentTerm(terms, includeUpcoming),
  });
}

/**
 * The department's current academic year — see pickCurrentTerm for how the
 * term is chosen. Falls back to the calendar year while the department has no
 * terms at all (e.g. right after it is created).
 */
export function useActiveAcademicYear(departmentId: string | null, opts?: { includeUpcoming?: boolean }) {
  const includeUpcoming = opts?.includeUpcoming ?? true;
  return useQuery({
    ...termsQuery(departmentId),
    select: (terms): number =>
      pickCurrentTerm(terms, includeUpcoming)?.academicYear ?? new Date().getFullYear() + 543,
  });
}

/** The department's one active term row (status='active'), or null while none is active yet. */
export function useActiveTerm(departmentId: string | null) {
  return useQuery({
    queryKey: ["academic_terms", "active", departmentId],
    enabled: !!departmentId,
    queryFn: async (): Promise<AcademicTerm | null> => {
      const { data, error } = await supabase
        .from("academic_terms")
        .select("*")
        .eq("department_id", departmentId!)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type AcademicTermDraft = Pick<
  AcademicTerm,
  "department_id" | "academic_year" | "term_type" | "start_date" | "end_date"
>;

/** Creates a term, or edits an existing one's dates — never touches status (see useSetAcademicTermStatus). */
export function useSaveAcademicTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...draft }: AcademicTermDraft & { id?: string }) => {
      const { error } = id
        ? await supabase.from("academic_terms").update(draft).eq("id", id)
        : await supabase.from("academic_terms").insert(draft);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["academic_terms"] }),
  });
}

/**
 * Separate mutation from useSaveAcademicTerm because it's a separate RLS
 * boundary — dept_head can save dates but only org-wide can move a term to
 * locked/archived (grill decision, 2026-08-10).
 */
export function useSetAcademicTermStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TermStatus }) => {
      const { error } = await supabase.from("academic_terms").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["academic_terms"] }),
  });
}

// ------------------------------------------------------------- academic_events
// Read is open to everyone signed in — no department filter needed on read.

export type AcademicEventRow = AcademicEvent & { departmentIds: string[] };

export function useAcademicEvents() {
  return useQuery({
    queryKey: ["academic_events"],
    queryFn: async (): Promise<AcademicEventRow[]> => {
      const { data, error } = await supabase
        .from("academic_events")
        .select("*, academic_event_departments(department_id)")
        .order("start_date");
      if (error) throw error;
      return (data as unknown as (AcademicEvent & { academic_event_departments: { department_id: string }[] })[]).map(
        (row) => ({
          ...row,
          departmentIds: row.academic_event_departments.map((d) => d.department_id),
        }),
      );
    },
  });
}

export type AcademicEventDraft = Pick<
  AcademicEvent,
  "name" | "event_type" | "start_date" | "end_date" | "students_attend" | "staff_attend" | "description" | "show_in_schedule" | "notify_users"
>;

/** Saves the event row, then replaces its department links with exactly departmentIds (empty = whole school). */
export function useSaveAcademicEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      departmentIds,
      ...draft
    }: AcademicEventDraft & { id?: string; departmentIds: string[] }) => {
      const eventId = id
        ? await supabase
            .from("academic_events")
            .update(draft)
            .eq("id", id)
            .then(({ error }) => {
              if (error) throw error;
              return id;
            })
        : await supabase
            .from("academic_events")
            .insert(draft)
            .select("id")
            .single()
            .then(({ data, error }) => {
              if (error) throw error;
              return data.id;
            });

      const { error: delError } = await supabase
        .from("academic_event_departments")
        .delete()
        .eq("event_id", eventId);
      if (delError) throw delError;

      if (departmentIds.length > 0) {
        const { error: insError } = await supabase
          .from("academic_event_departments")
          .insert(departmentIds.map((department_id) => ({ event_id: eventId, department_id })));
        if (insError) throw insError;
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["academic_events"] }),
  });
}

/** Org-wide only (enforced in the edge function) — pulls this + next year's Thai public holidays from iApp. See migration 0045. */
export function useSyncHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const year = new Date().getFullYear();
      const { data, error } = await supabase.functions.invoke("sync-holidays", {
        body: { years: [year, year + 1] },
      });
      if (error) throw error;
      return data as { upserted: number; errors: string[] };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["academic_events"] }),
  });
}

export function useDeleteAcademicEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("academic_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["academic_events"] }),
  });
}
