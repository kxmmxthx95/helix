import { createPortal } from "react-dom";
import { encode } from "uqr";
import { PrintIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import type { ExamSession } from "@/lib/database.types";
import { answerSheetLayout, encodeSheetCode, LETTERS, SHEET, sheetFingerprint, type SheetRow } from "@/lib/answerSheet";
import { examLabel } from "@/lib/examKinds";

/** One sheet: a student, or `null` fields for a spare sheet filled in by hand. */
export type SheetStudent = { id: string | null; name: string; code: string; classroom: string; seat: string | null };

const QR_X = 160;
const QR_Y = 14;
const QR_SIZE = 32;

/** QR as one path of module squares, in sheet millimetres. */
function qrPath(text: string): string {
  const { data, size } = encode(text, { ecc: "M", border: 0 });
  const m = QR_SIZE / size;
  let d = "";
  data.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) d += `M${(QR_X + c * m).toFixed(3)} ${(QR_Y + r * m).toFixed(3)}h${m.toFixed(3)}v${m.toFixed(3)}h${(-m).toFixed(3)}z`;
    }),
  );
  return d;
}

const hm = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const mm = (v: number): React.CSSProperties => ({ position: "absolute", left: `${v}mm` });

/** One A4 page: the paper `div` of a single sheet (no portal, so it can also be rendered on its own). */
export function AnswerSheetPage({ session, rows, manualNumbers, student: s, subjectsLabel }: { session: ExamSession; rows: SheetRow[]; manualNumbers: number[]; student: SheetStudent; subjectsLabel: string }) {
  const layout = answerSheetLayout(rows);
  const fp = sheetFingerprint(rows);
  const opens = session.opens_at ? new Date(session.opens_at) : null;
  const closes = session.closes_at ? new Date(session.closes_at) : null;
  const when = opens ? `${opens.toLocaleDateString("th-TH", { dateStyle: "long" })} เวลา ${hm(opens)}${closes ? ` – ${hm(closes)}` : ""} น.` : "";
  const field = (label: string, value: string, x: number, y: number, w: number) => (
    <div style={{ ...mm(x), top: `${y}mm`, width: `${w}mm`, display: "flex", alignItems: "flex-end", gap: 4, fontSize: 13 }}>
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, borderBottom: "1px dotted #000", height: "1.35em", whiteSpace: "nowrap", overflow: "hidden", fontWeight: 700, fontSize: value.length > 30 ? 11 : 13 }}>{value}</span>
    </div>
  );
  return (
    <div className="paper">
      <svg viewBox={`0 0 ${SHEET.w} ${SHEET.h}`} width={`${SHEET.w}mm`} height={`${SHEET.h}mm`} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden>
            {layout.marks.map((m) => <rect key={`${m.x}:${m.y}`} x={m.x} y={m.y} width={m.size} height={m.size} fill="#000" />)}
            <path d={qrPath(encodeSheetCode(session.id, s.id, fp))} fill="#000" />
            {layout.headers.map((h) => (
              <text key={`${h.column}:${h.choice}`} x={h.x} y={h.y} fontSize={4.2} fontWeight={700} textAnchor="middle" dominantBaseline="central" fontFamily='Sarabun, "TH Sarabun New", serif' fill="#000">{LETTERS[h.choice]}</text>
            ))}
            {layout.numbers.map((n) => (
              <text key={n.number} x={n.x + 2.5} y={n.y} fontSize={3.8} textAnchor="end" dominantBaseline="central" fontFamily='Sarabun, "TH Sarabun New", serif' fill="#000">{n.number}</text>
            ))}
            {layout.bubbles.map((b) => <circle key={`${b.number}:${b.choice}`} cx={b.x} cy={b.y} r={SHEET.bubbleR} fill="none" stroke="#000" strokeWidth={0.35} />)}
          </svg>
          <div style={{ ...mm(20), top: "12mm", width: "132mm", fontSize: 13 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>กระดาษคำตอบ</h1>
            <p style={{ fontWeight: 700 }}>{examLabel(session) ?? session.title}</p>
            {subjectsLabel && <p>วิชา {subjectsLabel}</p>}
            {when && <p>วันที่สอบ {when}</p>}
          </div>
          {field("ชื่อ-สกุล", s.name, 20, 48, 135)}
          {field("รหัสนักเรียน", s.code, 20, 57, 66)}
          {field("ชั้น/ห้อง", s.classroom, 92, 57, 63)}
          {field("ที่นั่งสอบ", s.seat ?? "", 20, 66, 66)}
          <div style={{ ...mm(QR_X), top: `${QR_Y + QR_SIZE + 1}mm`, width: `${QR_SIZE}mm`, fontSize: 8, textAlign: "center", lineHeight: 1.2 }}>QR นี้ใช้ตรวจข้อสอบ<br />ห้ามพับหรือขีดเขียน</div>
          <div style={{ ...mm(20), top: "76mm", width: "172mm", border: "1px solid #000", borderRadius: 3, padding: "1.5mm 3mm", fontSize: 11.5, lineHeight: 1.35 }}>
            <b>วิธีตอบ</b> ใช้ปากกาหรือดินสอสีเข้ม ฝนวงกลมให้ทึบหรือกาให้ชัดเจน เลือกข้อละ 1 คำตอบ ถ้าเปลี่ยนคำตอบให้ลบของเดิมให้สะอาด
          </div>
          {manualNumbers.length > 0 && (
            <div style={{ ...mm(20), top: "266mm", width: "172mm", fontSize: 10.5 }}>ข้อที่ครูตรวจเอง (ไม่ต้องตอบในกระดาษนี้): {manualNumbers.join(", ")}</div>
          )}
    </div>
  );
}

/**
 * A4 preview/print of the bubble answer sheets, one page per student (shared `.print-sheet` styles, named page
 * `answer` with no margin so the millimetre geometry from answerSheetLayout is exact).
 */
export function AnswerSheetPrint({
  session,
  rows,
  manualNumbers,
  students,
  subjectsLabel,
  onDone,
}: {
  session: ExamSession;
  rows: SheetRow[];
  /** Printed numbers of the short-answer questions the teacher marks by hand. */
  manualNumbers: number[];
  students: SheetStudent[];
  subjectsLabel: string;
  onDone: () => void;
}) {
  return createPortal(
    <div className="print-sheet answer-sheets">
      <div className="print-toolbar">
        <span style={{ marginRight: "auto", color: "#d4d4d8", fontSize: 12, alignSelf: "center" }}>
          {students.length} ใบ · เลือกขนาด A4 และมาตราส่ง 100% (ไม่ใช้ “ย่อให้พอดี”) ปิดหัวท้ายกระดาษ
        </span>
        <Button size="sm" variant="outline" onClick={onDone}>ปิด</Button>
        <Button size="sm" onClick={() => window.print()}><PrintIcon className="mr-1 h-4 w-4" />พิมพ์</Button>
      </div>
      {students.map((s, i) => (
        <AnswerSheetPage key={s.id ?? `spare-${i}`} session={session} rows={rows} manualNumbers={manualNumbers} student={s} subjectsLabel={subjectsLabel} />
      ))}
    </div>,
    document.body,
  );
}
