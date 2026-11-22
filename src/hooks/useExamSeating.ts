import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ExamSeatTemplate, ExamSession, ExamSessionSeat, ExamSessionSeating } from "@/lib/database.types";

// ผังห้องสอบ (migration 0199): department seat templates + one session's grid and seats.

export function useSeatTemplates() {
  return useQuery({
    queryKey: ["exam_seat_templates"],
    queryFn: async (): Promise<ExamSeatTemplate[]> => {
      const { data, error } = await supabase.from("exam_seat_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveSeatTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { id?: string; department_id: string; name: string; seat_rows: number; seat_cols: number }) => {
      const { id, ...fields } = t;
      const { error } = id
        ? await supabase.from("exam_seat_templates").update({ name: fields.name, seat_rows: fields.seat_rows, seat_cols: fields.seat_cols }).eq("id", id)
        : await supabase.from("exam_seat_templates").insert(fields);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_seat_templates"] }),
  });
}

export function useDeleteSeatTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exam_seat_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["exam_seat_templates"] }),
  });
}

/** Grid size of the session's chart, or null before a template is picked. */
export function useSessionSeating(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_session_seating", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamSessionSeating | null> => {
      const { data, error } = await supabase.from("exam_session_seating").select("*").eq("session_id", sessionId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSessionSeats(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_session_seats", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamSessionSeat[]> => {
      const { data, error } = await supabase.from("exam_session_seats").select("*").eq("session_id", sessionId!);
      if (error) throw error;
      return data;
    },
  });
}

/** Copies a template's size onto the session; seats that no longer fit are dropped by the database. */
export function useSetSessionSeating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, template }: { sessionId: string; template: ExamSeatTemplate }) => {
      const { error } = await supabase
        .from("exam_session_seating")
        .upsert(
          { session_id: sessionId, seat_rows: template.seat_rows, seat_cols: template.seat_cols, template_id: template.id, updated_at: new Date().toISOString() },
          { onConflict: "session_id" },
        );
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ["exam_session_seating", v.sessionId] });
      void qc.invalidateQueries({ queryKey: ["exam_session_seats", v.sessionId] });
    },
  });
}

/** Replaces the whole seat list at once (auto-arrange, swap, move, clear). */
export function useSetSessionSeats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, seats }: { sessionId: string; seats: { student_id: string; seat_row: number; seat_col: number }[] }) => {
      const { error } = await supabase.rpc("set_exam_session_seats", { p_session: sessionId, p_seats: seats });
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => void qc.invalidateQueries({ queryKey: ["exam_session_seats", v.sessionId] }),
  });
}

/** Ids (of the given sessions) that have a seating template chosen. */
export function useSessionsWithSeating(sessionIds: string[]) {
  const key = [...sessionIds].sort();
  return useQuery({
    queryKey: ["exam_session_seating", "has", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("exam_session_seating").select("session_id").in("session_id", key);
      if (error) throw error;
      return new Set(data.map((r) => r.session_id));
    },
  });
}

/** Seats other overlapping sessions hold in this session's room (read-only overlay); needs room and window set. Refetched on focus and after every save here. */
export function useRoomConflictSeats(session: ExamSession) {
  return useQuery({
    queryKey: ["exam_session_seats", session.id, "room_conflicts", session.room_id, session.opens_at, session.closes_at],
    enabled: !!session.room_id && !!session.opens_at && !!session.closes_at,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("exam_room_conflict_seats", { p_session: session.id });
      if (error) throw error;
      return data;
    },
  });
}
