import { motion, useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BookIcon, CheckmarkCircleIcon, ChevronBack, ChevronForward, DocumentTextIcon, DownloadIcon, RibbonIcon, Search } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Skeleton } from "@/components/ui";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { useCurrentTerm } from "@/hooks/useAcademicTerms";
import { useDeptClassroomOverview, type OverviewSubject } from "@/hooks/useDeptClassroomOverview";
import { downloadDocFile } from "@/hooks/useDocuments";
import { useMyCurrentClassroom } from "@/hooks/useExams";
import { openDocFile } from "@/hooks/usePlan";
import { useDepartments } from "@/hooks/useProfiles";
import { cn } from "@/lib/utils";


type AreaStyle = { label: string; card: string; node: string };
const AREA: Record<string, AreaStyle> = {
  ท: { label: "ภาษาไทย", card: "from-rose-500 to-rose-700", node: "from-rose-400 to-rose-600" },
  ค: { label: "คณิตศาสตร์", card: "from-blue-500 to-blue-700", node: "from-blue-400 to-blue-600" },
  ว: { label: "วิทยาศาสตร์", card: "from-emerald-500 to-teal-700", node: "from-emerald-500 to-teal-600" },
  ส: { label: "สังคมศึกษา", card: "from-amber-600 to-amber-800", node: "from-amber-500 to-amber-700" },
  พ: { label: "สุขศึกษาและพลศึกษา", card: "from-lime-600 to-green-800", node: "from-lime-600 to-green-700" },
  ศ: { label: "ศิลปะ", card: "from-purple-500 to-purple-700", node: "from-purple-400 to-purple-600" },
  ง: { label: "การงานอาชีพ", card: "from-orange-600 to-orange-800", node: "from-orange-500 to-orange-700" },
  อ: { label: "ภาษาต่างประเทศ", card: "from-violet-500 to-fuchsia-700", node: "from-violet-500 to-fuchsia-600" },
  ก: { label: "กิจกรรมพัฒนาผู้เรียน", card: "from-slate-500 to-slate-700", node: "from-slate-500 to-slate-700" },
};
const OTHER: AreaStyle = { label: "อื่นๆ", card: "from-zinc-500 to-zinc-700", node: "from-zinc-500 to-zinc-700" };
const EMPTY_CARD = "from-zinc-400 to-zinc-500 grayscale";
const areaOf = (code: string) => AREA[code.trim().charAt(0)] ?? OTHER;
/** Horizontal offsets (% of container width) for the winding path. */
const OFFSETS = [0, 22, 30, 22, 0, -22, -30, -22];
const ROW_H = 152;
const chip = "inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[13px] font-medium text-foreground";
const coverChip = "inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-[13px] font-medium text-white";
const blueChip = "inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-[13px] font-semibold text-accent-foreground";
const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const topicCount = (lessons: { topics: unknown[] }[]) => lessons.reduce((n, l) => n + l.topics.length, 0);
const teachersOf = (t: string[]) => [...new Set(t)].join(", ");

