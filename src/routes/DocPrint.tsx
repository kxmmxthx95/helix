import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { CheckboxIcon, DocumentTextIcon, Plus, PrintIcon, Search, SquareIcon, X } from "@/components/icons";
import { FileTile } from "@/components/FileTile";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { useDepartments } from "@/hooks/useProfiles";
import {
  useAddPrintRequests,
  useDeletePrintRequest,
  useMarkPrinted,
  usePrintRequests,
  useUpdatePrintRequest,
  type PrintRequestRow,
} from "@/hooks/useDocPrint";
import { openDocFile, useDocFileChoices } from "@/hooks/usePlan";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManageAcademic, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

// รายการพิมพ์ — หัวหน้างานขึ้นไปเลือกเอกสารที่ครูอัปโหลดส่งให้ธุรการพิมพ์. See migration 0093.

const PAGE = 20;
type Filter = "all" | "pending" | "printed";

export function PrintListTab() {
  const { profile: me } = useAuth();
  const mayRequest = me ? canManageAcademic(me.roles) : false;
  const { data: requests = [], isLoading } = usePrintRequests();
  const [filter, setFilter] = useState<Filter>("pending");
  const [adding, setAdding] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filter]);

  const shown = requests.filter((r) => filter === "all" || r.status === filter);
  const count = (s: Filter) => requests.filter((r) => s === "all" || r.status === s).length;
  const chips: [Filter, string][] = [
    ["pending", "รอพิมพ์"],
    ["printed", "พิมพ์แล้ว"],
    ["all", "ทั้งหมด"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">รายการพิมพ์</h2>
          <p className="text-xs text-muted-foreground">
            {mayRequest ? "เลือกเอกสารที่ต้องการให้ธุรการพิมพ์" : "เอกสารที่ถูกส่งมาให้พิมพ์"}
          </p>
        </div>
        {mayRequest && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            เพิ่มเอกสาร
          </Button>
        )}
      </div>

      <div className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
        {chips.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
              filter === key
                ? "border-accent bg-accent/10 font-medium text-accent"
                : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {label} ({count(key)})
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "ไม่มีรายการรอพิมพ์" : "ไม่มีรายการ"}
          description={mayRequest ? "กด “เพิ่มเอกสาร” เพื่อส่งเอกสารไปพิมพ์" : "ยังไม่มีเอกสารที่ถูกส่งมาให้พิมพ์"}
        />
      ) : (
        <ul className="space-y-2">
          {shown.slice(0, limit).map((r) => (
            <RequestRow key={r.id} request={r} mayRequest={mayRequest} />
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + PAGE)}>
          แสดงเพิ่ม (เหลือ {shown.length - limit} รายการ)
        </Button>
      )}

      {mayRequest && (
        <AddDrawer
          open={adding}
          onClose={() => setAdding(false)}
          queuedIds={new Set(requests.filter((r) => r.status === "pending").map((r) => r.doc_file_id))}
        />
      )}
    </div>
  );
}

const thDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });

function RequestRow({ request: r, mayRequest }: { request: PrintRequestRow; mayRequest: boolean }) {
  const update = useUpdatePrintRequest();
  const markPrinted = useMarkPrinted();
  const remove = useDeletePrintRequest();
  const toast = useToast();
  const [copies, setCopies] = useState(String(r.copies));
  const [note, setNote] = useState(r.note ?? "");
  const pending = r.status === "pending";
  const fail = (msg: string) => () => toast(msg, "error");

  function saveCopies() {
    const n = Math.floor(Number(copies));
    if (!Number.isFinite(n) || n < 1 || n > 999) {
      setCopies(String(r.copies));
      return;
    }
    if (n !== r.copies) update.mutate({ id: r.id, copies: n }, { onError: fail("บันทึกไม่สำเร็จ") });
  }

  function saveNote() {
    const n = note.trim();
    if (n !== (r.note ?? "")) update.mutate({ id: r.id, note: n || null }, { onError: fail("บันทึกไม่สำเร็จ") });
  }

  async function open() {
    if (r.file && !(await openDocFile(r.file.file_path))) toast("เปิดไฟล์ไม่สำเร็จ", "error");
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <FileTile fileName={r.file?.file_name ?? ""} />
        <div className="min-w-0 flex-1 font-sarabun leading-tight">
          <p className="truncate text-sm font-medium">{r.file?.title ?? "ไม่มีสิทธิ์ดูไฟล์นี้"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[r.file?.subjectLabel, r.file?.gradeCode && gradeShortLabel(r.file.gradeCode), r.file?.lessonName]
              .filter(Boolean)
              .join(" · ") || r.file?.file_name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            ส่งโดย {r.requester} · {thDate(r.created_at)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
            pending ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
          )}
        >
          {pending ? "รอพิมพ์" : "พิมพ์แล้ว"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          จำนวน
          <Input
            type="number"
            min={1}
            max={999}
            className="h-8 w-20"
            value={copies}
            disabled={!mayRequest || !pending}
            onChange={(e) => setCopies(e.target.value)}
            onBlur={saveCopies}
            aria-label="จำนวนชุด"
          />
          ชุด
        </label>
        <Input
          className="h-8 min-w-[10rem] flex-1"
          value={note}
          maxLength={300}
          placeholder={mayRequest && pending ? "หมายเหตุ เช่น พิมพ์สองหน้า" : "ไม่มีหมายเหตุ"}
          disabled={!mayRequest || !pending}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          aria-label="หมายเหตุ"
        />
        <Button variant="outline" size="sm" disabled={!r.file} onClick={open}>
          <DocumentTextIcon className="h-3.5 w-3.5" />
          เปิดไฟล์
        </Button>
        {pending && (
          <Button
            size="sm"
            disabled={markPrinted.isPending}
            onClick={() => markPrinted.mutate(r.id, { onError: fail("บันทึกไม่สำเร็จ") })}
          >
            <PrintIcon className="h-3.5 w-3.5" />
            พิมพ์แล้ว
          </Button>
        )}
        {pending && mayRequest && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="ลบออกจากรายการพิมพ์"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`ลบ "${r.file?.title ?? "เอกสารนี้"}" ออกจากรายการพิมพ์?`)) {
                remove.mutate(r.id, { onError: fail("ลบไม่สำเร็จ") });
              }
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {!pending && r.printed_at && (
        <p className="text-[11px] text-muted-foreground">พิมพ์เมื่อ {thDate(r.printed_at)}</p>
      )}
    </li>
  );
}

