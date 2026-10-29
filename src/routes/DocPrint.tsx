import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { AppsIcon, CheckboxIcon, DocumentTextIcon, ListIcon, MailIcon, Plus, PrintIcon, Search, SquareIcon, TimeIcon, X } from "@/components/icons";
import { FileTile } from "@/components/FileTile";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Input, Pagination, Select, Skeleton, Spinner } from "@/components/ui";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import {
  useAddPrintRequests,
  useDeletePrintRequest,
  useEmailPrintRequest,
  useMarkPrinted,
  useUndoPrinted,
  usePrintEmails,
  usePrintRequests,
  useUpdatePrintRequest,
  type PrintRequestRow,
} from "@/hooks/useDocPrint";
import { openDocFile, useDocFileChoices } from "@/hooks/usePlan";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { printDocFile } from "@/lib/printDocFile";
import { canManageAcademic, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

// รายการพิมพ์ — หัวหน้างานขึ้นไปเลือกเอกสารที่ครูอัปโหลดส่งให้ธุรการพิมพ์. See migration 0093.

const PAGE = 20;
const LIST_PAGE = 10; // same page size as the ตรวจเอกสาร tab
type Filter = "all" | "pending" | "printed";

export function PrintListTab() {
  const { profile: me } = useAuth();
  const mayRequest = me ? canManageAcademic(me.roles) : false;
  const { data: requests = [], isLoading } = usePrintRequests();
  const [filter, setFilter] = useState<Filter>("pending");
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const [view, setView] = useState<"card" | "table">("card");

  const shown = requests.filter((r) => filter === "all" || r.status === filter);
  const { page, setPage, pageCount, pageRows } = usePagination(shown, [filter], LIST_PAGE);
  const count = (s: Filter) => requests.filter((r) => s === "all" || r.status === s).length;
  const chips: [Filter, string][] = [
    ["pending", "รอพิมพ์"],
    ["printed", "พิมพ์แล้ว"],
    ["all", "ทั้งหมด"],
  ];

  return (
    <div className="page-fill">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">รายการพิมพ์</h2>
          <p className="text-xs text-muted-foreground">
            {mayRequest ? "เลือกเอกสารที่ต้องการให้ธุรการพิมพ์" : "เอกสารที่ถูกส่งมาให้พิมพ์"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 rounded-lg border border-border bg-card p-0.5">
            {(["card", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-label={v === "card" ? "มุมมองการ์ด" : "มุมมองตาราง"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "flex h-full w-8 items-center justify-center rounded-md",
                  view === v ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                {v === "card" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => setHistory(true)}>
            <TimeIcon className="h-3.5 w-3.5" />
            ประวัติอีเมล
          </Button>
          {mayRequest && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" />
              เพิ่มเอกสาร
            </Button>
          )}
        </div>
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
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[64rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">เอกสาร</th>
                <th className="px-3 py-2 font-medium">ชั้น</th>
                <th className="px-3 py-2 font-medium">ผู้ส่ง</th>
                <th className="px-3 py-2 font-medium">จำนวน</th>
                <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <RequestTableRow key={r.id} request={r} mayRequest={mayRequest} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-2">
          {pageRows.map((r) => (
            <RequestRow key={r.id} request={r} mayRequest={mayRequest} />
          ))}
        </ul>
      )}
      <div className="mt-auto">
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>

      <EmailHistorySheet open={history} onClose={() => setHistory(false)} />
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

/** Edit state + actions of one request, shared by the card and the table view. */
function useRequestRow(r: PrintRequestRow) {
  const update = useUpdatePrintRequest();
  const markPrinted = useMarkPrinted();
  const undo = useUndoPrinted();
  const remove = useDeletePrintRequest();
  const toast = useToast();
  const [copies, setCopies] = useState(String(r.copies));
  const [note, setNote] = useState(r.note ?? "");
  const [printing, setPrinting] = useState(false);
  const fail = (msg: string) => () => toast(msg, "error");

  return {
    pending: r.status === "pending",
    copies,
    setCopies,
    note,
    setNote,
    printing,
    busy: markPrinted.isPending || undo.isPending || remove.isPending,
    saveCopies() {
      const n = Math.floor(Number(copies));
      if (!Number.isFinite(n) || n < 1 || n > 999) {
        setCopies(String(r.copies));
        return;
      }
      if (n !== r.copies) update.mutate({ id: r.id, copies: n }, { onError: fail("บันทึกไม่สำเร็จ") });
    },
    saveNote() {
      const n = note.trim();
      if (n !== (r.note ?? "")) update.mutate({ id: r.id, note: n || null }, { onError: fail("บันทึกไม่สำเร็จ") });
    },
    async printNow() {
      if (!r.file) return;
      setPrinting(true);
      const result = await printDocFile(r.file.file_path, r.file.file_name);
      setPrinting(false);
      if (result === "error") toast("สั่งพิมพ์ไม่สำเร็จ", "error");
      else if (result === "opened") toast("ไฟล์ชนิดนี้พิมพ์ตรงไม่ได้ เปิดไฟล์ให้แล้ว กรุณาพิมพ์จากโปรแกรมที่เปิด");
    },
    async open() {
      if (r.file && !(await openDocFile(r.file.file_path))) toast("เปิดไฟล์ไม่สำเร็จ", "error");
    },
    markPrinted: () => markPrinted.mutate(r.id, { onError: fail("บันทึกไม่สำเร็จ") }),
    undo: () =>
      undo.mutate(r.id, {
        // the partial unique index rejects a second pending request for the same file (23505)
        onError: (err) =>
          toast((err as { code?: string }).code === "23505" ? "เอกสารนี้มีรายการรอพิมพ์อยู่แล้ว" : "บันทึกไม่สำเร็จ", "error"),
      }),
    remove() {
      if (confirm(`ลบ "${r.file?.title ?? "เอกสารนี้"}" ออกจากรายการพิมพ์?`)) {
        remove.mutate(r.id, { onError: fail("ลบไม่สำเร็จ") });
      }
    },
  };
}

type RowState = ReturnType<typeof useRequestRow>;

// Quiet until focused: the fields read as plain text in the list, as inputs only when edited.
const FIELD =
  "h-8 rounded-lg border-transparent bg-muted/60 px-2.5 text-xs shadow-none focus:border-border focus:bg-background disabled:opacity-100 disabled:text-muted-foreground";

function CopiesField({ st, editable }: { st: RowState; editable: boolean }) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Input
        type="number"
        min={1}
        max={999}
        className={cn(FIELD, "w-16 text-center")}
        value={st.copies}
        disabled={!editable || !st.pending}
        onChange={(e) => st.setCopies(e.target.value)}
        onBlur={st.saveCopies}
        aria-label="จำนวนชุด"
      />
      ชุด
    </label>
  );
}

function NoteField({ st, editable, className }: { st: RowState; editable: boolean; className?: string }) {
  return (
    <Input
      className={cn(FIELD, className)}
      value={st.note}
      maxLength={300}
      placeholder={editable && st.pending ? "เพิ่มหมายเหตุ เช่น พิมพ์สองหน้า" : "ไม่มีหมายเหตุ"}
      disabled={!editable || !st.pending}
      onChange={(e) => st.setNote(e.target.value)}
      onBlur={st.saveNote}
      aria-label="หมายเหตุ"
    />
  );
}

const RECENT_KEY = "print-email-recent";
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

const thDateTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

/** ประวัติการส่งอีเมล (migration 0098): every send attempt, newest first; `requestId` limits it to one print request. */
function EmailHistorySheet({ open, onClose, requestId }: { open: boolean; onClose: () => void; requestId?: string }) {
  const { data: emails = [], isLoading, isError, refetch } = usePrintEmails(open);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = emails
    .filter((e) => !requestId || e.request_id === requestId)
    .filter((e) => !q || e.doc_title.toLowerCase().includes(q) || e.recipients.some((to) => to.toLowerCase().includes(q)));

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSearch("");
          onClose();
        }
      }}
      title="ประวัติการส่งอีเมล"
      description={requestId ? "เฉพาะรายการพิมพ์นี้" : "ทุกครั้งที่ส่งไฟล์ทางอีเมล (ใหม่สุดก่อน)"}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อเอกสารหรืออีเมลผู้รับ..."
            aria-label="ค้นหาประวัติอีเมล"
          />
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <div role="alert" className="flex items-center justify-between gap-2">
            <p className="text-sm text-destructive">โหลดประวัติไม่สำเร็จ</p>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              ลองใหม่
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {emails.length === 0 ? "ยังไม่มีประวัติการส่งอีเมล" : "ไม่พบประวัติที่ตรงเงื่อนไข"}
          </p>
        ) : (
          <ul className="space-y-2">
            {shown.map((e) => (
              <li key={e.id} className="space-y-1 rounded-xl border border-border p-3 font-sarabun">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{e.doc_title}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      e.status === "sent" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {e.status === "sent" ? "ส่งแล้ว" : "ส่งไม่สำเร็จ"}
                  </span>
                </div>
                <p className="break-words text-xs text-muted-foreground">ถึง {e.recipients.join(", ")}</p>
                <p className="text-xs text-muted-foreground">
                  {e.copies} ชุด · โดย {e.sender} · {thDateTime(e.created_at)}
                </p>
                {e.error && <p className="break-words text-xs text-destructive">{e.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/** Centered popup: recipients → send-print-email Edge Function. Recent recipients live in localStorage only. */
function EmailDialog({ r, onClose }: { r: PrintRequestRow; onClose: () => void }) {
  const send = useEmailPrintRequest();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [recent] = useState(readRecent);

  const list = value.split(/[,;\s]+/).filter(Boolean);
  const valid = list.length > 0 && list.length <= 5 && list.every((e) => EMAIL_RE.test(e));

  function submit() {
    if (!valid) return;
    send.mutate(
      { requestId: r.id, to: list },
      {
        onSuccess: () => {
          try {
            localStorage.setItem(RECENT_KEY, JSON.stringify([...new Set([...list, ...recent])].slice(0, 5)));
          } catch {
            /* storage unavailable — recents are a convenience only */
          }
          toast("ส่งอีเมลแล้ว");
          onClose();
        },
        onError: (err) => toast((err as Error).message || "ส่งอีเมลไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && !send.isPending && onClose()}
      onKeyDown={(e) => e.key === "Escape" && !send.isPending && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="ส่งไฟล์ทางอีเมล"
        className="flex w-full max-w-md flex-col gap-4 whitespace-normal rounded-2xl border border-border bg-card p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <h2 className="text-sm font-bold">ส่งไฟล์ทางอีเมล</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.file?.title}</p>
        </div>
        <div className="space-y-2">
          <Input
            autoFocus
            type="text"
            inputMode="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="อีเมลผู้รับ (หลายที่อยู่คั่นด้วยจุลภาค)"
            aria-label="อีเมลผู้รับ"
          />
          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recent.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setValue((v) => (list.includes(e) ? v : v.trim() ? `${v.trim().replace(/[,;]$/, "")}, ${e}` : e))}
                  className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {list.length > 5 && <p className="text-[11px] text-destructive">ส่งได้ไม่เกิน 5 ที่อยู่ต่อครั้ง</p>}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={send.isPending} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" className="flex-1" disabled={!valid || send.isPending}>
            {send.isPending ? <Spinner className="h-3 w-3" /> : <MailIcon className="h-3.5 w-3.5" />}
            {send.isPending ? "กำลังส่ง" : "ส่ง"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function RequestActions({ r, st, mayRequest }: { r: PrintRequestRow; st: RowState; mayRequest: boolean }) {
  const [emailing, setEmailing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {emailing && <EmailDialog r={r} onClose={() => setEmailing(false)} />}
      <EmailHistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} requestId={r.id} />
      <Button variant="ghost" size="sm" disabled={!r.file} onClick={st.open}>
        <DocumentTextIcon className="h-3.5 w-3.5" />
        เปิดไฟล์
      </Button>
      <Button variant="outline" size="sm" disabled={!r.file || st.printing} onClick={st.printNow}>
        {st.printing ? <Spinner className="h-3 w-3" /> : <PrintIcon className="h-3.5 w-3.5" />}
        สั่งพิมพ์
      </Button>
      <Button variant="outline" size="sm" disabled={!r.file} onClick={() => setEmailing(true)}>
        <MailIcon className="h-3.5 w-3.5" />
        ส่งอีเมล
      </Button>
      <Button variant="ghost" size="icon" aria-label="ประวัติการส่งอีเมลของรายการนี้" onClick={() => setHistoryOpen(true)}>
        <TimeIcon className="h-3.5 w-3.5" />
      </Button>
      {st.pending ? (
        <Button size="sm" disabled={st.busy} onClick={st.markPrinted}>
          <PrintIcon className="h-3.5 w-3.5" />
          พิมพ์แล้ว
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={st.busy} onClick={st.undo}>
          ยกเลิกสถานะพิมพ์แล้ว
        </Button>
      )}
      {st.pending && mayRequest && (
        <Button variant="ghost" size="icon" aria-label="ลบออกจากรายการพิมพ์" disabled={st.busy} onClick={st.remove}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

const StatusPill = ({ pending }: { pending: boolean }) => (
  <span
    className={cn(
      "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium",
      pending ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
    )}
  >
    {pending ? "รอพิมพ์" : "พิมพ์แล้ว"}
  </span>
);

const lessonLineOf = (r: PrintRequestRow) =>
  [r.file?.subjectLabel, r.file?.lessonName].filter(Boolean).join(" · ") || r.file?.file_name;

function RequestRow({ request: r, mayRequest }: { request: PrintRequestRow; mayRequest: boolean }) {
  const st = useRequestRow(r);
  return (
    <li className="rounded-xl bg-card shadow-card p-4">
      <div className="flex items-center gap-4">
        <FileTile fileName={r.file?.file_name ?? ""} className="h-12 w-12" />
        <div className="min-w-0 flex-1 space-y-1 font-sarabun">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold leading-tight">{r.file?.title ?? "ไม่มีสิทธิ์ดูไฟล์นี้"}</p>
            {r.file?.gradeCode && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {gradeShortLabel(r.file.gradeCode)}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{lessonLineOf(r)}</p>
          <p className="truncate text-[11px] text-muted-foreground/80">
            {r.requester} · {thDate(r.created_at)}
            {!st.pending && r.printed_at && <> · พิมพ์เมื่อ {thDate(r.printed_at)}</>}
          </p>
        </div>
        <span className="self-start">
          <StatusPill pending={st.pending} />
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <CopiesField st={st} editable={mayRequest} />
        <NoteField st={st} editable={mayRequest} className="min-w-[10rem] flex-1" />
        <div className="ml-auto">
          <RequestActions r={r} st={st} mayRequest={mayRequest} />
        </div>
      </div>
    </li>
  );
}

/** Compact one-line-per-request view. */
function RequestTableRow({ request: r, mayRequest }: { request: PrintRequestRow; mayRequest: boolean }) {
  const st = useRequestRow(r);
  return (
    <tr className="border-t border-border align-middle">
      <td className="px-3 py-2">
        <div className="flex min-w-[14rem] items-center gap-2.5">
          <FileTile fileName={r.file?.file_name ?? ""} className="h-10 w-10 rounded-lg" />
          <div className="min-w-0 font-sarabun leading-tight">
            <p className="truncate text-xs font-semibold">{r.file?.title ?? "ไม่มีสิทธิ์ดูไฟล์นี้"}</p>
            <p className="truncate text-[11px] text-muted-foreground">{lessonLineOf(r)}</p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">{r.file?.gradeCode ? gradeShortLabel(r.file.gradeCode) : "-"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {r.requester}
        <br />
        {thDate(r.created_at)}
      </td>
      <td className="px-3 py-2">
        <CopiesField st={st} editable={mayRequest} />
      </td>
      <td className="px-3 py-2">
        <NoteField st={st} editable={mayRequest} className="min-w-[9rem]" />
      </td>
      <td className="px-3 py-2">
        <StatusPill pending={st.pending} />
      </td>
      <td className="px-3 py-2">
        <RequestActions r={r} st={st} mayRequest={mayRequest} />
      </td>
    </tr>
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
