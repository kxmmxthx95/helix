import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { FileUp, Plus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Pagination, Select, Skeleton } from "@/components/ui";
import { useAcademicTerms } from "@/hooks/useAcademicTerms";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import { useStudents, type StudentListItem } from "@/hooks/useStudents";
import {
  tuitionInvoiceFileUrl,
  useCancelTuitionInvoice,
  useCreateTuitionInvoice,
  useRecordTuitionPayment,
  useReplaceTuitionInvoiceFile,
  useTuitionInvoices,
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
      <button className="font-ui text-xs underline" onClick={() => void openFile()}>
        ดูไฟล์ใบแจ้งหนี้ (PDF)
      </button>
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

function StaffView({ meId }: { meId: string }) {
  const [deptId, setDeptId] = useState("");
  const [termId, setTermId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StudentTuitionState | "">("");
  const [open, setOpen] = useState<StudentListItem | null>(null);
  // Row upload icon: the PDF picked there opens that student's sheet straight on the new-invoice form.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const pickInput = useRef<HTMLInputElement>(null);
  const pickFor = useRef<StudentListItem | null>(null);

  const { data: departments = [] } = useDepartments();
  const { data: terms = [] } = useAcademicTerms(deptId || null);
  const { data: grades = [] } = useGradeLevels(deptId || null);
  const { data: students = [], isLoading: loadingStudents } = useStudents({
    search,
    departmentId: deptId,
    status: "studying",
    gradeLevelId: gradeId || undefined,
  });
  const { data: invoices = [], isLoading: loadingInvoices } = useTuitionInvoices(termId || null);

  const today = todayIso();
  const rows = useMemo(() => {
    const byStudent = new Map<string, TuitionInvoiceRow[]>();
    for (const inv of invoices) byStudent.set(inv.student_id, [...(byStudent.get(inv.student_id) ?? []), inv]);
    return students.map((s) => ({
      student: s,
      ...summarizeStudent(
        (byStudent.get(s.id) ?? []).map((i) => ({ invoice: i, payments: i.tuition_payments })),
        today,
      ),
    }));
  }, [students, invoices, today]);

  const counts = STATE_ORDER.map((st) => ({ st, n: rows.filter((r) => r.state === st).length }));
  const shown = stateFilter ? rows.filter((r) => r.state === stateFilter) : rows;
  const { page, setPage, pageCount, pageRows } = usePagination(shown, [deptId, termId, gradeId, search, stateFilter]);
  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? "—";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={deptId}
            onChange={(e) => {
              setDeptId(e.target.value);
              setTermId("");
              setGradeId("");
            }}
            aria-label="แผนก"
            placeholder="เลือกแผนก"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="ภาคเรียน" placeholder="เลือกภาคเรียน" disabled={!deptId}>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {termLabel(t)}
              </option>
            ))}
          </Select>
          <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)} aria-label="ชั้น" placeholder="ทุกชั้น" disabled={!deptId}>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
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
        <div className="sm:col-span-2 lg:col-span-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรหัสนักเรียน" aria-label="ค้นหา" disabled={!deptId} />
        </div>
      </div>

      {!deptId || !termId ? (
        <EmptyState title="เลือกแผนกและภาคเรียน" description="เพื่อดูรายชื่อนักเรียนและใบแจ้งหนี้ค่าเทอม" />
      ) : loadingStudents || loadingInvoices ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="ไม่พบนักเรียน" description="ไม่พบนักเรียนที่กำลังศึกษาตามเงื่อนไขที่เลือก" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {counts.map(({ st, n }) => (
              <span key={st} className={cn("rounded-full border border-border px-3 py-1", st === "overdue" && n > 0 && "text-destructive")}>
                {STUDENT_TUITION_LABEL[st]} {n}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัส</th>
                  <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2 font-medium">ชั้น</th>
                  <th className="px-3 py-2 text-right font-medium">ใบแจ้งหนี้</th>
                  <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                  <th className="px-3 py-2 text-right font-medium">ค้างชำระ</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ student: s, count, total, outstanding, state }) => (
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
                    <td className="px-3 py-0 text-right">{count}</td>
                    <td className="px-3 py-0 text-right">{count ? formatBaht(total) : "—"}</td>
                    <td className="px-3 py-0 text-right">{count ? formatBaht(outstanding) : "—"}</td>
                    <td className={cn("px-3 py-0 font-ui font-semibold", state === "overdue" && "text-destructive", state === "paid" && "text-accent")}>
                      {STUDENT_TUITION_LABEL[state]}
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
  const [amount, setAmount] = useState("");
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
