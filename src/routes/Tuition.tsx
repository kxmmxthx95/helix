import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { FileUp, Plus, SettingsIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Pagination, Select, Skeleton } from "@/components/ui";
import { useAllAcademicTerms } from "@/hooks/useAcademicTerms";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useClassroomsByDepartment, useCurrentClassroomEnrollmentsByDepartment } from "@/hooks/useStatusManagement";
import { useFitRows } from "@/hooks/useFitRows";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import { useStudents, type StudentListItem } from "@/hooks/useStudents";
import {
  tuitionInvoiceFileUrl,
  useBulkCreateTuitionInvoices,
  useCancelTuitionInvoice,
  useCreateTuitionInvoice,
  useRecordTuitionPayment,
  useReplaceTuitionInvoiceFile,
  useSetTuitionTermAmount,
  useUpdateTuitionInvoiceAmount,
  useTuitionInvoices,
  useTuitionTermAmount,
  useVoidTuitionPayment,
  type TuitionInvoiceRow,
} from "@/hooks/useTuition";
import type { AcademicTerm, TuitionPaymentMethod } from "@/lib/database.types";
import { isOrgWide } from "@/lib/roles";
import {
  formatBaht,
  INVOICE_STATE_LABEL,
  PAYMENT_METHOD_LABEL,
  STUDENT_TUITION_LABEL,
  summarizeInvoice,
  summarizeStudent,
  type StudentTuitionState,
} from "@/lib/tuition";
import { cn } from "@/lib/utils";

const todayIso = () => new Date().toISOString().slice(0, 10);
const nameOf = (s: { prefix?: string | null; first_name: string; last_name: string } | null) =>
  s ? `${s.prefix ?? ""}${s.first_name} ${s.last_name}` : "—";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
const termLabel = (t: Pick<AcademicTerm, "academic_year" | "term_type"> | null) =>
  t ? `${t.academic_year} / ${t.term_type === "term1" ? "1" : t.term_type === "term2" ? "2" : "ฤดูร้อน"}` : "";

export function Tuition() {
  const { profile: me } = useAuth();
  if (!me) return null;
  if (isOrgWide(me.roles)) return <StaffView meId={me.id} />;
  if (me.roles.includes("parent")) return <ParentView />;
  return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
}

// ------------------------------------------------------------------ shared

