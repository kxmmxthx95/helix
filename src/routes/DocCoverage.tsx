import { Fragment, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import {
  AlertTriangle,
  AppsIcon,
  BarChartIcon,
  BookIcon,
  CheckmarkCircleIcon,
  ChevronBack,
  ChevronForward,
  DownloadIcon,
  HelpCircleIcon,
  ListIcon,
  MoreIcon,
  Search,
  TimeIcon,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { useAllGradeLevels, useDocCoverage, useSaveDocTargets, type CoverageRow } from "@/hooks/useDocuments";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { profileFullName, type SubjectType } from "@/lib/database.types";
import { coverageCsv, coverageStats, type CoverageStatus } from "@/lib/docCoverage";
import { cn } from "@/lib/utils";

type Filter = "" | CoverageStatus;
type Tone = "accent" | "success" | "warning" | "destructive";

const STATUS: Record<CoverageStatus, { label: string; cls: string; bar: string }> = {
  empty: { label: "ยังไม่บันทึก", cls: "bg-destructive/15 text-destructive", bar: "bg-destructive" },
  partial: { label: "ไม่ครบ", cls: "bg-warning/15 text-warning", bar: "bg-warning" },
  complete: { label: "ครบถ้วน", cls: "bg-success/15 text-success", bar: "bg-success" },
};
const STATUS_LABELS = { empty: STATUS.empty.label, partial: STATUS.partial.label, complete: STATUS.complete.label };

const SUBJECT_TYPES: { value: SubjectType; label: string }[] = [
  { value: "basic", label: "พื้นฐาน" },
  { value: "additional", label: "เพิ่มเติม" },
  { value: "activity", label: "กิจกรรม" },
];

const PAGE_SIZES = [10, 20, 50];
/** Select value for "ทั้งหมด" — distinct from "" (nothing picked yet) so the select shows the word instead of its placeholder. */
const ALL = "all";

const thDate = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

const TONE: Record<Tone, { bg: string; fg: string; bar: string; ring: string }> = {
  accent: { bg: "bg-accent/10", fg: "text-accent", bar: "bg-accent", ring: "ring-accent" },
  success: { bg: "bg-success/10", fg: "text-success", bar: "bg-success", ring: "ring-success" },
  warning: { bg: "bg-warning/10", fg: "text-warning", bar: "bg-warning", ring: "ring-warning" },
  destructive: { bg: "bg-destructive/10", fg: "text-destructive", bar: "bg-destructive", ring: "ring-destructive" },
};

function StatCard({ tone, icon, label, value, percent, active, onClick }: { tone: Tone; icon: React.ReactNode; label: string; value: number; percent?: number; active: boolean; onClick: () => void }) {
  const t = TONE[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("flex items-center gap-3 rounded-2xl p-3 text-left ring-2 transition-shadow", t.bg, active ? t.ring : "ring-transparent hover:ring-border")}
    >
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background/80", t.fg)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p>
          <span className="font-heading text-2xl font-semibold">{value.toLocaleString("th-TH")}</span>{" "}
          <span className="text-xs text-muted-foreground">รายวิชา</span>
        </p>
        {percent !== undefined && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/80">
              <div className={cn("h-full", t.bar)} style={{ width: `${percent}%` }} />
            </div>
            <span className="w-10 text-right text-[11px] text-muted-foreground">{percent}%</span>
          </div>
        )}
      </div>
    </button>
  );
}

function StatusChip({ status }: { status: CoverageStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium", s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function ProgressBar({ status, percent }: { status: CoverageStatus; percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", STATUS[status].bar)} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-9 text-right text-[11px] text-muted-foreground">{percent}%</span>
    </div>
  );
}

const ofTarget = (n: number, target: number) => `${n} / ${target || "—"}`;

