import { createPortal } from "react-dom";
import { PrintIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useSubjectsByIds } from "@/hooks/useExamBank";
import { useSessionSets } from "@/hooks/useExams";
import { useRooms } from "@/hooks/useSchedule";
import type { ExamSession } from "@/lib/database.types";
import { examLabel } from "@/lib/examKinds";

/** One room ready to print. Seats carry their label (A1…), special seats their number. */
export type PrintRoom = {
  id: string;
  position: number;
  physicalRoomId: string | null;
  rows: number;
  cols: number;
  seats: { label: string; row: number; col: number; code: string; name: string }[];
  specials: { no: number; code: string; name: string }[];
};

const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 6px", textAlign: "left", verticalAlign: "top" };

/** A4 landscape preview/print, two pages per room: the seat plan (front of the room on top, special seats below), then the roster by student code with seats.
 *  Prints through window.print() with the shared `.print-sheet` styles. */
export function ExamSeatingPrintSheet({ session, rooms, onDone }: { session: ExamSession; rooms: PrintRoom[]; onDone: () => void }) {
  const { profile } = useAuth();
  const { data: venues = [] } = useRooms(profile?.department_id ?? null);
  const { data: roomSets } = useSessionSets([session.id]);
  const { data: subjects = [] } = useSubjectsByIds([...new Set((roomSets?.get(session.id) ?? []).map((x) => x.subject_id))]);
  const opens = session.opens_at ? new Date(session.opens_at) : null;
  const closes = session.closes_at ? new Date(session.closes_at) : null;
  const hm = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const when = opens ? `${opens.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} เวลา ${hm(opens)}${closes ? ` – ${hm(closes)}` : ""} น.` : "";
  // "ห้อง อาคาร 1/2" when the physical room is known, else "(ห้องที่ 2)" for a multi-room round, else nothing.
  const roomSuffix = (r: PrintRoom) => {
    const name = venues.find((v) => v.id === r.physicalRoomId)?.name;
    return name ? ` ห้อง ${name}` : rooms.length > 1 ? ` (ห้องที่ ${r.position})` : "";
  };
  const head = (title: string, r: PrintRoom) => (
    <>
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center" }}>{title}{roomSuffix(r)}</h1>
      <p style={{ textAlign: "center" }}>{examLabel(session) ?? session.title}{subjects.length > 0 && ` · วิชา ${subjects.map((x) => `${x.code} ${x.name_th}`).join(", ")}`}</p>
      {when && <p style={{ textAlign: "center", marginBottom: 6 }}>{when}</p>}
    </>
  );
  return createPortal(
    <div className="print-sheet landscape">
      <div className="print-toolbar">
        <Button size="sm" variant="outline" onClick={onDone}>ปิด</Button>
        <Button size="sm" onClick={() => window.print()}><PrintIcon className="mr-1 h-4 w-4" />พิมพ์</Button>
      </div>
      {rooms.flatMap((r) => {
        const at = new Map(r.seats.map((s) => [`${s.row}:${s.col}`, s]));
        const small = r.cols > 8;
        const roster = [
          ...r.seats.map((s) => ({ code: s.code, name: s.name, seat: s.label })),
          ...r.specials.map((s) => ({ code: s.code, name: s.name, seat: `พิเศษ ${s.no}` })),
        ].sort((a, b) => a.code.localeCompare(b.code, "th", { numeric: true }));
        const half = Math.ceil(roster.length / 2);
        const columns = [roster.slice(0, half), roster.slice(half)];
        return [
          <div className="paper" key={`${r.id}:plan`}>
            {head("ผังที่นั่งสอบ", r)}
            <div style={{ textAlign: "center", border: "1px solid #000", background: "#eee", padding: "2px 0", margin: "6px 0", fontWeight: 700 }}>หน้าห้อง</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: small ? 10 : 12 }}>
              <tbody>
                {Array.from({ length: r.rows }, (_, i) => (
                  <tr key={i} style={{ height: `${Math.max(12, Math.min(22, 120 / r.rows))}mm` }}>
                    {Array.from({ length: r.cols }, (_, j) => {
                      const s = at.get(`${i + 1}:${j + 1}`);
                      return (
                        <td key={j} style={{ ...cell, breakInside: "avoid" }}>
                          <div style={{ fontSize: small ? 9 : 10 }}>{s?.label ?? ""}</div>
                          {s && (
                            <>
                              <div style={{ fontWeight: 700 }}>{s.code}</div>
                              <div>{s.name}</div>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {r.specials.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>ที่นั่งพิเศษ</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {r.specials.map((s) => (
                    <div key={s.no} style={{ ...cell, minWidth: "40mm", fontSize: 11 }}>
                      <div style={{ fontSize: 10 }}>พิเศษ {s.no}</div>
                      <div><b>{s.code}</b> {s.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>,
          <div className="paper" key={`${r.id}:roster`}>
            {head("รายชื่อผู้เข้าสอบ", r)}
            <p style={{ textAlign: "center", marginBottom: 8 }}>นักเรียน {roster.length} คน</p>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {columns.map((list, c) => (
                <table key={c} style={{ flex: 1, borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#eee" }}>
                      {["ที่", "เลขประจำตัว", "ชื่อ-สกุล", "ที่นั่ง"].map((h) => <th key={h} style={cell}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e, i) => (
                      <tr key={e.code + e.seat} style={{ breakInside: "avoid" }}>
                        <td style={{ ...cell, textAlign: "center" }}>{c * half + i + 1}</td>
                        <td style={cell}>{e.code}</td>
                        <td style={cell}>{e.name}</td>
                        <td style={{ ...cell, whiteSpace: "nowrap" }}>{e.seat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </div>,
        ];
      })}
    </div>,
    document.body,
  );
}
