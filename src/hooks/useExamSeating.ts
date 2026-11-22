import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ExamSeatTemplate, ExamSession, ExamSessionRoom, ExamSessionSeat, ExamSessionSpecialSeat } from "@/lib/database.types";

// ผังห้องสอบ (migrations 0199, 0203, 0204 special seats): department seat templates + a session's rooms (each with its own grid) and seats.

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

/** The rooms of a session, first room first. Every session has at least one (created with it). */
export function useSessionRooms(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_session_rooms", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamSessionRoom[]> => {
      const { data, error } = await supabase.from("exam_session_rooms").select("*").eq("session_id", sessionId!).order("position");
      if (error) throw error;
      return data;
    },
  });
}

/** Physical room ids per session, first room first (for lists that show where each exam is sat). */
export function useSessionRoomIds(sessionIds: string[]) {
  const key = [...sessionIds].sort();
  return useQuery({
    queryKey: ["exam_session_rooms", "ids", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await supabase.from("exam_session_rooms").select("session_id, room_id").in("session_id", key).not("room_id", "is", null).order("position");
      if (error) throw error;
      const out = new Map<string, string[]>();
      for (const r of data) out.set(r.session_id, [...(out.get(r.session_id) ?? []), r.room_id!]);
      return out;
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

const refreshRooms = (qc: ReturnType<typeof useQueryClient>, sessionId: string) => {
  void qc.invalidateQueries({ queryKey: ["exam_session_rooms"] });
  void qc.invalidateQueries({ queryKey: ["exam_session_seats", sessionId] });
  void qc.invalidateQueries({ queryKey: ["exam_session_special_seats", sessionId] }); // removing a room drops its special seats
  void qc.invalidateQueries({ queryKey: ["exam_sessions"] }); // room 1 mirrors exam_sessions.room_id
};

/** Copies a template's size onto a room; seats that no longer fit are dropped by the database. */
export function useSetRoomSeating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomRowId, template }: { sessionId: string; roomRowId: string; template: ExamSeatTemplate }) => {
      const { error } = await supabase.from("exam_session_rooms").update({ seat_rows: template.seat_rows, seat_cols: template.seat_cols, template_id: template.id }).eq("id", roomRowId);
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => refreshRooms(qc, v.sessionId),
  });
}

/** Picks (or clears) the physical room of one room row. */
export function useSetRoomPhysical() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomRowId, roomId }: { sessionId: string; roomRowId: string; roomId: string | null }) => {
      const { error } = await supabase.from("exam_session_rooms").update({ room_id: roomId }).eq("id", roomRowId);
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => refreshRooms(qc, v.sessionId),
  });
}

export function useAddSessionRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc("add_exam_session_room", { p_session: sessionId });
      if (error) throw error;
    },
    onSettled: (_d, _e, sessionId) => refreshRooms(qc, sessionId),
  });
}

/** Removes a room after the first; its seats go with it, so those students become unseated. */
export function useRemoveSessionRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomRowId }: { sessionId: string; roomRowId: string }) => {
      const { error } = await supabase.from("exam_session_rooms").delete().eq("id", roomRowId);
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => refreshRooms(qc, v.sessionId),
  });
}

/** Replaces the whole seat list of the session at once (auto-arrange, swap, move, clear); each seat names its room row. */
export function useSetSessionSeats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, seats }: { sessionId: string; seats: { student_id: string; room: string; seat_row: number; seat_col: number }[] }) => {
      const { error } = await supabase.rpc("set_exam_session_seats", { p_session: sessionId, p_seats: seats });
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ["exam_session_seats", v.sessionId] });
      void qc.invalidateQueries({ queryKey: ["exam_session_special_seats", v.sessionId] }); // a student placed in the grid leaves their special seat
    },
  });
}

/** Ids (of the given sessions) with at least one room that has a seating template chosen. */
export function useSessionsWithSeating(sessionIds: string[]) {
  const key = [...sessionIds].sort();
  return useQuery({
    queryKey: ["exam_session_rooms", "has", key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("exam_session_rooms").select("session_id").in("session_id", key).not("seat_rows", "is", null);
      if (error) throw error;
      return new Set(data.map((r) => r.session_id));
    },
  });
}

/** Seats other overlapping sessions hold in each room of this session (read-only overlay), by room row id. Needs the room and the window set. */
export function useRoomsConflictSeats(session: ExamSession, rooms: ExamSessionRoom[]) {
  const results = useQueries({
    queries: rooms.map((r) => ({
      queryKey: ["exam_session_seats", session.id, "room_conflicts", r.room_id, session.opens_at, session.closes_at],
      enabled: !!r.room_id && !!session.opens_at && !!session.closes_at,
      queryFn: async () => {
        const { data, error } = await supabase.rpc("exam_room_conflict_seats", { p_session: session.id, p_room: r.room_id! });
        if (error) throw error;
        return data;
      },
    })),
  });
  return new Map(rooms.map((r, i) => [r.id, results[i]?.data ?? []]));
}

/** Special seats (ที่นั่งพิเศษ) of a session, outside the template grid. */
export function useSpecialSeats(sessionId: string | null) {
  return useQuery({
    queryKey: ["exam_session_special_seats", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ExamSessionSpecialSeat[]> => {
      const { data, error } = await supabase.from("exam_session_special_seats").select("*").eq("session_id", sessionId!).order("special_no");
      if (error) throw error;
      return data;
    },
  });
}

/** Adds the next free special seat to a room row; the database picks the number. */
export function useAddSpecialSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomRowId }: { sessionId: string; roomRowId: string }) => {
      const { error } = await supabase.rpc("add_exam_special_seat", { p_room_row: roomRowId });
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => void qc.invalidateQueries({ queryKey: ["exam_session_special_seats", v.sessionId] }),
  });
}

/** Seats a student in a special seat (null empties it). The student leaves their grid seat; a displaced occupant becomes unseated. */
export function useSetSpecialSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seatId, studentId }: { sessionId: string; seatId: string; studentId: string | null }) => {
      const { error } = await supabase.rpc("set_exam_special_seat", { p_seat: seatId, p_student: studentId });
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ["exam_session_special_seats", v.sessionId] });
      void qc.invalidateQueries({ queryKey: ["exam_session_seats", v.sessionId] });
    },
  });
}

/** Deletes a special seat; whoever sat there becomes unseated. */
export function useDeleteSpecialSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seatId }: { sessionId: string; seatId: string }) => {
      const { error } = await supabase.from("exam_session_special_seats").delete().eq("id", seatId);
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => void qc.invalidateQueries({ queryKey: ["exam_session_special_seats", v.sessionId] }),
  });
}
