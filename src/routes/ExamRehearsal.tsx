import { useEffect, useRef, useState } from "react";
import { ExamPaper, type PaperAnswer } from "@/components/ExamPaper";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * ห้องซ้อมสอบ: same page shape as the real exam (sticky counter + timer, all questions on one page, submit),
 * but built-in sample questions, nothing is read from or written to the database — no attempt, no score,
 * no code, no device lock, no security events. Switching screens only shows a warning here.
 */
const DURATION_SEC = 180;

type Sample = { id: string; prompt: string; choices?: string[] };
const SAMPLE: readonly Sample[] = [
  { id: "s1", prompt: "ข้อใดคือเมืองหลวงของประเทศไทย", choices: ["เชียงใหม่", "กรุงเทพมหานคร", "ภูเก็ต", "ขอนแก่น"] },
  { id: "s2", prompt: "หนึ่งสัปดาห์มีกี่วัน", choices: ["5 วัน", "6 วัน", "7 วัน", "8 วัน"] },
  { id: "s3", prompt: "พิมพ์คำว่า “พร้อมสอบ” ลงในช่องคำตอบ" },
];

export function ExamRehearsal({ header, onExit }: { header: React.ReactNode; onExit: () => void }) {
  const [run, setRun] = useState(0); // bump to start over
  return <Rehearsal key={run} header={header} onRestart={() => setRun((n) => n + 1)} onExit={onExit} />;
}

function Rehearsal({ header, onRestart, onExit }: { header: React.ReactNode; onRestart: () => void; onExit: () => void }) {
  const [answers, setAnswers] = useState<Record<string, PaperAnswer>>({});
  const [done, setDone] = useState<"submitted" | "timeout" | null>(null);
  const [switches, setSwitches] = useState(0);
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  const remaining = Math.max(0, DURATION_SEC - Math.floor((now - startedAt.current) / 1000));
  const answered = SAMPLE.filter((q) => answers[q.id]?.choiceId || answers[q.id]?.text.trim()).length;

  useEffect(() => {
    if (done) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [done]);

  useEffect(() => {
    if (!done && remaining === 0) setDone("timeout");
  }, [done, remaining]);

  useEffect(() => {
    if (done) return;
    const hit = () => setSwitches((n) => n + 1);
    const onVisibility = () => document.hidden && hit();
    window.addEventListener("blur", hit);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", hit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [done]);

  if (done) {
    return (
      <RehearsalResult
        header={header}
        answered={answered}
        total={SAMPLE.length}
        usedSec={done === "timeout" ? DURATION_SEC : DURATION_SEC - remaining}
        timedOut={done === "timeout"}
        switches={switches}
        onRestart={onRestart}
        onExit={onExit}
      />
    );
  }

  return (
    <ExamPaper
      header={header}
      questions={SAMPLE.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        choices: q.choices?.map((c) => ({ id: c, label: c })),
      }))}
      answers={Object.fromEntries(SAMPLE.map((q) => [q.id, answers[q.id] ?? { choiceId: null, text: "" }]))}
      onChoice={(qid, cid) => setAnswers({ ...answers, [qid]: { choiceId: cid, text: "" } })}
      onText={(qid, text) => setAnswers({ ...answers, [qid]: { choiceId: null, text } })}
      remainingSec={remaining}
      totalSec={DURATION_SEC}
      notices={
        <>
          <p role="status" className="rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium">
            โหมดซ้อม · ข้อสอบตัวอย่าง ไม่บันทึกคะแนน
          </p>
          {switches > 0 && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium">
              ตรวจพบการสลับหน้าจอ {switches} ครั้ง — ในการสอบจริง ระบบจะบันทึกและแจ้งครู
            </p>
          )}
        </>
      }
      onSubmit={() => setDone("submitted")}
      onLeave={onExit}
      leaveLabel="ออกจากห้องซ้อม"
    />
  );
}

/** Done page: a progress ring that fills once, then a short readiness checklist of what was just tried. */
function RehearsalResult({
  header,
  answered,
  total,
  usedSec,
  timedOut,
  switches,
  onRestart,
  onExit,
}: {
  header: React.ReactNode;
  answered: number;
  total: number;
  usedSec: number;
  timedOut: boolean;
  switches: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const R = 52;
  const C = 2 * Math.PI * R;
  const full = answered === total;
  const checks: { ok: boolean; text: string }[] = [
    { ok: true, text: "เลือกคำตอบและพิมพ์คำตอบได้" },
    { ok: true, text: `ตัวจับเวลาทำงาน — ใช้ไป ${Math.floor(usedSec / 60)}:${String(usedSec % 60).padStart(2, "0")} นาที` },
    { ok: true, text: timedOut ? "หมดเวลา ระบบส่งคำตอบให้อัตโนมัติ" : "ส่งคำตอบเองได้" },
    switches > 0
      ? { ok: false, text: `สลับหน้าจอ ${switches} ครั้ง — สอบจริงจะบันทึกและแจ้งครู` }
      : { ok: true, text: "ไม่มีการสลับหน้าจอ" },
  ];

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" onClick={onRestart}>
        ซ้อมอีกครั้ง
      </Button>
      <Button className="flex-[2]" onClick={onExit}>
        กลับหน้าสอบ
      </Button>
    </div>
  );

  // Phone: one column, actions pinned to the bottom. Tablet: same, wider. Desktop: ring + title on the left,
  // checklist + actions on the right, so the card fills the page instead of floating in the middle.
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col sm:max-w-xl lg:max-w-4xl">
      <div className="pb-5 pt-2">{header}</div>
      <Card className="space-y-6 p-6 text-center shadow-float lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-center lg:gap-10 lg:space-y-0 lg:p-10 lg:text-left">
        <div className="space-y-5 lg:text-center">
          <div className="relative mx-auto size-32 sm:size-36 lg:size-44">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="9" className="stroke-muted" />
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={filled ? C * (1 - answered / total) : C}
                className={cn("transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none", full ? "stroke-success" : "stroke-accent")}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-3xl font-bold leading-none tabular-nums lg:text-5xl">
                {answered}
                <span className="text-lg font-medium text-muted-foreground lg:text-2xl">/{total}</span>
              </span>
              <span className="mt-1 text-[11px] text-muted-foreground lg:text-xs">ข้อที่ตอบ</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-heading text-xl font-bold lg:text-2xl">ซ้อมเสร็จแล้ว</p>
            <p className="text-xs text-muted-foreground lg:text-sm">ไม่มีการบันทึกคะแนน และไม่กินสิทธิ์สอบ</p>
          </div>
        </div>
        <div className="space-y-4 text-left">
          <p className="text-xs font-medium text-muted-foreground">สิ่งที่ได้ลองแล้ว</p>
          <ul className="space-y-2">
            {checks.map((c, i) => (
              <li
                key={c.text}
                style={{ animationDelay: `${300 + i * 90}ms` }}
                className="flex animate-fade-in items-start gap-3 rounded-xl bg-muted/60 px-4 py-3 text-[13px] [animation-fill-mode:backwards] motion-reduce:animate-none lg:text-sm"
              >
                <span
                  aria-hidden
                  className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", c.ok ? "bg-success" : "bg-amber-500")}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
          <div className="hidden lg:block">{actions}</div>
        </div>
      </Card>
      <div className="pb-safe sticky bottom-0 -mx-3 mt-auto border-t border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden">{actions}</div>
    </div>
  );
}
