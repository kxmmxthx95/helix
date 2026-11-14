import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BarcodeIcon, CheckmarkCircleIcon, KeyIcon, Search } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { avatarUrl, studentAvatarUrl } from "@/hooks/useAvatar";
import { useBindCard, useIssueQr, useIssueQrBulk, useCardHistory, useLiveCards, useLockCard, useRevokeCard } from "@/hooks/useCardTopup";
import { useAllGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useClassrooms } from "@/hooks/useStatusManagement";
import { useStudents, type StudentListItem } from "@/hooks/useStudents";
import type { CardHistoryRow, CardKind, LiveCard } from "@/lib/database.types";
import { canIssueBarcode, isOrgWide } from "@/lib/roles";
import { gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { cn } from "@/lib/utils";

// บัตรเติมเงิน — bind a physical barcode / RFID card to a student (migration 0152).
// The scanner is a USB keyboard wedge: it types the code then Enter, so a focused input is all that is needed.

const KINDS: { kind: CardKind; label: string; bindable: boolean }[] = [
  { kind: "qr", label: "บาร์โค้ดชำระเงิน", bindable: false }, // system-issued Code128 (card_issue_qr), the column + bulk button on this page
  { kind: "barcode", label: "บาร์โค้ดบัตร", bindable: false }, // legacy kind: the system barcode above already covers it
  { kind: "rfid", label: "RFID", bindable: true },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label])) as Record<CardKind, string>;
const ACTION_LABEL: Record<CardHistoryRow["action"], string> = { bind: "ผูกบัตร", revoke: "ยกเลิกบัตร", lock: "ล็อกบัตร", unlock: "ปลดล็อกบัตร" };

const cardState = (c: LiveCard) => (c.status === "active" ? "ใช้งานได้" : c.frozen_by === "school" ? "ล็อกโดยโรงเรียน" : "ผู้ปกครองระงับ");
const fmt = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
const fullName = (s: StudentListItem) => `${s.prefix ?? ""}${s.first_name} ${s.last_name}`;

