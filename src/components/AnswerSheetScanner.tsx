import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SheetRosterStudent } from "@/components/AnswerSheetCard";
import { Button, CloseButton, Spinner } from "@/components/ui";
import type { ExamQuestionWithChoices } from "@/hooks/useExamBank";
import { answerSheetLayout, LETTERS, sheetFingerprint, type SheetRow } from "@/lib/answerSheet";
import type { ExamSession } from "@/lib/database.types";
import type { RawImage } from "@/lib/omr/image";
import type { ReadAnswer, SheetCodeInfo } from "@/lib/omr/readSheet";
import { cn } from "@/lib/utils";

/** The score a student already has in this room (latest write wins), so a save can warn before replacing it. */
export type ExistingScore = { score: number | null; kind: "scan" | "manual" | "online"; label: string; /** teacher's short-answer points of the earlier scan */ extra: number | null };
export type SaveStatus = "synced" | "off" | "not_synced";

type Review = {
  url: string;
  code: SheetCodeInfo | null;
  warnings: string[];
  answers: Record<number, number | null>;
  read: ReadAnswer[];
  studentId: string | null;
  touched: Set<number>;
};

const STATUS_LABEL = { blank: "ว่าง", double: "ติ๊กซ้ำ", unsure: "ไม่แน่ใจ", answered: "" } as const;
const CROP_SCALE = 5.5; // px per mm in the per-question strips
const RECTIFIED_SCALE = 5;

async function imageFromFile(file: File): Promise<RawImage> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: d.data, width: d.width, height: d.height };
}

/** The strip of the flattened photo around one question, so the teacher sees the real marks. */
function RowCrop({ url, number, layout }: { url: string; number: number; layout: ReturnType<typeof answerSheetLayout> }) {
  const n = layout.numbers.find((x) => x.number === number);
  if (!n) return null;
  const left = n.x - 4.5;
  const h = Math.max(8, layout.rowPitch);
  return (
    <div
      role="img"
      aria-label={`ภาพข้อ ${number} จากกระดาษ`}
      className="max-w-full rounded-md border border-border bg-no-repeat"
      style={{
        width: 56 * CROP_SCALE,
        height: h * CROP_SCALE,
        backgroundImage: `url(${url})`,
        backgroundSize: `${210 * CROP_SCALE}px ${297 * CROP_SCALE}px`,
        backgroundPosition: `${-left * CROP_SCALE}px ${-(n.y - h / 2) * CROP_SCALE}px`,
      }}
    />
  );
}

/** `value` undefined = nothing chosen yet (a flagged question the teacher has not decided); null = explicitly "ไม่ตอบ". */
function ChoiceButtons({ choices, value, onPick }: { choices: number; value: number | null | undefined; onPick: (c: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: choices }, (_, c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          onClick={() => onPick(c)}
          className={cn("tappable size-11 rounded-xl border text-base font-semibold", value === c ? "border-accent bg-accent text-white" : "border-border bg-card")}
        >
          {LETTERS[c]}
        </button>
      ))}
      <button type="button" aria-pressed={value === null} onClick={() => onPick(null)} className={cn("tappable h-11 rounded-xl border px-3 text-sm font-medium", value === null ? "border-foreground bg-foreground text-background" : "border-border bg-card")}>
        ไม่ตอบ
      </button>
    </div>
  );
}

