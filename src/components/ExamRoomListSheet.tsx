import { createPortal } from "react-dom";
import { PrintIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { useAuth } from "@/auth/AuthProvider";
import { useSubjectsByIds } from "@/hooks/useExamBank";
import { useSessionSets } from "@/hooks/useExams";
import { useRooms } from "@/hooks/useSchedule";
import type { ExamSession, ExamSessionRoom } from "@/lib/database.types";
import { examLabel } from "@/lib/examKinds";

export type RoomListEntry = { seat: string; code: string; name: string; classroom: string };

/** A4 name list of the students sitting in one physical exam room, in seat order (posted at the door). Reuses the exam paper's print preview styles. */
export function ExamRoomListSheet({ session, room, entries, onDone }: { session: ExamSession; room: ExamSessionRoom; entries: RoomListEntry[]; onDone: () => void }) {
  const { profile } = useAuth();
  const { data: venues = [] } = useRooms(profile?.department_id ?? null);
  const { data: roomSets } = useSessionSets([session.id]);
  const { data: subjects = [] } = useSubjectsByIds([...new Set((roomSets?.get(session.id) ?? []).map((x) => x.subject_id))]);
  const venue = venues.find((v) => v.id === room.room_id)?.name;
  const opens = session.opens_at ? new Date(session.opens_at) : null;
  const closes = session.closes_at ? new Date(session.closes_at) : null;
  const hm = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const when = opens ? `${opens.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} เวลา ${hm(opens)}${closes ? ` – ${hm(closes)}` : ""} น.` : "";
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 8px", textAlign: "left" };
  return createPortal(
    <div className="print-sheet">
      <div className="print-toolbar">
        <Button size="sm" variant="outline" onClick={onDone}>ปิด</Button>
        <Button size="sm" onClick={() => window.print()}><PrintIcon className="mr-1 h-4 w-4" />พิมพ์</Button>
      </div>
      <div className="paper">
        <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center" }}>รายชื่อผู้เข้าสอบ{venue && ` ห้อง ${venue}`}</h1>
        <p style={{ textAlign: "center" }}>{examLabel(session) ?? session.title}</p>
        <p style={{ textAlign: "center" }}>วิชา {subjects.map((x) => `${x.code} ${x.name_th}`).join(", ") || "-"}</p>
        {when && <p style={{ textAlign: "center" }}>{when}</p>}
        <p style={{ textAlign: "center", marginBottom: 8 }}>นักเรียน {entries.length} คน</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#eee" }}>
              {["ลำดับ", "ที่นั่ง", "เลขประจำตัว", "ชื่อ-สกุล", "ชั้น/ห้อง"].map((h) => <th key={h} style={cell}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} style={{ breakInside: "avoid" }}>
                <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{e.seat}</td>
                <td style={cell}>{e.code}</td>
                <td style={cell}>{e.name}</td>
                <td style={cell}>{e.classroom || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
}
