import { lazy, Suspense, useMemo, useState } from "react";
import type { SheetRosterStudent } from "@/components/AnswerSheetCard";
import type { ScanRecord } from "@/components/AnswerSheetScanner";
import { DetailRow } from "@/components/DetailRow";
import { CameraIcon } from "@/components/icons";
import { useAnswerSheetData } from "@/hooks/useAnswerSheetData";
import type { ExamSession, Subject } from "@/lib/database.types";

// The scanner pulls in the QR reader and the image code: load it only when a teacher opens it.
const AnswerSheetScanner = lazy(() => import("@/components/AnswerSheetScanner"));

/** Room detail: scan filled answer sheets with the phone camera and review them. Phase 2: results stay on this page, not yet saved as scores. */
export function AnswerSheetScanCard({
  session,
  roster,
  sessionQuestions,
  subjects,
}: {
  session: ExamSession;
  roster: SheetRosterStudent[];
  sessionQuestions: { question_id: string; points: number }[];
  subjects: Subject[];
}) {
  const [open, setOpen] = useState(false);
  const [scans, setScans] = useState<Map<string, ScanRecord>>(new Map());
  const questionIds = useMemo(() => sessionQuestions.map((q) => q.question_id), [sessionQuestions]);
  const subjectIds = useMemo(() => subjects.map((x) => x.id), [subjects]);
  const pointsOf = useMemo(() => new Map(sessionQuestions.map((q) => [q.question_id, q.points])), [sessionQuestions]);
  const { ordered, rows, loaded, problems } = useAnswerSheetData(questionIds, subjectIds, open);

  const summary = open && problems.length > 0 ? problems[0] : `สแกนแล้ว ${scans.size}/${roster.length} คน · ทดลอง ยังไม่บันทึกเป็นคะแนน`;
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <DetailRow icon={CameraIcon} tone="check" title="สแกนตรวจกระดาษคำตอบ" open={false} onClick={() => setOpen(true)} summary={summary} alert={open && problems.length > 0} />
      {open && !loaded && problems.length === 0 && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">กำลังโหลดข้อสอบ…</p>}
      {open && loaded && problems.length === 0 && (
        <Suspense fallback={null}>
          <AnswerSheetScanner
            session={session}
            rows={rows}
            ordered={ordered}
            pointsOf={pointsOf}
            roster={roster}
            scans={scans}
            onSave={(r) => setScans((prev) => new Map(prev).set(r.studentId, r))}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
