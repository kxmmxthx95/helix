import { lazy, Suspense, useMemo, useState } from "react";
import type { SheetRosterStudent } from "@/components/AnswerSheetCard";
import type { ExistingScore } from "@/components/AnswerSheetScanner";
import { DetailRow } from "@/components/DetailRow";
import { CameraIcon } from "@/components/icons";
import { useAnswerSheetData } from "@/hooks/useAnswerSheetData";
import { attemptScoreTime, useSaveExamScan } from "@/hooks/useExams";
import type { ExamAttempt, ExamSession, Subject } from "@/lib/database.types";

// The scanner pulls in the QR reader and the image code: load it only when a teacher opens it.
const AnswerSheetScanner = lazy(() => import("@/components/AnswerSheetScanner"));

/** Room detail: scan filled answer sheets with the phone camera, review them and save the scores (graded on the server). */
export function AnswerSheetScanCard({
  session,
  roster,
  attempts,
  sessionQuestions,
  subjects,
}: {
  session: ExamSession;
  roster: SheetRosterStudent[];
  attempts: ExamAttempt[];
  sessionQuestions: { question_id: string; points: number }[];
  subjects: Subject[];
}) {
  const [open, setOpen] = useState(false);
  const save = useSaveExamScan();
  const questionIds = useMemo(() => sessionQuestions.map((q) => q.question_id), [sessionQuestions]);
  const subjectIds = useMemo(() => subjects.map((x) => x.id), [subjects]);
  const pointsOf = useMemo(() => new Map(sessionQuestions.map((q) => [q.question_id, q.points])), [sessionQuestions]);
  const { ordered, rows, manualNumbers, loaded, problems } = useAnswerSheetData(questionIds, subjectIds, open);

  // The score each student has now (latest write wins), to warn before a scan replaces it.
  const existing = useMemo(() => {
    const latest = new Map<string, ExamAttempt>();
    for (const a of attempts) {
      if (a.status !== "submitted") continue;
      const cur = latest.get(a.student_id);
      if (!cur || attemptScoreTime(a) > attemptScoreTime(cur)) latest.set(a.student_id, a);
    }
    return new Map<string, ExistingScore>(
      [...latest].map(([id, a]) => [
        id,
        {
          score: a.score,
          kind: a.is_scan ? "scan" : a.is_manual ? "manual" : "online",
          label: a.is_scan ? "สแกนกระดาษ" : a.is_manual ? "ครูกรอก" : `ออนไลน์ ครั้งที่ ${a.attempt_no}`,
          extra: a.is_scan ? a.scan_extra : null,
        },
      ]),
    );
  }, [attempts]);
  const scannedCount = attempts.filter((a) => a.is_scan).length;
  const totalMax = sessionQuestions.reduce((n, q) => n + q.points, 0);
  const extraMax = ordered.reduce((n, q) => n + (q.question_type === "short_answer" ? (pointsOf.get(q.id) ?? q.points) : 0), 0);

  const summary = open && problems.length > 0 ? problems[0] : `สแกนแล้ว ${scannedCount}/${roster.length} คน`;
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
            existing={existing}
            scannedCount={scannedCount}
            totalMax={totalMax}
            extraMax={extraMax}
            manualNumbers={manualNumbers}
            onSave={({ studentId, answers, extra }) =>
              save.mutateAsync({
                sessionId: session.id,
                studentId,
                extra,
                answers: rows.map((r) => {
                  const q = ordered[r.number - 1]!;
                  const idx = answers[r.number];
                  return { question_id: q.id, choice_id: idx == null ? null : (q.choices[idx]?.id ?? null) };
                }),
              })
            }
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
