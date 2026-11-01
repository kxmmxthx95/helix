import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { useBindCard, useLiveCards } from "@/hooks/useCardTopup";
import { useAllGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments } from "@/hooks/useProfiles";
import { useStudents, type StudentFilters } from "@/hooks/useStudents";
import { useClassrooms } from "@/hooks/useStatusManagement";
import { parseSwipe } from "@/lib/cardSwipe";
import { nextUnbound } from "@/lib/cardTopup";
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
  // Explicit pick from a click; `replace` only after the user confirmed swapping an existing card.
  const [picked, setPicked] = useState<{ id: string; replace: boolean } | null>(null);
  const [uid, setUid] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

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

  // Target = the clicked row if still listed, else the first student with no card.
  const clicked = picked && rows.find((r) => r.id === picked.id);
  const target = clicked ?? rows.find((r) => r.id === nextUnbound(rows, boundIds));
  const replacing = !!clicked && picked!.replace;

  function pick(id: string) {
    if (cardOf.has(id)) {
      if (!confirm("เปลี่ยนบัตร? บัตรใบเดิมจะใช้ไม่ได้อีก")) return;
      setPicked({ id, replace: true });
    } else setPicked({ id, replace: false });
    scanRef.current?.focus();
  }

  async function submit() {
    const value = parseSwipe(uid);
    setUid("");
    if (!value || !target) return;
    try {
      await bind.mutateAsync({ student_id: target.id, card_uid: value });
      toast(`ผูกบัตรให้ ${target.first_name} ${target.last_name} แล้ว`);
      const next = nextUnbound(rows, boundIds, target.id);
      setPicked(next ? { id: next, replace: false } : null);
    } catch (e) {
      toast(errMsg(e), "error");
    }
    scanRef.current?.focus();
  }

  const set = (patch: Partial<StudentFilters>) => (setFilters({ ...filters, ...patch }), setPicked(null));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
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
          <Select value={cardFilter} onChange={(e) => (setCardFilter(e.target.value as CardFilter), setPicked(null))}>
            <option value="unbound">ยังไม่ผูกบัตร</option>
            <option value="bound">ผูกแล้ว</option>
            <option value="frozen">ระงับ</option>
            <option value="all">ทั้งหมด</option>
          </Select>
          <Input type="search" value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder="ค้นหาชื่อหรือรหัส" />
        </div>
        <form className="flex items-end gap-2" onSubmit={(e) => (e.preventDefault(), void submit())}>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs text-muted-foreground">
              {target ? (
                <>
                  {replacing ? "เปลี่ยนบัตรให้" : "รูดบัตรให้"}{" "}
                  <b className="text-sm text-foreground">{target.prefix ?? ""}{target.first_name} {target.last_name}</b> ({target.student_code})
                </>
              ) : (
                "ไม่มีนักเรียนที่ต้องผูกบัตรในรายการนี้"
              )}
            </p>
            <Input ref={scanRef} autoFocus value={uid} onChange={(e) => setUid(e.target.value)} autoComplete="off" disabled={!target} placeholder="รูดบัตรที่นี่" />
          </div>
          <Button type="submit" disabled={!uid.trim() || !target || bind.isPending}>ผูกบัตร</Button>
          <p className="shrink-0 pb-2 text-sm tabular-nums text-muted-foreground">ผูกแล้ว {boundCount} / {students.length}</p>
        </form>
      </Card>

      {isLoading ? null : rows.length === 0 ? (
        <EmptyState title="ไม่พบนักเรียน" description="ลองเปลี่ยนตัวกรอง" />
      ) : (
        <div className="table-panel flex min-h-0 flex-1">
          <div className="table-panel-scroll">
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
                      onClick={() => pick(s.id)}
                      className={cn("h-11 cursor-pointer border-t border-border first:border-t-0", target?.id === s.id && "bg-accent/10")}
                    >
                      <td className="px-4 py-0 font-mono tabular-nums">{s.student_code}</td>
                      <td className="px-4 py-0">{s.prefix ?? ""}{s.first_name} {s.last_name}</td>
                      <td className="px-4 py-0 text-muted-foreground">{deptName.get(s.department_id) ?? "—"}</td>
                      <td className="px-4 py-0 text-muted-foreground">{(s.grade_level_id && gradeName.get(s.grade_level_id)) || "—"}</td>
                      <td className="px-4 py-0">
                        {c ? (
                          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", c.status === "frozen" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
                            {c.status === "frozen" ? "ระงับ" : "ผูกแล้ว"} · …{c.card_uid.slice(-4)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">ยังไม่ผูก</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