export default function AnswerSheetScanner({
  session,
  rows,
  ordered,
  pointsOf,
  roster,
  existing,
  scannedCount,
  totalMax,
  extraMax,
  manualNumbers,
  onSave,
  onClose,
  initialImage,
}: {
  session: ExamSession;
  rows: SheetRow[];
  ordered: ExamQuestionWithChoices[];
  pointsOf: Map<string, number>;
  roster: SheetRosterStudent[];
  existing: Map<string, ExistingScore>;
  scannedCount: number;
  /** Full marks of the room, short-answer questions included. */
  totalMax: number;
  /** Points of the short-answer questions together (the most the teacher can add). */
  extraMax: number;
  /** Printed numbers of the short-answer questions. */
  manualNumbers: number[];
  /** Saves one sheet on the server; rejects with a message to show. */
  onSave: (v: { studentId: string; answers: Record<number, number | null>; extra: number }) => Promise<SaveStatus>;
  onClose: () => void;
  /** Reads this photo right away (skips the camera): used by tests and screenshots. */
  initialImage?: RawImage;
}) {
  const [phase, setPhase] = useState<"capture" | "reading" | "review">("capture");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [changing, setChanging] = useState(false);
  const [extra, setExtra] = useState("0");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<{ text: string; warn: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const layout = useMemo(() => answerSheetLayout(rows), [rows]);
  const fp = useMemo(() => sheetFingerprint(rows), [rows]);
  const rosterById = useMemo(() => new Map(roster.map((r) => [r.student_id, r])), [roster]);

  // Live camera while capturing (rear camera when there is one).
  useEffect(() => {
    if (phase !== "capture") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
        }
        setCamError(null);
      } catch {
        setCamError("เปิดกล้องไม่ได้ ใช้ปุ่ม “ถ่ายด้วยกล้องของเครื่อง” หรือเลือกไฟล์ภาพแทน");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [phase]);

  async function process(img: RawImage) {
    setPhase("reading");
    setError(null);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before the heavy loop
    try {
      const { downscale } = await import("@/lib/omr/image");
      const { readSheet, rectify } = await import("@/lib/omr/readSheet");
      const small = downscale(img, 2000);
      const res = readSheet(small, rows);
      if (!res.ok) {
        setError(res.message);
        setPhase("capture");
        return;
      }
      const flat = rectify(small, res.homography, RECTIFIED_SCALE);
      const canvas = document.createElement("canvas");
      canvas.width = flat.width;
      canvas.height = flat.height;
      canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(flat.data), flat.width, flat.height), 0, 0);
      const answers: Record<number, number | null> = {};
      for (const a of res.answers) answers[a.number] = a.status === "answered" ? a.choice : null;
      const warnings = [...res.warnings];
      if (res.code && res.code.sessionId !== session.id) warnings.push("กระดาษใบนี้เป็นของห้องสอบอื่น");
      else if (res.code && res.code.fp !== fp) warnings.push("ข้อสอบถูกแก้ไขหลังพิมพ์กระดาษใบนี้ ผลอาจไม่ตรง กรุณาพิมพ์ใหม่");
      setReview({
        url: canvas.toDataURL("image/jpeg", 0.85),
        code: res.code,
        warnings,
        answers,
        read: res.answers,
        studentId: res.code?.studentId && rosterById.has(res.code.studentId) ? res.code.studentId : null,
        touched: new Set(),
      });
      setShowAll(false);
      setChanging(false);
      setConfirmReplace(false);
      setSaveError(null);
      setExtra("0");
      setPhase("review");
    } catch {
      setError("อ่านภาพไม่สำเร็จ ลองถ่ายใหม่");
      setPhase("capture");
    }
  }

  useEffect(() => {
    if (initialImage) void process(initialImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(v, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    await process({ data: d.data, width: d.width, height: d.height });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await process(await imageFromFile(file));
  }

  const blocking = !!review?.warnings.some((w) => w.includes("ห้องสอบอื่น") || w.includes("ถูกแก้ไข"));
  const flagged = review ? review.read.filter((a) => a.status !== "answered") : [];
  const pending = review ? flagged.filter((a) => !review.touched.has(a.number)) : [];
  const set = (number: number, choice: number | null) =>
    setReview((r) => (r ? { ...r, answers: { ...r.answers, [number]: choice }, touched: new Set(r.touched).add(number) } : r));

  const score = useMemo(() => {
    if (!review) return { got: 0 };
    let got = 0;
    for (const row of rows) {
      const q = ordered[row.number - 1];
      if (!q) continue;
      const correct = q.choices.findIndex((c) => c.is_correct);
      if (correct >= 0 && review.answers[row.number] === correct) got += pointsOf.get(q.id) ?? q.points;
    }
    return { got };
  }, [review, rows, ordered, pointsOf]);

  const student = review?.studentId ? rosterById.get(review.studentId) : null;
  const prior = student ? existing.get(student.student_id) : undefined;
  const extraNum = Number(extra);
  const extraOk = extra.trim() !== "" && Number.isFinite(extraNum) && extraNum >= 0 && extraNum <= extraMax && Math.round(extraNum * 100) === extraNum * 100;
  const needsConfirm = !!prior && prior.kind !== "scan";
  const canSave = !!review && !!student && pending.length === 0 && !blocking && extraOk && (!needsConfirm || confirmReplace) && !saving;
  const choicesOf = (n: number) => rows.find((r) => r.number === n)?.choices ?? 0;

  async function save() {
    if (!review || !student) return;
    setSaving(true);
    setSaveError(null);
    try {
      const status = await onSave({ studentId: student.student_id, answers: review.answers, extra: extraNum });
      const total = score.got + extraNum;
      setLastSaved({
        text: `บันทึกแล้ว ${student.name} ได้ ${total}/${totalMax}${status === "not_synced" ? " (ยังไม่เข้าสมุดคะแนน เช่น ภาคเรียนถูกล็อก)" : ""}`,
        warn: status === "not_synced",
      });
      setReview(null);
      setPhase("capture");
    } catch (e) {
      setSaveError((e as { message?: string } | null)?.message || "บันทึกไม่สำเร็จ ลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col bg-background" style={{ pointerEvents: "auto" }}>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="font-heading min-w-0 flex-1 truncate text-base font-semibold">สแกนกระดาษคำตอบ</h2>
        <span className="text-xs tabular-nums text-muted-foreground">สแกนแล้ว {scannedCount}/{roster.length}</span>
        <CloseButton onClick={onClose} />
      </header>

      {phase === "capture" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-black">
            <video ref={videoRef} playsInline muted className="size-full object-contain" />
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[92%] max-w-[92%] rounded-lg border-2 border-dashed border-white/70" style={{ aspectRatio: "210 / 297" }} />
            </div>
            {camError && <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-black/70 px-3 py-2 text-sm text-white">{camError}</p>}
          </div>
          <div className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {lastSaved && <p role="status" className={cn("rounded-lg px-3 py-2 text-xs", lastSaved.warn ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>{lastSaved.text}</p>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <p className="text-center text-xs text-muted-foreground">วางกระดาษให้เห็นทั้งใบ มุมสี่จุดและ QR ต้องอยู่ในภาพ แสงสม่ำเสมอ ไม่เงา</p>
            <Button type="button" className="h-12 w-full text-base" disabled={!!camError} onClick={() => void capture()}>ถ่าย</Button>
            <div className="grid grid-cols-2 gap-2">
              <label className="tappable flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-sm font-medium">
                ถ่ายด้วยกล้องของเครื่อง
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onFile(e)} />
              </label>
              <label className="tappable flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-sm font-medium">
                เลือกไฟล์ภาพ
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onFile(e)} />
              </label>
            </div>
          </div>
        </div>
      )}

      {phase === "reading" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <Spinner className="h-6 w-6" />
          กำลังอ่านกระดาษ…
        </div>
      )}

      {phase === "review" && review && (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-xs text-muted-foreground">นักเรียน</p>
              {student ? (
                <p className="mt-0.5 text-sm font-semibold">{student.name} <span className="font-normal tabular-nums text-muted-foreground">{student.code} {student.room !== "—" && `· ${student.room}`}</span></p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold text-destructive">เลือกนักเรียนของกระดาษใบนี้</p>
              )}
              {(!student || changing) ? (
                <select
                  aria-label="นักเรียน"
                  value={review.studentId ?? ""}
                  onChange={(e) => {
                    setReview((r) => (r ? { ...r, studentId: e.target.value || null } : r));
                    if (e.target.value) setChanging(false);
                  }}
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-2 text-sm"
                >
                  <option value="">— เลือก —</option>
                  {roster.map((r) => (
                    <option key={r.student_id} value={r.student_id}>{r.code} {r.name}{existing.get(r.student_id)?.kind === "scan" ? " (สแกนแล้ว)" : ""}</option>
                  ))}
                </select>
              ) : (
                <button type="button" className="tappable mt-1 text-xs font-medium text-accent" onClick={() => setChanging(true)}>เปลี่ยนนักเรียน</button>
              )}
              {prior && (
                <p className={cn("mt-2 text-xs", needsConfirm ? "text-warning" : "text-muted-foreground")}>
                  มีคะแนน {prior.score ?? "—"}/{totalMax} อยู่แล้ว ({prior.label}) การบันทึกนี้จะเป็นคะแนนล่าสุด{prior.kind === "scan" ? " และแทนที่ผลสแกนเดิม" : ""}
                </p>
              )}
            </section>

            {review.warnings.map((w) => (
              <p key={w} role="alert" className={cn("rounded-lg px-3 py-2 text-xs", w.includes("ห้องสอบอื่น") || w.includes("ถูกแก้ไข") ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning")}>{w}</p>
            ))}

            <section className="space-y-1">
              <p className="text-sm font-semibold">
                {pending.length > 0 ? `ต้องตรวจ ${pending.length} ข้อ` : flagged.length > 0 ? "ตรวจครบแล้ว" : "อ่านชัดเจนทุกข้อ"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">จากทั้งหมด {rows.length} ข้อ</span>
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                ข้อกาฝนได้ {score.got} คะแนน{extraMax > 0 ? ` · รวมข้อเติมคำตอบ ${extraOk ? score.got + extraNum : "—"}/${totalMax}` : `/${totalMax}`} (เซิร์ฟเวอร์ตรวจอีกครั้งตอนบันทึก)
              </p>
            </section>

            {extraMax > 0 && (
              <section className="space-y-1.5 rounded-xl border border-border bg-card p-3.5">
                <label htmlFor="scan-extra" className="text-sm font-semibold">คะแนนข้อเติมคำตอบ (ครูตรวจเอง ข้อที่ {manualNumbers.join(", ")})</label>
                <div className="flex items-center gap-2">
                  <input id="scan-extra" type="number" inputMode="decimal" min={0} max={extraMax} step="0.5" value={extra} onChange={(e) => setExtra(e.target.value)} className="h-11 w-28 rounded-lg border border-border bg-background px-3 text-base tabular-nums" />
                  <span className="text-sm text-muted-foreground">เต็ม {extraMax}</span>
                </div>
                {!extraOk && <p role="alert" className="text-xs text-destructive">ใส่คะแนนตั้งแต่ 0 ถึง {extraMax} (ทศนิยมไม่เกิน 2 ตำแหน่ง)</p>}
              </section>
            )}

            {flagged.map((a) => (
              <section key={a.number} className={cn("space-y-2 rounded-xl border p-3", review.touched.has(a.number) ? "border-border bg-card" : "border-warning bg-warning/5")}>
                <p className="text-sm font-semibold">
                  ข้อ {a.number}
                  <span className="ml-2 text-xs font-medium text-warning">{STATUS_LABEL[a.status as keyof typeof STATUS_LABEL]}</span>
                </p>
                <RowCrop url={review.url} number={a.number} layout={layout} />
                <ChoiceButtons choices={choicesOf(a.number)} value={review.touched.has(a.number) ? (review.answers[a.number] ?? null) : undefined} onPick={(c) => set(a.number, c)} />
              </section>
            ))}

            <section>
              <button type="button" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} className="tappable text-sm font-medium text-accent">
                {showAll ? "ซ่อนคำตอบทุกข้อ" : "ดูและแก้คำตอบทุกข้อ"}
              </button>
              {showAll && (
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
                  {review.read.filter((a) => a.status === "answered").map((a) => (
                    <li key={a.number} className="space-y-2 px-3 py-2.5">
                      <p className="text-sm font-medium">ข้อ {a.number}</p>
                      <ChoiceButtons choices={choicesOf(a.number)} value={review.answers[a.number] ?? null} onPick={(c) => set(a.number, c)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <footer className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {needsConfirm && (
              <label className="flex items-start gap-2 text-xs text-warning">
                <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="mt-0.5 size-4" />
                ยืนยันว่าให้ผลจากกระดาษนี้เป็นคะแนนล่าสุดแทน {prior?.label}
              </label>
            )}
            {saveError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveError}</p>}
            {!canSave && !saving && (
              <p className="text-center text-xs text-muted-foreground">
                {blocking ? "บันทึกไม่ได้: ดูคำเตือนด้านบน" : !student ? "เลือกนักเรียนก่อนบันทึก" : pending.length > 0 ? `ตรวจอีก ${pending.length} ข้อก่อนบันทึก` : !extraOk ? "ใส่คะแนนข้อเติมคำตอบให้ถูกต้อง" : "ติ๊กยืนยันการแทนที่คะแนนเดิม"}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-12" onClick={() => { setReview(null); setPhase("capture"); }}>ถ่ายใหม่</Button>
              <Button type="button" className="h-12" disabled={!canSave} onClick={() => void save()}>{saving ? "กำลังบันทึก…" : "บันทึกใบนี้"}</Button>
            </div>
          </footer>
        </>
      )}
    </div>,
    document.body,
  );
}