/** One invoice. Staff get the action buttons via `actions`; parents get the read-only card. */
function InvoiceCard({
  inv,
  actions,
  onVoidPayment,
}: {
  inv: TuitionInvoiceRow;
  actions?: { onPay: () => void; onReplaceFile: () => void; onCancel: () => void };
  onVoidPayment?: (paymentId: string) => void;
}) {
  const toast = useToast();
  const { paid, balance, state } = summarizeInvoice(inv, inv.tuition_payments, todayIso());
  const openFile = () =>
    inv.file_path &&
    tuitionInvoiceFileUrl(inv.file_path).then(
      (url) => window.open(url, "_blank", "noopener"),
      (e) => toast(errMsg(e), "error"),
    );

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-ui text-sm font-semibold">{inv.title}</p>
          <p className="text-xs text-muted-foreground">
            {termLabel(inv.term)}
            {inv.due_date ? ` · ครบกำหนด ${inv.due_date}` : ""}
          </p>
        </div>
        <span className={cn("font-ui text-xs font-semibold", state === "overdue" && "text-destructive", state === "paid" && "text-accent")}>
          {INVOICE_STATE_LABEL[state]}
        </span>
      </div>
      <p className="text-xs">
        ยอด {formatBaht(inv.amount)} · ชำระแล้ว {formatBaht(paid)} · คงเหลือ {formatBaht(balance)}
      </p>
      {inv.file_path ? (
        <button className="font-ui text-xs underline" onClick={() => void openFile()}>
          ดูไฟล์ใบแจ้งหนี้ (PDF)
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">ยังไม่มีไฟล์ใบแจ้งหนี้</p>
      )}
      {inv.tuition_payments.map((p) => (
        <p key={p.id} className={cn("text-xs text-muted-foreground", p.voided_at && "line-through")}>
          ใบเสร็จ #{p.receipt_no} · {p.paid_at} · {PAYMENT_METHOD_LABEL[p.method]} · {formatBaht(p.amount)}
          {p.voided_at && ` (ยกเลิก: ${p.void_reason})`}
          {onVoidPayment && !p.voided_at && (
            <button className="ml-2 underline" onClick={() => onVoidPayment(p.id)}>
              ยกเลิก
            </button>
          )}
        </p>
      ))}
      {actions && state !== "cancelled" && (
        <div className="flex flex-wrap gap-2">
          {balance > 0 && (
            <Button size="sm" onClick={actions.onPay}>
              รับชำระ
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={actions.onReplaceFile}>
            เปลี่ยนไฟล์
          </Button>
          {paid === 0 && (
            <Button size="sm" variant="ghost" onClick={actions.onCancel}>
              ยกเลิกใบแจ้งหนี้
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ parent

function ParentView() {
  const { data: invoices = [], isLoading } = useTuitionInvoices();
  // RLS already limits this to the parent's own children; just group by child.
  const byChild = useMemo(() => {
    const m = new Map<string, TuitionInvoiceRow[]>();
    for (const inv of invoices) m.set(inv.student_id, [...(m.get(inv.student_id) ?? []), inv]);
    return [...m.values()];
  }, [invoices]);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (byChild.length === 0) return <EmptyState title="ยังไม่มีใบแจ้งหนี้" />;
  return (
    <div className="space-y-4">
      {byChild.map((list) => (
        <section key={list[0]?.student_id} className="space-y-2">
          <h2 className="font-ui text-sm font-semibold">{nameOf(list[0]?.student ?? null)}</h2>
          {list.map((inv) => (
            <InvoiceCard key={inv.id} inv={inv} />
          ))}
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- staff

const STATE_ORDER: StudentTuitionState[] = ["none", "overdue", "unpaid", "paid"];
const STUDENT_STATE_TONE: Record<StudentTuitionState, string> = {
  none: "bg-muted text-muted-foreground",
  unpaid: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  paid: "bg-success/15 text-success",
};

function StaffView({ meId }: { meId: string }) {
  const [deptId, setDeptId] = useState("");
  // Pick order: term → department → grade. A term is one row per department, so the
  // picker holds the year/type "key" and the row for the chosen department is resolved below.
  const [termKey, setTermKey] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StudentTuitionState | "">("");
  const [open, setOpen] = useState<StudentListItem | null>(null);
  const [amountOpen, setAmountOpen] = useState(false);
  // Row upload icon: the PDF picked there opens that student's sheet straight on the new-invoice form.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const pickInput = useRef<HTMLInputElement>(null);
  const pickFor = useRef<StudentListItem | null>(null);

  const { data: departments = [] } = useDepartments();
  const { data: allTerms = [] } = useAllAcademicTerms();
  const keyOf = (t: Pick<AcademicTerm, "academic_year" | "term_type">) => `${t.academic_year}:${t.term_type}`;
  const termOptions = useMemo(() => {
    const m = new Map<string, AcademicTerm>();
    for (const t of allTerms) if (!m.has(keyOf(t))) m.set(keyOf(t), t);
    return [...m.values()];
  }, [allTerms]);
  const deptsWithTerm = new Set(allTerms.filter((t) => keyOf(t) === termKey).map((t) => t.department_id));
  const term = allTerms.find((t) => t.department_id === deptId && keyOf(t) === termKey) ?? null;
  const termId = term?.id ?? "";
  const { data: grades = [] } = useGradeLevels(deptId || null);
  const { data: deptClassrooms = [] } = useClassroomsByDepartment(deptId || null);
  const { data: enrollments = [] } = useCurrentClassroomEnrollmentsByDepartment(deptId || null);
  const classrooms = deptClassrooms.filter((c) => c.grade_level_id === gradeId);
  const roomOf = useMemo(() => {
    const name = new Map(deptClassrooms.map((c) => [c.id, c.name]));
    return new Map(enrollments.map((e) => [e.student_id, name.get(e.classroom_id) ?? "—"]));
  }, [deptClassrooms, enrollments]);
  const { data: students = [], isLoading: loadingStudents } = useStudents({
    search,
    departmentId: deptId,
    status: "studying",
    gradeLevelId: gradeId || undefined,
    classroomId: classroomId || undefined,
  });
  const { data: invoices = [], isLoading: loadingInvoices } = useTuitionInvoices(termId || null);
  const { data: termAmount } = useTuitionTermAmount(termId || null);

  const today = todayIso();
  const rows = useMemo(() => {
    const byStudent = new Map<string, TuitionInvoiceRow[]>();
    for (const inv of invoices) byStudent.set(inv.student_id, [...(byStudent.get(inv.student_id) ?? []), inv]);
    return students.map((s) => ({
      student: s,
      live: (byStudent.get(s.id) ?? []).filter((i) => i.status !== "cancelled"),
      ...summarizeStudent(
        (byStudent.get(s.id) ?? []).map((i) => ({ invoice: i, payments: i.tuition_payments })),
        today,
      ),
    }));
  }, [students, invoices, today]);

  const counts = STATE_ORDER.map((st) => ({ st, n: rows.filter((r) => r.state === st).length }));
  const shown = stateFilter ? rows.filter((r) => r.state === stateFilter) : rows;
  // Pager (py-3 + text-xs ≈ 48px) plus the gap above it.
  const fit = useFitRows({ reserve: 60 });
  const { page, setPage, pageCount, pageRows } = usePagination(shown, [deptId, termId, gradeId, classroomId, search, stateFilter], fit.rows);
  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรหัสนักเรียน" aria-label="ค้นหา" disabled={!deptId} />
          <Select
            value={termKey}
            onChange={(e) => {
              setTermKey(e.target.value);
              setDeptId("");
              setGradeId("");
              setClassroomId("");
            }}
            aria-label="ภาคเรียน"
            placeholder="เลือกภาคเรียน"
          >
            {termOptions.map((t) => (
              <option key={keyOf(t)} value={keyOf(t)}>
                {termLabel(t)}
              </option>
            ))}
          </Select>
          <Select
            value={deptId}
            onChange={(e) => {
              setDeptId(e.target.value);
              setGradeId("");
              setClassroomId("");
            }}
            aria-label="แผนก"
            placeholder="เลือกแผนก"
            disabled={!termKey}
          >
            {departments.filter((d) => deptsWithTerm.has(d.id)).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={gradeId} onChange={(e) => (setGradeId(e.target.value), setClassroomId(""))} aria-label="ชั้น" placeholder="ทุกชั้น" disabled={!deptId}>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} aria-label="ห้องเรียน" placeholder="ทุกห้อง" disabled={!gradeId}>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as StudentTuitionState | "")} aria-label="สถานะ" placeholder="ทุกสถานะ" disabled={!termId}>
            {STATE_ORDER.map((st) => (
              <option key={st} value={st}>
                {STUDENT_TUITION_LABEL[st]}
              </option>
            ))}
          </Select>
        <Button variant="ghost" aria-label="ตั้งค่ายอดเงินค่าเทอม" title="ตั้งค่ายอดเงินค่าเทอม" disabled={!termId} onClick={() => setAmountOpen(true)}>
          <SettingsIcon className="size-4" />
        </Button>
      </div>

      {!deptId || !termId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนกและภาคเรียน" description="เพื่อดูรายชื่อนักเรียนและใบแจ้งหนี้ค่าเทอม" />
        </div>
      ) : loadingStudents || loadingInvoices ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบนักเรียน" description="ไม่พบนักเรียนที่กำลังศึกษาตามเงื่อนไขที่เลือก" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {counts.map(({ st, n }) => (
              <span key={st} className={cn("rounded-full border border-border px-3 py-1", st === "overdue" && n > 0 && "text-destructive")}>
                {STUDENT_TUITION_LABEL[st]} {n}
              </span>
            ))}
          </div>
          <div ref={fit.ref} style={{ minHeight: fit.minHeight }} className="scrollbar-hidden overflow-x-auto border-y border-border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัส</th>
                  <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2 font-medium">ชั้น</th>
                  <th className="px-3 py-2 font-medium">ห้อง</th>
                  <th className="px-3 py-2 text-right font-medium">ใบแจ้งหนี้</th>
                  <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                  <th className="px-3 py-2 text-right font-medium">ค้างชำระ</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ student: s, live, count, total, outstanding, state }) => (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    onClick={() => setOpen(s)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(s)}
                    className="h-[40px] cursor-pointer border-t border-border hover:bg-foreground/5"
                  >
                    <td className="px-3 py-0">{s.student_code}</td>
                    <td className="px-3 py-0">{nameOf(s)}</td>
                    <td className="px-3 py-0">{gradeName(s.grade_level_id)}</td>
                    <td className="px-3 py-0">{roomOf.get(s.id) ?? "—"}</td>
                    <td className="px-3 py-0 text-right">{count}</td>
                    <td className="px-3 py-0 text-right">
                      <AmountCell studentId={s.id} live={live} total={total} standard={termAmount?.amount ?? null} term={term} meId={meId} today={today} />
                    </td>
                    <td className="px-3 py-0 text-right">{count ? formatBaht(outstanding) : "—"}</td>
                    <td className="px-3 py-0">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px]", STUDENT_STATE_TONE[state])}>{STUDENT_TUITION_LABEL[state]}</span>
                    </td>
                    <td className="px-3 py-0 text-right">
                      <button
                        type="button"
                        aria-label={`อัปโหลดใบแจ้งหนี้ ${nameOf(s)}`}
                        title="อัปโหลดใบแจ้งหนี้"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          pickFor.current = s;
                          pickInput.current?.click();
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <FileUp className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}

      <input
        ref={pickInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && pickFor.current) {
            setPendingFile(file);
            setOpen(pickFor.current);
          }
        }}
      />

      {amountOpen && (
        <TermAmountSheet
          termId={termId}
          term={term}
          meId={meId}
          // Bulk targets: filtered students with no live invoice yet (cancelled ones don't count).
          targets={shown.filter((r) => r.state === "none").map((r) => r.student.id)}
          skipped={shown.filter((r) => r.state !== "none").length}
          onClose={() => setAmountOpen(false)}
        />
      )}

      {open && (
        <StudentSheet
          key={`${open.id}:${pendingFile?.name ?? ""}`}
          initialFile={pendingFile}
          student={open}
          termId={termId}
          invoices={invoices.filter((i) => i.student_id === open.id)}
          meId={meId}
          onClose={() => (setOpen(null), setPendingFile(null))}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------ inline amount cell

/**
 * Click-to-edit "ยอดรวม". No live invoice: saving creates one (no PDF yet). One live invoice:
 * saving edits its amount (the DB refuses anything below what is already paid). Several:
 * read-only here — the row opens the student sheet instead.
 */
function AmountCell({
  studentId,
  live,
  total,
  standard,
  term,
  meId,
  today,
}: {
  studentId: string;
  live: TuitionInvoiceRow[];
  total: number;
  standard: number | null;
  term: Pick<AcademicTerm, "id" | "academic_year" | "term_type"> | null;
  meId: string;
  today: string;
}) {
  const toast = useToast();
  const create = useBulkCreateTuitionInvoices();
  const update = useUpdateTuitionInvoiceAmount();
  const [value, setValue] = useState<string | null>(null);
  const shown = live.length ? formatBaht(total) : standard != null ? formatBaht(standard) : "—";
  if (live.length > 1) return <>{shown}</>;

  const current = live[0] ? live[0].amount : standard;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const done = { onSuccess: () => (toast("บันทึกยอดแล้ว"), setValue(null)), onError: (e: unknown) => toast(errMsg(e), "error") };

  const save = () => {
    const amt = Number(value);
    if (!(amt > 0) || !term) return;
    if (live[0]) {
      const paid = summarizeInvoice(live[0], live[0].tuition_payments, today).paid;
      if (amt < paid) return toast(`ยอดต้องไม่ต่ำกว่ายอดที่ชำระแล้ว (${formatBaht(paid)})`, "error");
      update.mutate({ id: live[0].id, amount: amt }, done);
    } else {
      create.mutate([{ student_id: studentId, term_id: term.id, title: `ค่าเทอม ${termLabel(term)}`, amount: amt, due_date: null, created_by: meId }], done);
    }
  };

  if (value === null)
    return (
      <button
        type="button"
        title="แก้ยอด"
        className={cn("rounded px-1 [font-family:inherit] hover:bg-foreground/10", !live.length && "text-muted-foreground")}
        onClick={(e) => (stop(e), setValue(current != null ? String(current) : ""))}
        onKeyDown={stop}
      >
        {shown}
      </button>
    );
  return (
    <Input
      autoFocus
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      aria-label="ยอดรวม"
      className="ml-auto h-7 w-28 text-right text-xs"
      value={value}
      disabled={create.isPending || update.isPending}
      onChange={(e) => setValue(e.target.value)}
      onClick={stop}
      onBlur={() => !(create.isPending || update.isPending) && setValue(null)}
      onKeyDown={(e) => {
        stop(e);
        if (e.key === "Enter") save();
        if (e.key === "Escape") setValue(null);
      }}
    />
  );
}

// ------------------------------------------------------- term amount sheet

function TermAmountSheet({
  termId,
  term,
  meId,
  targets,
  skipped,
  onClose,
}: {
  termId: string;
  term: Pick<AcademicTerm, "academic_year" | "term_type"> | null;
  meId: string;
  targets: string[];
  skipped: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: saved } = useTuitionTermAmount(termId);
  const setAmount = useSetTuitionTermAmount();
  const bulk = useBulkCreateTuitionInvoices();
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? (saved ? String(saved.amount) : "");
  const amt = Number(shown);

  const save = () =>
    setAmount.mutate(
      { term_id: termId, amount: amt, updated_by: meId },
      { onSuccess: () => (toast("บันทึกยอดค่าเทอมแล้ว"), setValue(null)), onError: (e) => toast(errMsg(e), "error") },
    );

  const createAll = () => {
    if (!saved || !window.confirm(`สร้างใบแจ้งหนี้ ${targets.length} ใบ ยอด ${formatBaht(saved.amount)} บาท\nข้าม ${skipped} คน (มีใบแจ้งหนี้แล้ว)`)) return;
    bulk.mutate(
      targets.map((student_id) => ({
        student_id,
        term_id: termId,
        title: `ค่าเทอม ${termLabel(term)}`,
        amount: saved.amount,
        due_date: null,
        created_by: meId,
      })),
      { onSuccess: () => (toast(`สร้างใบแจ้งหนี้ ${targets.length} ใบแล้ว`), onClose()), onError: (e) => toast(errMsg(e), "error") },
    );
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="ยอดเงินค่าเทอม" description={termLabel(term)} closable>
      <div className="space-y-4">
        <Field label="ยอดมาตรฐานต่อภาคเรียน (บาท)" required>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={shown} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">ใช้เติมยอดในฟอร์มสร้างใบแจ้งหนี้ ใบที่สร้างไปแล้วไม่เปลี่ยน</p>
        <Button onClick={save} disabled={!(amt > 0) || setAmount.isPending}>
          บันทึก
        </Button>
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs">
            นักเรียนตามตัวกรอง: สร้างได้ {targets.length} คน · ข้าม {skipped} คน (มีใบแจ้งหนี้แล้ว)
          </p>
          <Button variant="ghost" onClick={createAll} disabled={!saved || value !== null || targets.length === 0 || bulk.isPending}>
            สร้างใบแจ้งหนี้ให้นักเรียนที่กรองอยู่
          </Button>
          {!saved && <p className="text-xs text-muted-foreground">บันทึกยอดก่อนจึงจะสร้างใบแจ้งหนี้ได้</p>}
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ student sheet

type Mode = { kind: "list" } | { kind: "new" } | { kind: "pay"; invoice: TuitionInvoiceRow };

function StudentSheet({
  initialFile,
  student,
  termId,
  invoices,
  meId,
  onClose,
}: {
  initialFile: File | null;
  student: StudentListItem;
  termId: string;
  invoices: TuitionInvoiceRow[];
  meId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialFile ? { kind: "new" } : { kind: "list" });
  const cancel = useCancelTuitionInvoice();
  const voidPayment = useVoidTuitionPayment();
  const replace = useReplaceTuitionInvoiceFile();
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTo = useRef<TuitionInvoiceRow | null>(null);
  const back = () => setMode({ kind: "list" });
  const fail = (e: unknown) => toast(errMsg(e), "error");

  // Keep the pay form pointed at fresh data (balance) after a refetch.
  const payInvoice = mode.kind === "pay" ? (invoices.find((i) => i.id === mode.invoice.id) ?? mode.invoice) : null;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={nameOf(student)}
      description={student.student_code}
      closable
    >
      <input
        ref={replaceInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const invoice = replaceTo.current;
          if (!file || !invoice) return;
          replace.mutate({ invoice, file }, { onSuccess: () => toast("เปลี่ยนไฟล์แล้ว"), onError: fail });
        }}
      />
      {mode.kind === "new" && <NewInvoiceForm initialFile={initialFile} studentId={student.id} termId={termId} meId={meId} onDone={back} />}
      {payInvoice && <PaymentForm invoice={payInvoice} meId={meId} onDone={back} />}
      {mode.kind === "list" && (
        <div className="space-y-3">
          <Button onClick={() => setMode({ kind: "new" })}>
            <Plus className="size-4" /> อัปโหลดใบแจ้งหนี้
          </Button>
          {invoices.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีใบแจ้งหนี้ในภาคเรียนนี้</p>}
          {invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              inv={inv}
              actions={{
                onPay: () => setMode({ kind: "pay", invoice: inv }),
                onReplaceFile: () => {
                  replaceTo.current = inv;
                  replaceInput.current?.click();
                },
                onCancel: () => window.confirm("ยกเลิกใบแจ้งหนี้นี้?") && cancel.mutate(inv.id, { onError: fail }),
              }}
              onVoidPayment={(id) => {
                const reason = window.prompt("เหตุผลที่ยกเลิกใบเสร็จ");
                if (reason?.trim()) voidPayment.mutate({ id, reason: reason.trim() }, { onError: fail });
              }}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

function NewInvoiceForm({ initialFile, studentId, termId, meId, onDone }: { initialFile: File | null; studentId: string; termId: string; meId: string; onDone: () => void }) {
  const toast = useToast();
  const create = useCreateTuitionInvoice();
  const [title, setTitle] = useState("ค่าเล่าเรียน");
  const { data: termAmount } = useTuitionTermAmount(termId);
  const [typed, setTyped] = useState<string | null>(null);
  const amount = typed ?? (termAmount ? String(termAmount.amount) : "");
  const setAmount = setTyped;
  const [due, setDue] = useState("");
  const [file, setFile] = useState<File | null>(initialFile);
  const amt = Number(amount);

  const save = () =>
    file &&
    create.mutate(
      { student_id: studentId, term_id: termId, title: title.trim(), amount: amt, due_date: due || null, created_by: meId, file },
      { onSuccess: () => (toast("บันทึกใบแจ้งหนี้แล้ว"), onDone()), onError: (e) => toast(errMsg(e), "error") },
    );

  return (
    <div className="space-y-3">
      <Field label="ไฟล์ใบแจ้งหนี้ (PDF, ไม่เกิน 10 MB)" required>
        {file ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{file.name}</span>
            <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
              เลือกไฟล์ใหม่
            </Button>
          </div>
        ) : (
          <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        )}
      </Field>
      <Field label="รายการ" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="จำนวนเงิน (บาท)" required>
        <Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="วันครบกำหนด">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={save} disabled={!file || !title.trim() || !(amt > 0) || create.isPending}>
          บันทึก
        </Button>
        <Button variant="ghost" onClick={onDone}>
          ย้อนกลับ
        </Button>
      </div>
    </div>
  );
}

function PaymentForm({ invoice, meId, onDone }: { invoice: TuitionInvoiceRow; meId: string; onDone: () => void }) {
  const toast = useToast();
  const record = useRecordTuitionPayment();
  const balance = summarizeInvoice(invoice, invoice.tuition_payments, todayIso()).balance;
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<TuitionPaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const amt = Number(amount);

  const save = () =>
    record.mutate(
      { invoice_id: invoice.id, amount: amt, method, paid_at: paidAt, note: note.trim() || null, recorded_by: meId },
      { onSuccess: () => (toast("บันทึกการชำระแล้ว"), onDone()), onError: (e) => toast(errMsg(e), "error") },
    );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {invoice.title} · คงเหลือ {formatBaht(balance)}
      </p>
      <Field label="จำนวนเงิน (บาท)" required error={amt > balance ? "เกินยอดคงเหลือ" : undefined}>
        <Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="วิธีชำระ">
        <Select value={method} onChange={(e) => setMethod(e.target.value as TuitionPaymentMethod)}>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="วันที่ชำระ">
        <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </Field>
      <Field label="หมายเหตุ">
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={save} disabled={!(amt > 0) || amt > balance || record.isPending}>
          บันทึก
        </Button>
        <Button variant="ghost" onClick={onDone}>
          ย้อนกลับ
        </Button>
      </div>
    </div>
  );
}
