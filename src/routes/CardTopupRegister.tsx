import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, Input, Select } from "@/components/ui";
import { useBindCard, useLiveCards } from "@/hooks/useCardTopup";
import { useAllGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useStudents, type StudentFilters } from "@/hooks/useStudents";
import { useClassrooms } from "@/hooks/useStatusManagement";
import { parseSwipe } from "@/lib/cardSwipe";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { cn } from "@/lib/utils";

type CardFilter = "unbound" | "bound" | "frozen" | "all";
const EMPTY: StudentFilters = { search: "", departmentId: "", status: "studying", gradeLevelId: "", classroomId: "" };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "ผูกบัตรไม่สำเร็จ");

/** ลงทะเบียนบัตร — filter a roster, then swipe cards down the queue of students with no card yet. */
export function RegisterTab() {
  const toast = useToast();
  const [filters, setFilters] = useState<StudentFilters>(EMPTY);
  const [cardFilter, setCardFilter] = useState<CardFilter>("unbound");
  const [picked, setPicked] = useState<string | null>(null);
  const [uid, setUid] = useState("");

  const { data: departments = [] } = useDepartments();
  const { data: allGradeLevels = [] } = useAllGradeLevels();
  const { data: classrooms = [] } = useClassrooms(filters.gradeLevelId || null);
  const { data: students = [], isLoading } = useStudents(filters);
  const { data: cards = [] } = useLiveCards();
  const bind = useBindCard();

  const gradeLevels = filters.departmentId ? allGradeLevels.filter((g) => g.department_id === filters.departmentId) : allGradeLevels;
  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const gradeName = useMemo(() => new Map(allGradeLevels.map((g) => [g.id, gradeShortLabel(g.code)])), [allGradeLevels]);
  const cardOf = useMemo(() => new Map(cards.map((c) => [c.student_id, c])), [cards]);
  const boundIds = useMemo(() => new Set(cardOf.keys()), [cardOf]);

  const rows = students.filter((s) => {
    const c = cardOf.get(s.id);
    return cardFilter === "all" || (cardFilter === "unbound" ? !c : cardFilter === "bound" ? !!c : c?.status === "frozen");
  });
  const boundCount = students.filter((s) => boundIds.has(s.id)).length;

  const target = rows.find((r) => r.id === picked) ?? null;
  const targetCard = target ? cardOf.get(target.id) : undefined;

  async function submit() {
    const value = parseSwipe(uid);
    setUid("");
    if (!value || !target) return;
    try {
      await bind.mutateAsync({ student_id: target.id, card_uid: value });
      toast(`ผูกบัตรให้ ${target.first_name} ${target.last_name} แล้ว`);
      setPicked(null);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  const set = (patch: Partial<StudentFilters>) => setFilters({ ...filters, ...patch });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Input type="search" value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder="ค้นหาชื่อหรือรหัส" />
          <Select value={filters.departmentId} onChange={(e) => set({ departmentId: e.target.value, gradeLevelId: "", classroomId: "" })}>
            <option value="">ทุกแผนก</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select value={filters.gradeLevelId} onChange={(e) => set({ gradeLevelId: e.target.value, classroomId: "" })}>
            <option value="">ทุกระดับชั้น</option>
            {gradeLevels.map((g) => <option key={g.id} value={g.id}>{gradeShortLabel(g.code)}</option>)}
          </Select>
          <Select value={filters.classroomId} onChange={(e) => set({ classroomId: e.target.value })} disabled={!filters.gradeLevelId}>
            <option value="">ทุกห้อง</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={cardFilter} onChange={(e) => setCardFilter(e.target.value as CardFilter)}>
            <option value="unbound">ยังไม่ผูกบัตร</option>
            <option value="bound">ผูกแล้ว</option>
            <option value="frozen">ระงับ</option>
            <option value="all">ทั้งหมด</option>
          </Select>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">ผูกแล้ว {boundCount} / {students.length}</p>
      </div>

      {isLoading ? null : rows.length === 0 ? (
        <EmptyState title="ไม่พบนักเรียน" description="ลองเปลี่ยนตัวกรอง" />
      ) : (
        <div className="table-panel flex min-h-0 flex-1">
          <div className="table-panel-scroll scrollbar-hidden">
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">แผนก</th>
                  <th className="px-4 py-3">ชั้น</th>
                  <th className="px-4 py-3">สถานะบัตร</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const c = cardOf.get(s.id);
                  return (
                    <tr
                      key={s.id}
                      className="h-11 border-t border-border first:border-t-0"
                    >
                      <td className="px-4 py-0 font-mono tabular-nums">{s.student_code}</td>
                      <td className="px-4 py-0">{s.prefix ?? ""}{s.first_name} {s.last_name}</td>
                      <td className="px-4 py-0 text-muted-foreground">{deptName.get(s.department_id) ?? "—"}</td>
                      <td className="px-4 py-0 text-muted-foreground">{(s.grade_level_id && gradeName.get(s.grade_level_id)) || "—"}</td>
                      <td className="px-4 py-0">
                        <button type="button" onClick={() => setPicked(s.id)} aria-label="ผูกบัตร">
                          {c ? (
                            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", c.status === "frozen" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
                              {c.status === "frozen" ? "ระงับ" : "ผูกแล้ว"} · …{c.card_uid.slice(-4)}
                            </span>
                          ) : (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">ยังไม่ผูก</span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Modal
        open={!!target}
        onOpenChange={(o) => !o && (setPicked(null), setUid(""))}
        title={targetCard ? "เปลี่ยนบัตร" : "ผูกบัตร"}
        description={target ? `${target.prefix ?? ""}${target.first_name} ${target.last_name} (${target.student_code})` : undefined}
      >
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void submit())}>
          {targetCard && <p className="text-xs text-muted-foreground">บัตรปัจจุบัน …{targetCard.card_uid.slice(-4)} จะใช้ไม่ได้อีกหลังผูกใบใหม่</p>}
          <Input autoFocus value={uid} onChange={(e) => setUid(e.target.value)} autoComplete="off" placeholder="รูดบัตรที่นี่" />
          <Button type="submit" className="w-full" disabled={!uid.trim() || bind.isPending}>
            {targetCard ? "เปลี่ยนบัตร" : "ผูกบัตร"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