export function StudentCards() {
  const { profile: me } = useAuth();
  const [search, setSearch] = useState("");
  const [deptPick, setDeptPick] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [picked, setPicked] = useState<StudentListItem | null>(null);
  const open = setPicked;

  const scoped = !!me && !isOrgWide(me.roles);
  const departmentId = scoped ? (me.department_id ?? "") : deptPick;
  const { data: departments = [] } = useDepartments();
  const { data: grades = [] } = useAllGradeLevels();
  const { data: classrooms = [] } = useClassrooms(gradeLevelId || null);
  const searched = search.trim() !== "" || departmentId !== "" || gradeLevelId !== "";
  const { data: students, isLoading } = useStudents({ search, departmentId, status: "studying", gradeLevelId, classroomId });
  const { data: cards } = useLiveCards();
  const toast = useToast();
  const issueQr = useIssueQr();
  const issueBulk = useIssueQrBulk();
  const [bulkOpen, setBulkOpen] = useState(false);
  const missingQr = (students ?? []).filter((s) => !cards?.get(s.id)?.some((c) => c.kind === "qr"));
  const issue = (id: string) =>
    issueQr.mutate(id, {
      onSuccess: () => toast("สร้างบาร์โค้ดสำเร็จ"),
      onError: (e) => toast(e instanceof Error ? e.message : "สร้างบาร์โค้ดไม่สำเร็จ", "error"),
    });

  if (!me || !canIssueBarcode(me.roles)) return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  const shown = (departmentId ? grades.filter((g) => g.department_id === departmentId) : grades);

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const gradeName = new Map(grades.map((g) => [g.id, gradeShortLabel(g.code)]));
  const avatar = (s: StudentListItem) => studentAvatarUrl(s) ?? (s.profile ? avatarUrl(s.profile) : null);
  const chips = (id: string) => (
    <div className="flex flex-wrap gap-1">
      {(cards?.get(id) ?? []).map((c) => (
        <span key={c.id} className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", c.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          {KIND_LABEL[c.kind]}
        </span>
      ))}
      {!cards?.get(id)?.length && <span className="text-xs text-muted-foreground">ยังไม่มีบัตร</span>}
    </div>
  );
  const levelChip = (s: StudentListItem) => {
    const g = s.grade_level_id ? gradeName.get(s.grade_level_id) : undefined;
    return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${levelTone(g)}`}>{g ?? "—"}</span>;
  };

  return (
    <div className="page-fill page-flush min-h-0 pb-5 lg:h-[calc(100dvh-7.5rem)]">
      <div className="toolbar shrink-0">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรหัสนักเรียน" className="pl-9" type="search" />
        </div>
        {!scoped && (
          <Select value={deptPick} onChange={(e) => (setDeptPick(e.target.value), setGradeLevelId(""), setClassroomId(""))} placeholder="ทุกแผนก" className="w-40">
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        )}
        <Select value={gradeLevelId} onChange={(e) => (setGradeLevelId(e.target.value), setClassroomId(""))} placeholder="ทุกระดับชั้น" className="w-36">
          {shown.map((g) => <option key={g.id} value={g.id}>{gradeShortLabel(g.code)}</option>)}
        </Select>
        <Select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} placeholder="ทุกห้อง" className="w-32" disabled={!gradeLevelId}>
          {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button variant="outline" size="icon" className="shrink-0" onClick={() => setBulkOpen(true)} disabled={!students?.length} aria-label="สร้างบาร์โค้ดทุกคน">
          <BarcodeIcon className="h-3 w-3" />
        </Button>
      </div>

      {!searched && <EmptyState title="ค้นหานักเรียน" description="พิมพ์ชื่อหรือรหัสนักเรียน หรือเลือกตัวกรองเพื่อแสดงรายชื่อ" />}
      {searched && isLoading && <Skeleton className="h-40 w-full" />}
      {searched && students && students.length === 0 && <EmptyState title="ไม่พบข้อมูล" description="ไม่พบนักเรียนตามเงื่อนไขที่เลือก" />}

      {searched && students && students.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2 lg:min-h-0 lg:flex-1 lg:shrink">
          <ul className="space-y-2 lg:hidden">
            {students.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => open(s)} className="w-full rounded-xl bg-card p-3.5 text-left shadow-card transition-colors active:bg-muted">
                  <div className="flex items-start gap-3">
                    <Avatar name={fullName(s)} src={avatar(s)} className="h-11 w-11 text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{fullName(s)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{s.student_code}</span>
                        {levelChip(s)}
                      </div>
                      <div className="mt-2">{chips(s.id)}</div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="table-panel hidden rounded-none border-t border-border shadow-none lg:flex">
            <div className="table-panel-scroll scrollbar-hidden">
              <table className="w-full text-[13px]">
                <thead className="text-left text-xs">
                  <tr>
                    <th className="px-4 py-3">นักเรียน</th>
                    <th className="px-4 py-3">แผนก</th>
                    <th className="px-4 py-3">ชั้น</th>
                    <th className="px-4 py-3">บัตร</th>
                    <th className="px-4 py-3">บาร์โค้ด</th>
                    <th className="px-4 py-3">RFID</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} onClick={() => open(s)} className="h-14 cursor-pointer border-t border-border first:border-t-0">
                      <td className="px-4 py-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={fullName(s)} src={avatar(s)} className="h-9 w-9 text-xs" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{s.prefix && `${s.prefix} `}{s.first_name} {s.last_name}</p>
                            <p className="font-mono text-xs tabular-nums text-muted-foreground">{s.student_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-0 text-muted-foreground">{deptName.get(s.department_id) ?? "—"}</td>
                      <td className="px-4 py-0">{levelChip(s)}</td>
                      <td className="px-4 py-0">{chips(s.id)}</td>
                      <td className="px-4 py-0">
                        {(() => {
                          const qr = cards?.get(s.id)?.find((c) => c.kind === "qr");
                          return qr ? (
                            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", qr.status === "active" ? "text-success" : "text-warning")}>
                              <CheckmarkCircleIcon className="size-3.5" />
                              {qr.status === "active" ? "สร้างแล้ว" : "สร้างแล้ว (ระงับ)"}
                            </span>
                          ) : (
                            <Button variant="tinted" size="sm" disabled={issueQr.isPending} onClick={(e) => (e.stopPropagation(), issue(s.id))}>
                              สร้างบาร์โค้ด
                            </Button>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-0">
                        {(() => {
                          const rfid = cards?.get(s.id)?.find((c) => c.kind === "rfid");
                          return rfid ? (
                            <span className={cn("text-xs font-medium", rfid.status === "active" ? "text-success" : "text-destructive")}>…{rfid.last4} · {cardState(rfid)}</span>
                          ) : (
                            <Button variant="tinted" size="sm" onClick={(e) => (e.stopPropagation(), open(s))}>
                              <KeyIcon className="h-3 w-3" />
                              ผูกบัตร RFID
                            </Button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="สร้างบาร์โค้ดทุกคน"
        description="ตามรายชื่อที่กรองอยู่ในหน้านี้"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBulkOpen(false)}>ยกเลิก</Button>
            <Button
              className="flex-1"
              disabled={missingQr.length === 0 || issueBulk.isPending}
              onClick={() =>
                issueBulk.mutate(missingQr.map((r) => r.id), {
                  onSuccess: (n) => (toast(`สร้างบาร์โค้ด ${n} คน`), setBulkOpen(false)),
                  onError: (e) => toast(e instanceof Error ? e.message : "สร้างบาร์โค้ดไม่สำเร็จ", "error"),
                })
              }
            >
              {issueBulk.isPending ? <Spinner /> : `สร้าง ${missingQr.length} คน`}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {missingQr.length > 0 ? `จะสร้างบาร์โค้ดให้ ${missingQr.length} คนที่ยังไม่มี คนที่มีอยู่แล้วจะไม่ถูกเปลี่ยน` : "ทุกคนในรายการนี้มีบาร์โค้ดแล้ว"}
        </p>
      </Modal>

      <Sheet open={!!picked} onOpenChange={(o) => !o && setPicked(null)} title={picked ? fullName(picked) : ""} description={picked?.student_code}>
        {picked && <StudentCardsPanel key={picked.id} student={picked} cards={cards?.get(picked.id) ?? []} />}
      </Sheet>
    </div>
  );
}

function StudentCardsPanel({ student, cards }: { student: StudentListItem; cards: LiveCard[] }) {
  const toast = useToast();
  const bind = useBindCard();
  const revoke = useRevokeCard();
  const lock = useLockCard();
  const { data: history } = useCardHistory(student.id);
  const kind = "rfid" as const;
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const done = (msg: string) => ({ onSuccess: () => toast(msg), onError: (e: unknown) => toast(e instanceof Error ? e.message : "ไม่สำเร็จ", "error") });

  const submit = () => {
    const uid = code.trim();
    if (!uid) return;
    bind.mutate({ student_id: student.id, card_uid: uid, kind }, {
      ...done("ผูกบัตรสำเร็จ"),
      onSettled: () => (setCode(""), input.current?.focus()),
    });
  };
  const ask = (msg: string, run: () => void) => confirm(msg) && run();

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold">บัตรที่ใช้งานอยู่</h3>
        {cards.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีบัตร</p>}
        {cards.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl bg-card p-3 shadow-card">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{KIND_LABEL[c.kind]} <span className="font-normal text-muted-foreground">…{c.last4}</span></p>
              <p className={cn("text-xs", c.status === "active" ? "text-success" : "text-destructive")}>{cardState(c)}</p>
            </div>
            {c.status === "frozen" ? (
              <Button size="sm" variant="outline" onClick={() => lock.mutate({ id: c.id, locked: false }, done("ปลดล็อกแล้ว"))}>ปลดล็อก</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => lock.mutate({ id: c.id, locked: true }, done("ล็อกบัตรแล้ว"))}>ล็อก</Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => ask(`ยกเลิกบัตร ${KIND_LABEL[c.kind]} …${c.last4}? บัตรนี้จะใช้จ่ายไม่ได้อีก`, () => revoke.mutate(c.id, done("ยกเลิกบัตรแล้ว")))}>ยกเลิก</Button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold">ผูกบัตร RFID</h3>
        <form onSubmit={(e) => (e.preventDefault(), submit())} className="flex gap-2">
          <Input ref={input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="สแกนหรือพิมพ์เลขบัตร แล้วกด Enter" autoFocus autoComplete="off" />
          <Button type="submit" disabled={!code.trim() || bind.isPending}>ผูก</Button>
        </form>
        {cards.some((c) => c.kind === kind) && <p className="text-xs text-muted-foreground">มี{KIND_LABEL[kind]}อยู่แล้ว — ผูกใหม่จะแทนที่ใบเดิม</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold">ประวัติ</h3>
        {history?.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ</p>}
        {history?.map((h, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            {fmt(h.at)} · <span className="text-foreground">{ACTION_LABEL[h.action]}</span> {KIND_LABEL[h.kind]} …{h.last4} · {h.actor ?? "ระบบ"}
          </p>
        ))}
      </section>
    </div>
  );
}