/** Full-bleed page: cancels the shell's content padding (px-4 pb-4, lg:p-6) and follows the system theme. */
function Zone({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 -mb-4 min-h-full flex-1 overflow-x-hidden bg-background px-4 py-4 text-foreground lg:-m-6 lg:min-h-[calc(100%+3rem)] lg:p-6">{children}</div>;
}

/** Original decorative cover: area gradient + blurred orbs + diagonal stripes + a huge faint prefix letter. */
function Cover({ s, className }: { s: OverviewSubject; className?: string }) {
  const empty = s.lessons.length === 0;
  return (
    <div aria-hidden className={cn("absolute inset-0 overflow-hidden bg-gradient-to-br text-white", empty ? EMPTY_CARD : areaOf(s.code).card, className)}>
      <div className="absolute -right-10 -top-10 h-2/3 w-2/3 rounded-full bg-white/25 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 h-1/2 w-1/2 rounded-full bg-black/30 blur-2xl" />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 22px)" }} />
      <span className="absolute -bottom-[12%] -right-[2%] select-none text-[11rem] font-black leading-none text-white/10">{s.code.trim().charAt(0)}</span>
      {s.coverUrl && <img src={s.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />}
      <BookIcon className="absolute right-[8%] top-[10%] h-6 w-6 !text-white/40" />
    </div>
  );
}

function Hero({ items, labels, onOpen, reduce }: { items: OverviewSubject[]; labels: Map<string, string>; onOpen: (id: string) => void; reduce: boolean | null }) {
  const [raw, setIdx] = useState(0);
  const n = items.length;
  const idx = Math.min(raw, n - 1);
  const go = (i: number) => setIdx(((i % n) + n) % n);
  const arrow = cn("flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-30", ring);
  return (
    <section aria-label="วิชาแนะนำ" className="relative">
      <div className="-mx-4 overflow-hidden py-2 lg:-mx-6">
        <motion.div
          className="relative mx-auto w-full"
          style={{ perspective: 1200 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, i) => {
            if (i.offset.x < -60) go(idx + 1);
            else if (i.offset.x > 60) go(idx - 1);
          }}
        >
          <div aria-hidden className="invisible mx-auto aspect-[3/4] w-[76%] sm:aspect-video sm:w-[56%] lg:w-[72%] lg:max-w-[820px]" />
          {items.map((s, i) => {
            let d = (((i - idx) % n) + n) % n;
            if (d > n / 2) d -= n;
            if (Math.abs(d) > 2) return null;
            const a = Math.abs(d);
            const sign = d < 0 ? -1 : 1;
            return (
              <motion.div
                key={s.id}
                className={cn("absolute inset-y-0 left-0 right-0 mx-auto aspect-[3/4] w-[76%] overflow-hidden rounded-3xl shadow-2xl shadow-black/40 sm:aspect-video sm:w-[56%] lg:w-[72%] lg:max-w-[820px]", a === 2 && "hidden sm:block")}
                initial={false}
                animate={{
                  x: `${d * (a === 1 ? 60 : 46)}%`,
                  scale: a === 0 ? 1 : a === 1 ? 0.8 : 0.65,
                  rotateY: reduce ? 0 : -sign * (a === 0 ? 0 : a === 1 ? 28 : 34),
                  opacity: a === 0 ? 1 : a === 1 ? 0.6 : 0.35,
                  zIndex: 10 - a,
                }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28 }}
              >
                <Cover s={s} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-white/80">{labels.get(s.id)}</div>
                  <h2 className="mt-1 line-clamp-2 text-[28px] font-bold leading-tight sm:text-[40px]">{s.name}</h2>
                  <p className="mt-1 text-[14px] text-white/80">
                    {s.lessons.length === 0 ? "ยังไม่มีด่าน" : `${s.lessons.length} ด่าน`} · {topicCount(s.lessons)} หัวข้อ{s.teachers.length > 0 && ` · ${teachersOf(s.teachers)}`}
                  </p>
                  {d === 0 && (
                    <div className="mt-4 flex items-center gap-3">
                      <button type="button" onClick={() => onOpen(s.id)} className={cn("h-11 rounded-full bg-white px-6 text-[15px] font-bold text-neutral-900 transition-transform active:scale-95", ring)}>
                        เริ่มเลย
                      </button>
                      <button type="button" aria-label={`เปิดผังการเรียน ${s.name}`} onClick={() => onOpen(s.id)} className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30", ring)}>
                        <ChevronForward className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>
                {d !== 0 && <button type="button" aria-label={`ดูวิชา ${s.name}`} onClick={() => go(i)} className={cn("absolute inset-0 z-20 rounded-3xl", ring)} />}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button type="button" aria-label="วิชาก่อนหน้า" disabled={n <= 1} onClick={() => go(idx - 1)} className={arrow}>
          <ChevronBack className="h-5 w-5" />
        </button>
        {items.length <= 12 && (
          <div className="flex items-center gap-2">
            {items.map((s, i) => (
              <button key={s.id} type="button" aria-label={`วิชาที่ ${i + 1}`} aria-current={i === idx} onClick={() => go(i)} className={cn("h-2 rounded-full transition-all", i === idx ? "w-6 bg-accent" : "w-2 bg-foreground/20", ring)} />
            ))}
          </div>
        )}
        <button type="button" aria-label="วิชาถัดไป" disabled={n <= 1} onClick={() => go(idx + 1)} className={arrow}>
          <ChevronForward className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}

function AreaRow({ label, items, onOpen, reduce }: { label: string; items: OverviewSubject[]; onOpen: (id: string) => void; reduce: boolean | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  const btn = cn("flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-secondary", ring);
  return (
    <section aria-label={label}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-[20px] font-semibold">{label}</h2>
        <span className="text-[13px] text-muted-foreground">{items.length} วิชา</span>
        <button type="button" aria-label={`เลื่อนซ้าย ${label}`} onClick={() => scroll(-1)} className={btn}>
          <ChevronBack className="h-4 w-4" />
        </button>
        <button type="button" aria-label={`เลื่อนขวา ${label}`} onClick={() => scroll(1)} className={btn}>
          <ChevronForward className="h-4 w-4" />
        </button>
      </div>
      <div ref={ref} className="scrollbar-hidden -mx-4 flex snap-x items-start snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:-mx-6 lg:scroll-px-6 lg:px-6">
        {items.map((s) => (
          <button key={s.id} type="button" onClick={() => onOpen(s.id)} className={cn("group w-[200px] shrink-0 snap-start rounded-2xl text-left sm:w-[240px]", ring)}>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl transition-transform group-active:scale-[0.98]">
              <Cover s={s} />
            </div>
            <span className="mt-2.5 inline-block rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted-foreground">{s.code}</span>
            <div className="mt-1 line-clamp-2 text-[17px] font-semibold leading-snug">{s.name}</div>
            <div className="mt-2 flex items-center gap-2">
              {s.lessons.length === 0 ? <span className={chip}>ยังไม่มีด่าน</span> : <span className={blueChip}>{s.lessons.length} ด่าน</span>}
              <span className="text-[13px] text-muted-foreground">{topicCount(s.lessons)} หัวข้อ</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}


/** นักเรียน: ผังการเรียนของวิชาในห้องตัวเอง (เทอมล่าสุด) — read-only, same data as the dept overview (migration 0133). */
export function MyCurriculum() {
  const { myStudent } = useAuth();
  const toast = useToast();
  const reduce = useReducedMotion();
  const { data: areas = [] } = useLearningAreas();
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const [levelId, setLevelId] = useState("");
  const [query, setQuery] = useState("");
  const deptId = myStudent?.department_id ?? null;
  const { data: classroom, isLoading: roomLoading } = useMyCurrentClassroom(myStudent?.id ?? null);
  const { data: term, isLoading: termLoading } = useCurrentTerm(deptId);
  const { data: departments = [] } = useDepartments();
  // teaching_assignments.term is only set for SEC (migration 0017).
  const isSec = departments.find((d) => d.id === deptId)?.code === "SEC";
  const { data: rooms = [], isLoading, isError, refetch } = useDeptClassroomOverview(
    deptId,
    classroom?.academicYear ?? null,
    isSec ? (term?.term ?? null) : null,
    classroom?.classroomId,
  );
  const [subjectId, setSubjectId] = useState("");
  const subjects = rooms[0]?.subjects ?? [];
  const open = subjects.find((s) => s.id === subjectId);
  const level = open?.lessons.findIndex((l) => l.id === levelId) ?? -1;
  const lesson = open && level >= 0 ? open.lessons[level] : null;

  if (roomLoading || termLoading || isLoading)
    return (
      <Zone>
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-11 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-64 w-full rounded-3xl bg-muted" />
          <Skeleton className="h-32 w-full rounded-2xl bg-muted" />
        </div>
      </Zone>
    );
  if (isError)
    return (
      <Zone>
        <div role="alert" className="flex items-center justify-between gap-2">
          <p className="text-[15px] text-foreground">โหลดข้อมูลไม่สำเร็จ</p>
          <button type="button" onClick={() => void refetch()} className={cn("h-11 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-foreground", ring)}>
            ลองใหม่
          </button>
        </div>
      </Zone>
    );
  if (subjects.length === 0)
    return (
      <Zone>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
          <BookIcon className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-[20px] font-semibold">ยังไม่มีรายวิชา</h2>
          <p className="text-[15px] text-muted-foreground">ยังไม่มีรายวิชาในห้องเรียนของคุณสำหรับเทอมนี้</p>
        </div>
      </Zone>
    );

  const labelOf = (s: OverviewSubject) => (s.areaId && areaName.get(s.areaId)) || areaOf(s.code).label;

  if (open) {
    const st = areaOf(open.code);
    const n = open.lessons.length;
    const lessonFiles = lesson ? lesson.files.flatMap((f) => (f.file ? [f.file] : [])) : [];
    return (
      <Zone>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSubjectId("")}
          className="-ml-1 inline-flex h-11 items-center gap-1 rounded-lg px-1 text-[17px] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronBack className="h-4 w-4" /> รายวิชาทั้งหมด
        </button>
        <div className="relative min-h-[200px] overflow-hidden rounded-3xl sm:min-h-[240px]">
          <Cover s={open} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <div className="relative flex min-h-[200px] flex-col justify-end p-5 text-white sm:min-h-[240px] sm:p-7">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/80">{labelOf(open)} · <span className="font-mono">{open.code}</span></div>
            <h2 className="mt-1 text-[28px] font-bold leading-tight sm:text-[36px]">{open.name}</h2>
            {open.teachers.length > 0 && <div className="mt-1 text-[14px] text-white/80">{teachersOf(open.teachers)}</div>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className={n === 0 ? coverChip : blueChip}>{n === 0 ? "ยังไม่มีด่าน" : `${n} ด่าน`}</span>
              <span className={coverChip}>{topicCount(open.lessons)} หัวข้อ</span>
            </div>
          </div>
        </div>
        {n === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <BookIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-[15px] text-muted-foreground">ยังไม่มีบทเรียนในผังการเรียน</p>
          </div>
        ) : (
          <ol className="mx-auto max-w-md pb-6">
            {open.lessons.map((l, i) => {
              const off = OFFSETS[i % OFFSETS.length] ?? 0;
              const next = OFFSETS[(i + 1) % OFFSETS.length] ?? 0;
              const fc = l.files.filter((f) => f.file).length;
              return (
                <motion.li
                  key={l.id}
                  className="relative"
                  style={{ height: ROW_H }}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.25 }}
                >
                  <svg aria-hidden className="absolute left-0 z-0 w-full text-foreground/25" style={{ top: 36, height: ROW_H }} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d={`M ${50 + off} 0 C ${50 + off} 50, ${50 + next} 50, ${50 + next} 100`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 8" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="absolute top-0 z-10 flex w-40 -translate-x-1/2 flex-col items-center" style={{ left: `${50 + off}%` }}>
                    <button
                      type="button"
                      aria-label={`ด่าน ${i + 1}: ${l.name}`}
                      onClick={() => setLevelId(l.id)}
                      className={cn(
                        "flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-b text-[28px] font-bold tabular-nums text-white shadow-lg shadow-black/25 ring-4 ring-inset ring-white/30 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95",
                        !reduce && "hover:scale-105",
                        st.node,
                      )}
                    >
                      {i + 1}
                    </button>
                    <div className="relative z-10 mt-1 w-full rounded-lg bg-background px-2 py-1">
                      <div className="line-clamp-2 text-center text-[15px] font-semibold leading-snug">{l.name}</div>
                      <div className="text-center text-[12px] text-muted-foreground">
                        {l.topics.length} หัวข้อ · {fc} ไฟล์
                      </div>
                    </div>
                  </div>
                </motion.li>
              );
            })}
            <li className="relative" style={{ height: 120 }}>
              <div className="absolute top-0 z-10 flex w-40 -translate-x-1/2 flex-col items-center" style={{ left: `${50 + (OFFSETS[n % OFFSETS.length] ?? 0)}%` }}>
                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-lg shadow-black/25 ring-4 ring-inset ring-white/40">
                  {n % 2 === 0 ? <RibbonIcon className="h-9 w-9" /> : <CheckmarkCircleIcon className="h-9 w-9" />}
                </div>
                <div className="mt-1 rounded-lg bg-background px-2 py-1 text-[15px] font-semibold">จบวิชา</div>
              </div>
            </li>
          </ol>
        )}
        <Sheet open={!!lesson} onOpenChange={(o) => !o && setLevelId("")} closable title={lesson ? `ด่าน ${level + 1} · ${lesson.name}` : ""}>
          {lesson && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase text-muted-foreground">หัวข้อ</h3>
                {lesson.topics.length === 0 ? (
                  <p className="px-1 text-[15px] text-muted-foreground">ยังไม่มีหัวข้อ</p>
                ) : (
                  <ol className="divide-y divide-border overflow-hidden rounded-[14px] bg-card">
                    {lesson.topics.map((t, ti) => (
                      <li key={t.id} className="flex items-baseline gap-3 px-4 py-3 text-[15px]">
                        <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{ti + 1}</span>
                        <span className="min-w-0">{t.name}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <section>
                <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase text-muted-foreground">ไฟล์</h3>
                {lessonFiles.length === 0 ? (
                  <p className="px-1 text-[15px] text-muted-foreground">ยังไม่มีไฟล์</p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-[14px] bg-card">
                    {lessonFiles.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                        <DocumentTextIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[15px]" title={f.file_name}>
                          {f.title || f.file_name}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!(await openDocFile(f.file_path))) toast("เปิดเอกสารไม่สำเร็จ", "error");
                          }}
                        >
                          เปิด
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`ดาวน์โหลด ${f.file_name}`}
                          onClick={async () => {
                            if (!(await downloadDocFile(f.file_path, f.file_name))) toast("ดาวน์โหลดไม่สำเร็จ", "error");
                          }}
                        >
                          <DownloadIcon className="h-4 w-4" /> ดาวน์โหลด
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </Sheet>
      </div>
      </Zone>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = subjects
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
    .sort((a, b) => Number(a.lessons.length === 0) - Number(b.lessons.length === 0) || a.name.localeCompare(b.name, "th"));
  const labels = new Map(shown.map((s) => [s.id, labelOf(s)]));
  const groups = new Map<string, { label: string; items: OverviewSubject[] }>();
  for (const s of shown) {
    const key = s.areaId ?? `p:${s.code.trim().charAt(0)}`;
    const g = groups.get(key) ?? { label: labelOf(s), items: [] };
    g.items.push(s);
    groups.set(key, g);
  }

  return (
    <Zone>
      <div className="space-y-7">
        <div className="flex items-center gap-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">ค้นหาวิชา</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาวิชา"
              className={cn("h-11 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-[16px] text-foreground placeholder:text-muted-foreground", ring)}
            />
          </label>
          <span className={cn(chip, "h-8 shrink-0")}>{shown.length} วิชา</span>
        </div>
        {shown.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-muted-foreground">ไม่พบวิชาที่ค้นหา</p>
        ) : (
          <>
            <Hero key={q} items={shown} labels={labels} onOpen={setSubjectId} reduce={reduce} />
            {[...groups.entries()].map(([key, g]) => (
              <AreaRow key={key} label={g.label} items={g.items} onOpen={setSubjectId} reduce={reduce} />
            ))}
          </>
        )}
      </div>
    </Zone>
  );
}
