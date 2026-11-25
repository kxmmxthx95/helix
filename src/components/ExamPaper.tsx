import { useState } from "react";
import { ChevronBack, ChevronForward, DocumentTextIcon, ListIcon, TimeIcon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The exam page, shared by the real exam (AttemptRunner), the rehearsal and the read-only review of a
 * finished attempt, so they never drift apart. Purely presentational: the caller owns answers, saving,
 * the clock and submitting.
 *
 * Same shape as the practice runner: one question at a time with ก่อนหน้า/ถัดไป, an overview of every question
 * (a side panel on wide screens, a tab on phones). A sticky HUD keeps the answer rail (tap to jump) and the
 * timer in view on both tabs, with a thin line that drains with the time left. Nothing is checked here.
 *
 * Review mode (`review` set): same page, read-only. Questions carry a verdict and the answer key; the rail and
 * overview are coloured right / wrong / skipped; the timer becomes the score; no submit.
 */
export type Verdict = "right" | "wrong" | "skipped";
export type PaperQuestion = {
  id: string;
  prompt: React.ReactNode;
  /** Absent = short answer. `correct` (review only) marks the key. */
  choices?: { id: string; label: React.ReactNode; correct?: boolean }[];
  /** Review only. */
  verdict?: Verdict;
  /** Review only: the key of a short-answer question. */
  correctAnswer?: string | null;
  /** Review only: "ได้ 1/1 คะแนน". */
  points?: string;
};
export type PaperAnswer = { choiceId: string | null; text: string };

const MARKS = ["ก", "ข", "ค", "ง", "จ", "ฉ"];

const isAnswered = (a: PaperAnswer | undefined) => !!a && (!!a.choiceId || !!a.text.trim());

export function ExamPaper({
  questions,
  answers,
  onChoice,
  onText,
  remainingSec,
  totalSec,
  header,
  notices,
  onSubmit,
  submitting,
  onLeave,
  leaveLabel,
  review,
}: {
  questions: PaperQuestion[];
  answers: Record<string, PaperAnswer>;
  onChoice?: (questionId: string, choiceId: string) => void;
  onText?: (questionId: string, text: string) => void;
  /** null/undefined = the exam has no countdown of its own. */
  remainingSec?: number | null;
  totalSec?: number | null;
  /** Shown above the HUD, scrolls away. */
  header?: React.ReactNode;
  /** Banners shown under the HUD (rehearsal mode, screen-switch warning, attempt switcher). */
  notices?: React.ReactNode;
  onSubmit?: () => void;
  submitting?: boolean;
  onLeave: () => void;
  leaveLabel: string;
  /** Read-only review of a finished attempt; `scoreLabel` replaces the timer. */
  review?: { scoreLabel: string };
}) {
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<"exam" | "overview">("exam");
  const [confirming, setConfirming] = useState(false);
  const last = questions.length - 1;
  const q = questions[Math.min(idx, last)];
  if (!q) return null;
  const a = answers[q.id];
  const answered = questions.filter((x) => isAnswered(answers[x.id])).length;
  const unanswered = questions.length - answered;
  const rightCount = questions.filter((x) => x.verdict === "right").length;
  const timed = !review && remainingSec != null;
  const low = timed && remainingSec < 60;
  const goto = (i: number) => {
    setIdx(i);
    setTab("exam");
  };
  const submitNow = () => setConfirming(true);

  const railTone = (x: PaperQuestion) =>
    review
      ? x.verdict === "right"
        ? "bg-success"
        : x.verdict === "wrong"
          ? "bg-destructive"
          : "bg-border"
      : isAnswered(answers[x.id])
        ? "bg-accent"
        : "bg-border";
  const cellTone = (x: PaperQuestion) =>
    review
      ? x.verdict === "right"
        ? "border-success/40 bg-success/10 text-success"
        : x.verdict === "wrong"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-card text-muted-foreground"
      : isAnswered(answers[x.id])
        ? "border-accent/40 bg-accent/10 text-accent"
        : "border-border bg-card text-muted-foreground";

  const overview = (
    <Card className="space-y-4">
      <p className="text-sm font-semibold">ภาพรวม</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => goto(i)}
            aria-label={`ข้อ ${i + 1}`}
            className={cn("h-10 rounded-lg border text-sm font-medium tabular-nums", cellTone(x), i === idx && "ring-2 ring-accent ring-offset-1")}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {review ? (
          <>
            <span className="text-success">เขียว = ถูก</span>
            <span className="text-destructive">แดง = ผิด</span>
            <span>ขาว = ไม่ได้ตอบ</span>
          </>
        ) : (
          <>
            <span>ขาว = ยังไม่ตอบ</span>
            <span className="text-accent">ฟ้า = ตอบแล้ว</span>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {!review && (
          <Button type="button" className="w-full" disabled={submitting} onClick={submitNow}>
            ส่งคำตอบ
          </Button>
        )}
        <Button type="button" variant={review ? "default" : "outline"} className="w-full" onClick={onLeave}>
          {leaveLabel}
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col lg:max-w-none">
      {header && <div className="pb-1 pt-2">{header}</div>}
      <div className="sticky top-0 z-10 -mx-3 space-y-2 bg-background/90 px-3 pb-2 pt-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold tabular-nums">
            ข้อ {idx + 1}
            <span className="font-normal text-muted-foreground">
              {" "}
              / {questions.length} · {review ? `ถูก ${rightCount}` : `ตอบแล้ว ${answered}`}
            </span>
          </p>
          {review && (
            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">
              คะแนน {review.scoreLabel}
            </span>
          )}
          {timed && (
            <span
              role="timer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-sm font-semibold tabular-nums",
                low ? "bg-destructive/10 text-destructive" : "bg-muted",
              )}
            >
              <TimeIcon size={14} />
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="flex gap-0.5" role="group" aria-label="ความคืบหน้า">
          {questions.map((x, i) => (
            <button
              key={x.id}
              type="button"
              onClick={() => goto(i)}
              aria-label={`ไปข้อ ${i + 1}`}
              aria-current={i === idx}
              className="flex h-6 min-w-0 flex-1 items-center"
            >
              <span
                className={cn(
                  "w-full rounded-full transition-all",
                  i === idx ? "h-2.5" : "h-1.5",
                  railTone(x),
                  !review && i === idx && !isAnswered(answers[x.id]) && "bg-accent/45",
                )}
              />
            </button>
          ))}
        </div>
        {timed && totalSec ? (
          <div className="h-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", low ? "bg-destructive" : "bg-foreground/40")}
              style={{ width: `${Math.min(100, (remainingSec / totalSec) * 100)}%` }}
            />
          </div>
        ) : null}
        {notices}
      </div>

      <div className="space-y-3 pb-4 pt-1 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-4 lg:space-y-0">
        <div className={cn("space-y-3", tab !== "exam" && "max-lg:hidden")}>
          <Card className="space-y-5 p-5">
            <div className="flex items-start gap-3">
              <span aria-hidden className="font-heading text-4xl font-semibold leading-[1.1] tabular-nums text-accent/25">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1 pt-0.5 text-[17px] font-semibold leading-snug">{q.prompt}</div>
            </div>
            {q.choices ? (
              <div className="space-y-2.5" role={review ? "list" : "radiogroup"}>
                {q.choices.map((c, ci) => {
                  const selected = a?.choiceId === c.id;
                  const right = !!review && !!c.correct;
                  const wrong = !!review && selected && !c.correct;
                  const rowClass = cn(
                    "flex items-start gap-3 rounded-2xl border border-border bg-card p-3 font-sarabun text-[15px] leading-snug transition-colors",
                    !review && "cursor-pointer active:scale-[0.99] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                    !review && selected && "border-accent bg-accent/5",
                    right && "border-success/60 bg-success/10",
                    wrong && "border-destructive/60 bg-destructive/10",
                  );
                  const mark = (
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[13px] font-semibold text-muted-foreground",
                        !review && selected && "border-accent bg-accent text-accent-foreground",
                        right && "border-success bg-success text-white",
                        wrong && "border-destructive bg-destructive text-white",
                      )}
                    >
                      {right ? "✓" : wrong ? "✕" : (MARKS[ci] ?? ci + 1)}
                    </span>
                  );
                  if (review)
                    return (
                      <div key={c.id} role="listitem" className={rowClass}>
                        {mark}
                        <span className="min-w-0 flex-1 self-center">{c.label}</span>
                        {selected && (
                          <span className="self-center rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-medium">คำตอบของคุณ</span>
                        )}
                      </div>
                    );
                  return (
                    <label key={c.id} className={rowClass}>
                      <input type="radio" className="sr-only" name={q.id} checked={selected} onChange={() => onChoice?.(q.id, c.id)} />
                      {mark}
                      <span className="min-w-0 flex-1 self-center">{c.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Input
                value={a?.text ?? ""}
                onChange={(e) => onText?.(q.id, e.target.value)}
                placeholder={review ? "ไม่ได้ตอบ" : "พิมพ์คำตอบ"}
                readOnly={!!review}
              />
            )}
            {review && q.verdict && (
              <div
                role="status"
                className={cn(
                  "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm",
                  q.verdict === "right" ? "bg-success/10" : q.verdict === "wrong" ? "bg-destructive/10" : "bg-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                    q.verdict === "right" ? "bg-success" : q.verdict === "wrong" ? "bg-destructive" : "bg-muted-foreground",
                  )}
                >
                  {q.verdict === "right" ? "✓" : q.verdict === "wrong" ? "✕" : "–"}
                </span>
                <div>
                  <p className="font-semibold">{q.verdict === "right" ? "ถูกต้อง" : q.verdict === "wrong" ? "ไม่ถูกต้อง" : "ไม่ได้ตอบ"}</p>
                  {!q.choices && q.verdict !== "right" && q.correctAnswer && <p className="text-muted-foreground">เฉลย: {q.correctAnswer}</p>}
                  {q.points && <p className="text-xs text-muted-foreground">{q.points}</p>}
                </div>
              </div>
            )}
          </Card>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 border-border" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
              <ChevronBack className="h-4 w-4" /> ข้อก่อนหน้า
            </Button>
            {idx < last ? (
              <Button type="button" className="flex-[2]" onClick={() => setIdx(idx + 1)}>
                ข้อถัดไป <ChevronForward className="h-4 w-4" />
              </Button>
            ) : review ? (
              <Button type="button" className="flex-[2]" onClick={onLeave}>
                {leaveLabel}
              </Button>
            ) : (
              <Button type="button" className="flex-[2]" disabled={submitting} onClick={submitNow}>
                ส่งคำตอบ
              </Button>
            )}
          </div>
        </div>
        <div className={cn("lg:sticky lg:top-28", tab !== "overview" && "max-lg:hidden")}>{overview}</div>
      </div>

      <nav aria-label="ส่วนของหน้า" className="pb-safe sticky bottom-0 -mx-1 mt-auto grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1 shadow-float lg:hidden">
        {([["overview", "ภาพรวม", ListIcon], ["exam", "ข้อสอบ", DocumentTextIcon]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={cn("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium", tab === key ? "bg-accent/10 text-accent" : "text-muted-foreground")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>

      {!review && (
        <Modal
          open={confirming}
          onOpenChange={setConfirming}
          title="ส่งคำตอบ?"
          description={unanswered > 0 ? `ยังไม่ได้ตอบ ${unanswered} ข้อ ส่งแล้วแก้ไขไม่ได้` : "ตอบครบทุกข้อแล้ว ส่งแล้วแก้ไขไม่ได้"}
          centered
          footer={
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
                กลับไปตรวจ
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={submitting}
                onClick={() => {
                  setConfirming(false);
                  onSubmit?.();
                }}
              >
                ส่งคำตอบ
              </Button>
            </div>
          }
        >
          {null}
        </Modal>
      )}
    </div>
  );
}
