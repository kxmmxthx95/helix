import { Fragment, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BookIcon, ChevronForward, Search } from "@/components/icons";
import { EmptyState, Input, Pagination, Select, Spinner } from "@/components/ui";
import { useDocCoverage, type CoverageRow } from "@/hooks/useDocuments";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import { usePagination } from "@/hooks/usePagination";
import { profileFullName } from "@/lib/database.types";
import { isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

type Filter = "" | "empty" | "partial" | "complete";

/** empty = no เนื้อหาหลัก yet; partial = some เนื้อหาหลัก has no file; complete = every one has a file. */
const statusOf = (r: CoverageRow): Exclude<Filter, ""> =>
  r.lessons.length === 0 ? "empty" : r.lessons.some((l) => l.fileCount === 0) ? "partial" : "complete";

const STATUS: Record<Exclude<Filter, "">, { label: string; cls: string }> = {
  empty: { label: "ยังไม่บันทึก", cls: "bg-destructive/15 text-destructive" },
  partial: { label: "ไม่ครบ", cls: "bg-warning/15 text-warning" },
  complete: { label: "ครบถ้วน", cls: "bg-success/15 text-success" },
};

const thDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

/** ติดตามเนื้อหา — per วิชา × ระดับชั้น: เนื้อหาหลัก / เนื้อหาย่อย (legacy) / ไฟล์ recorded so far. */
export function DocCoverageTab() {
  const { profile: me } = useAuth();
  const orgWide = isOrgWide(me!.roles);
  const { data: rows = [], isLoading } = useDocCoverage();
  const { data: departments = [] } = useDepartments();
  const { data: people = [] } = useProfiles({ search: "", departmentId: "", role: "", active: "" });
  const nameById = new Map(people.map((p) => [p.id, profileFullName(p)]));
  const nameOf = (id: string | null) => (id && nameById.get(id)) || "—";
  const [search, setSearch] = useState("");
  const [deptId, setDeptId] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [open, setOpen] = useState<string | null>(null);

  // dept_head sees only their own department's subjects (curriculum is readable school-wide).
  const scoped = useMemo(
    () => (orgWide ? rows.filter((r) => !deptId || r.departmentId === deptId) : rows.filter((r) => r.departmentId === me!.department_id)),
    [rows, orgWide, deptId, me],
  );
  const counts = { empty: 0, partial: 0, complete: 0 };
  for (const r of scoped) counts[statusOf(r)]++;

  const q = search.trim().toLowerCase();
  const shown = scoped
    .filter((r) => (!filter || statusOf(r) === filter) && (!q || `${r.code} ${r.nameTh}`.toLowerCase().includes(q)))
    .sort((a, b) => a.code.localeCompare(b.code, "th") || a.gradeSort - b.gradeSort);
  const { page, setPage, pageCount, pageRows } = usePagination(shown, [search, deptId, filter]);

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="สถานะการบันทึก" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          {(
            [
              ["", "ทั้งหมด", scoped.length],
              ["empty", STATUS.empty.label, counts.empty],
              ["partial", STATUS.partial.label, counts.partial],
              ["complete", STATUS.complete.label, counts.complete],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label} ({n})
            </button>
          ))}
        </div>
        <div className="flex min-w-40 max-w-xl flex-1 items-center gap-2">
          {orgWide && (
            <Select className="w-auto min-w-32" value={deptId} onChange={(e) => setDeptId(e.target.value)} aria-label="ฝ่าย/หมวด">
              <option value="">ทุกหมวด</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัสหรือชื่อวิชา..." aria-label="ค้นหา" />
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="ไม่พบรายการ" description="วิชาที่อยู่ในหลักสูตรจะแสดงที่นี่" icon={BookIcon} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[44rem] text-xs">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">วิชา</th>
                <th className="px-3 py-2.5 font-medium">ระดับชั้น</th>
                <th className="px-3 py-2.5 text-right font-medium">เนื้อหาหลัก</th>
                <th className="px-3 py-2.5 text-right font-medium">เนื้อหาย่อย</th>
                <th className="px-3 py-2.5 text-right font-medium">ไฟล์</th>
                <th className="px-3 py-2.5 font-medium">อัปเดตล่าสุด</th>
                <th className="px-3 py-2.5 font-medium">ผู้อัปโหลดล่าสุด</th>
                <th className="px-3 py-2.5 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((r) => {
                const s = STATUS[statusOf(r)];
                const isOpen = open === r.key;
                const latest = [...r.lessons].sort((a, b) => a.lastAt.localeCompare(b.lastAt)).at(-1);
                const last = latest?.lastAt;
                return (
                  <Fragment key={r.key}>
                    <tr className="hover:bg-muted/40">
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          disabled={r.lessons.length === 0}
                          aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : r.key)}
                          className="flex items-center gap-2 text-left disabled:cursor-default"
                        >
                          <ChevronForward className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-90", r.lessons.length === 0 && "opacity-20")} />
                          <span>
                            <span className="block font-medium">{r.code}</span>
                            <span className="block text-[11px] text-muted-foreground">{r.nameTh}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">{r.gradeName}</td>
                      <td className="px-3 py-2.5 text-right">{r.lessons.length}</td>
                      <td className="px-3 py-2.5 text-right">{r.lessons.reduce((n, l) => n + l.topicCount, 0)}</td>
                      <td className="px-3 py-2.5 text-right">{r.lessons.reduce((n, l) => n + l.fileCount, 0)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{last ? thDateTime(last) : "—"}</td>
                      <td className="px-3 py-2.5">{nameOf(latest?.lastBy ?? null)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium", s.cls)}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {s.label}
                        </span>
                      </td>
                    </tr>
                    {isOpen &&
                      [...r.lessons]
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((l) => (
                          <tr key={l.id} className="bg-muted/20">
                            <td className="py-2 pl-10 pr-3" colSpan={2}>
                              {l.name}
                              <span className="block text-[11px] text-muted-foreground">ผู้สร้าง: {nameOf(l.createdBy)}</span>
                            </td>
                            <td />
                            <td className="px-3 py-2 text-right">{l.topicCount}</td>
                            <td className={cn("px-3 py-2 text-right", l.fileCount === 0 && "text-destructive")}>{l.fileCount}</td>
                            <td className="whitespace-nowrap px-3 py-2">{thDateTime(l.lastAt)}</td>
                            <td className="px-3 py-2">{nameOf(l.lastBy)}</td>
                            <td className="px-3 py-2 text-[11px] text-destructive">{l.fileCount === 0 ? "ยังไม่มีไฟล์" : ""}</td>
                          </tr>
                        ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}