/** Pick uploaded documents to queue; same drawer shape as the curriculum map's document picker. */
function AddDrawer({ open, onClose, queuedIds }: { open: boolean; onClose: () => void; queuedIds: Set<string> }) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const { profile: me } = useAuth();
  // Only org-wide roles can see documents of more than one department.
  const orgWide = me ? isOrgWide(me.roles) : false;
  const { data: departments = [] } = useDepartments();
  const { data: areas = [] } = useLearningAreas();
  const { data: choices = [], isLoading } = useDocFileChoices(open);
  const add = useAddPrintRequests();
  const toast = useToast();

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);
  useEffect(() => setLimit(PAGE), [search, gradeFilter, deptFilter, areaFilter]);

  // A top-level กลุ่มสาระ also matches its sub-areas (สาระย่อย).
  const areaIds = new Set(areaFilter ? [areaFilter, ...areas.filter((a) => a.parent_id === areaFilter).map((a) => a.id)] : []);
  const available = choices.filter((c) => !queuedIds.has(c.id));
  // Grade options follow the แผนก and กลุ่มสาระ picked above them.
  const scoped = available
    .filter((c) => !deptFilter || c.departmentId === deptFilter)
    .filter((c) => !areaFilter || areaIds.has(c.areaId));
  const gradeOptions = [...new Set(scoped.map((c) => c.gradeCode).filter(Boolean))].sort();
  const q = search.trim().toLowerCase();
  const shown = scoped
    .filter((c) => !q || `${c.title} ${c.fileName} ${c.subjectLabel} ${c.lessonName}`.toLowerCase().includes(q))
    .filter((c) => !gradeFilter || c.gradeCode === gradeFilter);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function save() {
    add.mutate([...selected], {
      onSuccess: () => {
        toast(`เพิ่ม ${selected.size} เอกสารเข้ารายการพิมพ์แล้ว`);
        onClose();
      },
      onError: () => toast("เพิ่มไม่สำเร็จ", "error"),
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSearch("");
          setGradeFilter("");
          setDeptFilter("");
          setAreaFilter("");
          onClose();
        }
      }}
      title="เพิ่มเอกสารเข้ารายการพิมพ์"
      description="เลือกเอกสารที่ครูอัปโหลดเพื่อส่งให้ธุรการพิมพ์ (เริ่มต้น 1 ชุด แก้จำนวนได้ในรายการ)"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">เลือกแล้ว {selected.size} เอกสาร</p>
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-accent hover:underline">
              ล้างการเลือก
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={selected.size === 0 || add.isPending}>
              {add.isPending ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <>
                  <PrintIcon className="h-3.5 w-3.5" />
                  เพิ่มเข้ารายการพิมพ์
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อเอกสาร วิชา หรือบทเรียน..."
            aria-label="ค้นหาเอกสาร"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {orgWide && (
            <Select
              className="w-full"
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setGradeFilter("");
              }}
              aria-label="แผนก"
              placeholder="ทุกแผนก"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
          <Select
            className="w-full"
            value={areaFilter}
            onChange={(e) => {
              setAreaFilter(e.target.value);
              setGradeFilter("");
            }}
            aria-label="กลุ่มสาระ"
            placeholder="ทุกกลุ่มสาระ"
          >
            {areas
              .filter((a) => !a.parent_id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
          <Select className="w-full" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} aria-label="ระดับชั้น" placeholder="ทุกระดับชั้น">
            {gradeOptions.map((o) => (
              <option key={o} value={o}>
                {gradeShortLabel(o)}
              </option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="space-y-2">
            {shown.slice(0, limit).map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-pressed={checked}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                      checked ? "border-accent/50 bg-accent/5" : "border-border hover:bg-muted/50",
                    )}
                  >
                    {checked ? (
                      <CheckboxIcon className="h-5 w-5 shrink-0 text-accent" />
                    ) : (
                      <SquareIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <FileTile fileName={c.fileName} />
                    <div className="min-w-0 flex-1 font-sarabun leading-tight">
                      <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.subjectLabel || c.fileName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.gradeCode && gradeShortLabel(c.gradeCode), c.lessonName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">ไม่พบเอกสารที่ตรงเงื่อนไข</li>
            )}
          </ul>
        )}
        {shown.length > limit && (
          <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + PAGE)}>
            แสดงเพิ่ม (เหลือ {shown.length - limit} รายการ)
          </Button>
        )}
      </div>
    </Sheet>
  );
}