/** ติดตามเนื้อหา — per วิชา × ระดับชั้น: เนื้อหาหลัก / เนื้อหาย่อย recorded against the targets, files, and who recorded last. */
export function DocCoverageTab() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data: rows = [], isLoading, isError } = useDocCoverage();
  const { data: areas = [] } = useLearningAreas();
  const { data: grades = [] } = useAllGradeLevels();
  const { data: departments = [] } = useDepartments();
  const { data: people = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "" });
  const nameById = new Map(people.map((p) => [p.id, profileFullName(p)]));
  const nameOf = (id: string | null) => (id && nameById.get(id)) || "—";

  const [gradeId, setGradeId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null); // expanded row
  const [menu, setMenu] = useState<string | null>(null); // ⋯ menu row
  const [targetFor, setTargetFor] = useState<CoverageRow[] | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const q = search.trim().toLowerCase();
  // super_admin / director pick a department (none picked = all); everyone else is pinned to their own, and an account with no department sees all.
  const canPickDept = me!.roles.some((r) => r === "super_admin" || r === "director");
  const [deptPick, setDeptPick] = useState("");
  const deptId = canPickDept ? (deptPick === ALL ? "" : deptPick) : (me!.department_id ?? "");
  const scoped = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!deptId || r.departmentId === deptId) &&
          (!gradeId || gradeId === ALL || r.gradeLevelId === gradeId) &&
          (!areaId || areaId === ALL || r.learningAreaId === areaId) &&
          (!type || type === ALL || r.subjectType === type) &&
          (!q || `${r.code} ${r.nameTh}`.toLowerCase().includes(q)),
      ),
    [rows, deptId, gradeId, areaId, type, q],
  );
  const stats = useMemo(() => new Map(scoped.map((r) => [r.key, coverageStats(r)])), [scoped]);
  const counts = { empty: 0, partial: 0, complete: 0 };
  for (const s of stats.values()) counts[s.status]++;
  const pct = (n: number) => (scoped.length ? Math.round((n / scoped.length) * 1000) / 10 : 0);

  const shown = scoped
    .filter((r) => !filter || stats.get(r.key)!.status === filter)
    .sort((a, b) => a.code.localeCompare(b.code, "th") || a.gradeSort - b.gradeSort);
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const cur = Math.min(page, pageCount);
  const pageRows = shown.slice((cur - 1) * pageSize, cur * pageSize);
  const from = shown.length ? (cur - 1) * pageSize + 1 : 0;
  const to = Math.min(cur * pageSize, shown.length);

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const pageKeys = pageRows.map((r) => r.key);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const toggle = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) on ? next.add(k) : next.delete(k);
      return next;
    });
  const selectedRows = shown.filter((r) => selected.has(r.key));

  function exportCsv() {
    const out = selectedRows.length ? selectedRows : shown;
    const blob = new Blob([coverageCsv(out, nameOf, STATUS_LABELS)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `doc-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`ส่งออก ${out.length} รายการแล้ว`);
  }

  if (isLoading) return <Spinner />;
  if (isError) return <EmptyState title="โหลดข้อมูลไม่สำเร็จ" description="ลองรีเฟรชหน้านี้อีกครั้ง" icon={AlertTriangle} />;

  const rowMenu = (r: CoverageRow) => (
    <div className="relative inline-block text-left">
      <Button size="icon" variant="outline" aria-label="จัดการ" aria-haspopup="menu" aria-expanded={menu === r.key} onClick={() => setMenu(menu === r.key ? null : r.key)}>
        <MoreIcon className="h-3.5 w-3.5" />
      </Button>
      {menu === r.key && (
        <>
          <button type="button" aria-label="ปิดเมนู" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 text-xs shadow-lg">
            <button
              type="button"
              role="menuitem"
              disabled={r.lessons.length === 0}
              className="block w-full px-3 py-2 text-left hover:bg-muted disabled:opacity-40"
              onClick={() => { setOpen(open === r.key ? null : r.key); setMenu(null); }}
            >
              {open === r.key ? "ซ่อนเนื้อหาหลัก" : "ดูเนื้อหาหลัก"}
            </button>
            <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setTargetFor([r]); setMenu(null); }}>
              ตั้งเป้าหมาย
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={search} onChange={(e) => set(setSearch)(e.target.value)} placeholder="ค้นหารหัสวิชา ชื่อวิชา หรือคำสำคัญ..." aria-label="ค้นหา" />
        </div>
        <div className={cn("grid min-w-0 flex-[2] grid-cols-2 gap-3", canPickDept ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          {canPickDept && (
            <Select aria-label="แผนก" placeholder="เลือกแผนก" value={deptPick} onChange={(e) => { set(setDeptPick)(e.target.value); setGradeId(""); }}>
              <option value={ALL}>ทั้งหมด</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          )}
          <Select aria-label="ระดับชั้น" placeholder="เลือกระดับชั้น" value={gradeId} onChange={(e) => set(setGradeId)(e.target.value)}>
            <option value={ALL}>ทั้งหมด</option>
            {grades.filter((g) => !deptId || g.department_id === deptId).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
          <Select aria-label="กลุ่มสาระ" placeholder="เลือกกลุ่มสาระ" value={areaId} onChange={(e) => set(setAreaId)(e.target.value)}>
            <option value={ALL}>ทั้งหมด</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Select aria-label="ประเภทวิชา" placeholder="เลือกประเภทวิชา" value={type} onChange={(e) => set(setType)(e.target.value)}>
            <option value={ALL}>ทั้งหมด</option>
            {SUBJECT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="สรุปตามระดับชั้น" onClick={() => setSummaryOpen(true)}>
            <BarChartIcon className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" aria-label="ส่งออกข้อมูล" disabled={shown.length === 0} onClick={exportCsv}>
            <DownloadIcon className="h-3.5 w-3.5" />
          </Button>
          <div className="flex h-8 rounded-lg border border-border bg-card p-0.5">
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn("flex h-full w-8 items-center justify-center rounded-md", view === v ? "bg-foreground text-background" : "text-muted-foreground")}
              >
                {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard tone="accent" icon={<BookIcon className="h-6 w-6" />} label="ทั้งหมด" value={scoped.length} active={filter === ""} onClick={() => set(setFilter)("")} />
        <StatCard tone="success" icon={<CheckmarkCircleIcon className="h-6 w-6" />} label="ครบถ้วน" value={counts.complete} percent={pct(counts.complete)} active={filter === "complete"} onClick={() => set(setFilter)("complete")} />
        <StatCard tone="warning" icon={<TimeIcon className="h-6 w-6" />} label="ยังไม่ครบ" value={counts.partial} percent={pct(counts.partial)} active={filter === "partial"} onClick={() => set(setFilter)("partial")} />
        <StatCard tone="destructive" icon={<AlertTriangle className="h-6 w-6" />} label="ยังไม่บันทึก" value={counts.empty} percent={pct(counts.empty)} active={filter === "empty"} onClick={() => set(setFilter)("empty")} />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs">
          <span>เลือก {selected.size} รายการ</span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setTargetFor(selectedRows)}>ตั้งเป้าหมาย</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>ล้างที่เลือก</Button>
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState title="ไม่พบรายการ" description="วิชาที่อยู่ในหลักสูตรจะแสดงที่นี่" icon={BookIcon} />
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[64rem] text-xs">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" aria-label="เลือกทั้งหน้า" checked={allOnPage} onChange={(e) => toggle(pageKeys, e.target.checked)} />
                </th>
                <th className="px-3 py-2.5 font-medium">วิชา</th>
                <th className="px-3 py-2.5 font-medium">ระดับชั้น</th>
                <th className="px-3 py-2.5 font-medium">
                  <span className="inline-flex items-center gap-1" title="จำนวนที่บันทึกแล้ว / เป้าหมาย (ตั้งเป้าหมายได้จากเมนูจัดการ)">
                    เนื้อหาหลัก <HelpCircleIcon className="h-3.5 w-3.5" />
                  </span>
                </th>
                <th className="px-3 py-2.5 font-medium">เนื้อหาย่อย</th>
                <th className="px-3 py-2.5 text-right font-medium">ไฟล์</th>
                <th className="px-3 py-2.5 font-medium">อัปโหลดล่าสุด</th>
                <th className="px-3 py-2.5 font-medium">ผู้บันทึกล่าสุด</th>
                <th className="px-3 py-2.5 font-medium">ความคืบหน้า</th>
                <th className="px-3 py-2.5 font-medium">สถานะ</th>
                <th className="px-3 py-2.5 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((r) => {
                const s = stats.get(r.key)!;
                const isOpen = open === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr className={cn("hover:bg-muted/40", selected.has(r.key) && "bg-accent/5")}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" aria-label={`เลือก ${r.code}`} checked={selected.has(r.key)} onChange={(e) => toggle([r.key], e.target.checked)} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-sm font-medium">{r.code}</div>
                        <div className="text-[11px] text-muted-foreground">{r.nameTh}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{r.gradeName}</td>
                      <td className="px-3 py-2.5">{ofTarget(s.lessons, r.lessonTarget)}</td>
                      <td className="px-3 py-2.5">{ofTarget(s.topics, r.topicTarget)}</td>
                      <td className="px-3 py-2.5 text-right">{s.files}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{s.last ? thDate(s.last.lastAt) : "—"}</td>
                      <td className="px-3 py-2.5">{nameOf(s.last?.lastBy ?? null)}</td>
                      <td className="px-3 py-2.5"><ProgressBar status={s.status} percent={s.progress} /></td>
                      <td className="px-3 py-2.5"><StatusChip status={s.status} /></td>
                      <td className="px-3 py-2.5 text-right">{rowMenu(r)}</td>
                    </tr>
                    {isOpen &&
                      [...r.lessons]
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((l) => (
                          <tr key={l.id} className="bg-muted/20">
                            <td />
                            <td className="py-2 pl-6 pr-3" colSpan={2}>
                              {l.name}
                              <span className="block text-[11px] text-muted-foreground">ผู้สร้าง: {nameOf(l.createdBy)}</span>
                            </td>
                            <td />
                            <td className="px-3 py-2">{l.topicCount}</td>
                            <td className={cn("px-3 py-2 text-right", l.fileCount === 0 && "text-destructive")}>{l.fileCount}</td>
                            <td className="whitespace-nowrap px-3 py-2">{thDate(l.lastAt)}</td>
                            <td className="px-3 py-2">{nameOf(l.lastBy)}</td>
                            <td />
                            <td className="px-3 py-2 text-[11px] text-destructive">{l.fileCount === 0 ? "ยังไม่มีไฟล์" : ""}</td>
                            <td />
                          </tr>
                        ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((r) => {
            const s = stats.get(r.key)!;
            return (
              <div key={r.key} className={cn("space-y-3 rounded-xl border border-border bg-card p-3", selected.has(r.key) && "border-accent")}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" aria-label={`เลือก ${r.code}`} checked={selected.has(r.key)} onChange={(e) => toggle([r.key], e.target.checked)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.code} · {r.gradeName}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{r.nameTh}</div>
                  </div>
                  {rowMenu(r)}
                </div>
                <ProgressBar status={s.status} percent={s.progress} />
                <dl className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
                  <div><dt>เนื้อหาหลัก</dt><dd className="text-sm font-medium text-foreground">{ofTarget(s.lessons, r.lessonTarget)}</dd></div>
                  <div><dt>เนื้อหาย่อย</dt><dd className="text-sm font-medium text-foreground">{ofTarget(s.topics, r.topicTarget)}</dd></div>
                  <div><dt>ไฟล์</dt><dd className="text-sm font-medium text-foreground">{s.files}</dd></div>
                </dl>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{s.last ? `${thDate(s.last.lastAt)} · ${nameOf(s.last.lastBy)}` : "ยังไม่มีการบันทึก"}</span>
                  <StatusChip status={s.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>แสดง {from} - {to} จาก {shown.length.toLocaleString("th-TH")} รายการ</span>
        <div className="flex items-center gap-4">
          <Pager page={cur} pageCount={pageCount} onChange={setPage} />
          <label className="flex items-center gap-2">
            จำนวนต่อหน้า
            <Select className="w-auto min-w-16" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <TargetSheet rows={targetFor} onClose={() => setTargetFor(null)} onSaved={() => setSelected(new Set())} />
      <GradeSummarySheet open={summaryOpen} onClose={() => setSummaryOpen(false)} rows={scoped} />
    </div>
  );
}

/** 1 2 3 … N with the current page's neighbours — collapses the middle on long lists. */
function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  const pages = [...new Set([1, 2, page - 1, page, page + 1, pageCount - 1, pageCount])].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-lg border border-border px-2 text-xs disabled:pointer-events-none disabled:opacity-40";
  return (
    <nav aria-label="หน้า" className="flex items-center gap-1">
      <button type="button" aria-label="ก่อนหน้า" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronBack className="h-3.5 w-3.5" />
      </button>
      {pages.map((p, i) => (
        <Fragment key={p}>
          {i > 0 && p - pages[i - 1]! > 1 && <span className="px-1">...</span>}
          <button type="button" aria-current={p === page ? "page" : undefined} className={cn(btn, p === page ? "border-foreground bg-foreground text-background" : "hover:bg-muted")} onClick={() => onChange(p)}>
            {p}
          </button>
        </Fragment>
      ))}
      <button type="button" aria-label="ถัดไป" className={btn} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        <ChevronForward className="h-3.5 w-3.5" />
      </button>
    </nav>
  );
}

/** Sets the เนื้อหาหลัก / เนื้อหาย่อย targets for one or many (subject x grade) rows. Blank keeps nothing — 0 clears the target. */
function TargetSheet({ rows, onClose, onSaved }: { rows: CoverageRow[] | null; onClose: () => void; onSaved: () => void }) {
  const save = useSaveDocTargets();
  const toast = useToast();
  const [lesson, setLesson] = useState("");
  const [topic, setTopic] = useState("");
  const [seed, setSeed] = useState<CoverageRow[] | null>(null);
  // Re-seed the fields from the row when a single one is opened (render-time reset, no effect needed).
  if (rows !== seed) {
    setSeed(rows);
    setLesson(rows?.length === 1 ? String(rows[0]!.lessonTarget) : "");
    setTopic(rows?.length === 1 ? String(rows[0]!.topicTarget) : "");
  }
  const valid = (v: string) => /^\d+$/.test(v) && Number(v) <= 999;
  const ok = valid(lesson) && valid(topic);

  return (
    <Sheet
      open={rows !== null}
      onOpenChange={(o) => !o && onClose()}
      title="ตั้งเป้าหมายเนื้อหา"
      description={rows?.length === 1 ? `${rows[0]!.code} ${rows[0]!.nameTh} · ${rows[0]!.gradeName}` : `${rows?.length ?? 0} รายวิชาที่เลือก`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button
            disabled={!ok || save.isPending}
            onClick={() =>
              save.mutate(
                { pairs: rows!.map((r) => ({ subjectId: r.subjectId, gradeLevelId: r.gradeLevelId })), lessonTarget: Number(lesson), topicTarget: Number(topic) },
                {
                  onSuccess: () => { toast("บันทึกเป้าหมายแล้ว"); onSaved(); onClose(); },
                  onError: () => toast("บันทึกไม่สำเร็จ", "error"),
                },
              )
            }
          >
            บันทึก
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="เป้าหมายเนื้อหาหลัก (รายการ)">
          <Input inputMode="numeric" value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="เช่น 12" />
        </Field>
        <Field label="เป้าหมายเนื้อหาย่อย (รายการ)">
          <Input inputMode="numeric" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="เช่น 36" />
        </Field>
        <p className="text-[11px] text-muted-foreground">ใส่ 0 เพื่อไม่กำหนดเป้าหมาย — ความคืบหน้าจะคิดจากสัดส่วนเนื้อหาหลักที่มีไฟล์แทน</p>
      </div>
    </Sheet>
  );
}

/** สรุปตามระดับชั้น — roll-up of the currently filtered rows per grade level. */
function GradeSummarySheet({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: CoverageRow[] }) {
  const byGrade = useMemo(() => {
    const m = new Map<string, { name: string; sort: number; subjects: number; complete: number; partial: number; empty: number; lessons: number; files: number; progress: number }>();
    for (const r of rows) {
      const s = coverageStats(r);
      const e = m.get(r.gradeLevelId) ?? { name: r.gradeName, sort: r.gradeSort, subjects: 0, complete: 0, partial: 0, empty: 0, lessons: 0, files: 0, progress: 0 };
      e.subjects++;
      e[s.status]++;
      e.lessons += s.lessons;
      e.files += s.files;
      e.progress += s.progress;
      m.set(r.gradeLevelId, e);
    }
    return [...m.values()].sort((a, b) => a.sort - b.sort);
  }, [rows]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="สรุปตามระดับชั้น" description="ตามตัวกรองที่เลือกอยู่">
      {byGrade.length === 0 ? (
        <p className="text-xs text-muted-foreground">ไม่มีข้อมูล</p>
      ) : (
        <ul className="space-y-3">
          {byGrade.map((g) => {
            const avg = Math.round(g.progress / g.subjects);
            return (
              <li key={g.name} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{g.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{g.subjects} รายวิชา</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-success" style={{ width: `${(g.complete / g.subjects) * 100}%` }} />
                  <div className="bg-warning" style={{ width: `${(g.partial / g.subjects) * 100}%` }} />
                  <div className="bg-destructive" style={{ width: `${(g.empty / g.subjects) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>ครบถ้วน {g.complete}</span>
                  <span>ไม่ครบ {g.partial}</span>
                  <span>ยังไม่บันทึก {g.empty}</span>
                  <span>เนื้อหาหลัก {g.lessons}</span>
                  <span>ไฟล์ {g.files}</span>
                  <span>ความคืบหน้าเฉลี่ย {avg}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
