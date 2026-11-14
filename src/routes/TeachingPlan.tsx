import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronForward } from "@/components/icons";
import { PlanProgress, useAssignmentLabel } from "@/components/TeachingPlanParts";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { useAssignmentProgress } from "@/hooks/useTeachingPlanSlots";
import { canManageAcademic } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { TeachingPlanOverview } from "@/routes/TeachingPlanOverview";

const TABS = [
  { id: "mine", label: "แผนของฉัน" },
  { id: "overview", label: "ภาพรวม" },
] as const;

export function TeachingPlan() {
  const { profile: me } = useAuth();
  const [params, setParams] = useSearchParams();
  if (!me) return null;
  if (!canManageAcademic(me.roles)) return <MyTeachingPlan />;
  const tab = params.get("tab") === "mine" ? "mine" : "overview";
  return (
    <div className="page-fill">
      <div className="flex shrink-0 gap-0 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cn(
              "inline-flex h-8 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
              tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "mine" ? <MyTeachingPlan /> : <TeachingPlanOverview />}
    </div>
  );
}

function MyTeachingPlan() {
  const { profile: me } = useAuth();
  const navigate = useNavigate();
  const departmentId = me?.department_id ?? null;
  const { data: assignments = [], isLoading } = useMyTeachingAssignments(me?.id ?? null);
  const label = useAssignmentLabel(departmentId);
  const { progress } = useAssignmentProgress(assignments, departmentId);

  const nextText = (p: ReturnType<typeof progress.get>) =>
    !p || p.stats.total === 0
      ? "ยังไม่มีคาบสอนในภาคเรียนนี้"
      : p.next
        ? `คาบถัดไป: ${new Date(`${p.next.slot_date}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" })} คาบ ${p.next.period_no}`
        : p.stats.planned === 0
          ? "ยังไม่ได้วางหัวข้อ"
          : "ไม่มีคาบที่วางแผนไว้ข้างหน้า";

  if (!me) return null;
  if (!isLoading && assignments.length === 0) {
    return (
      <div className="page-fill">
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีวิชาที่ได้รับมอบหมาย" description="ติดต่อผู้ดูแลเพื่อมอบหมายภาระงานสอน" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-fill">
      <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto md:hidden">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <Card key={i} role="status" aria-label="กำลังโหลด" className="space-y-2 p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-1.5 w-full" />
              </Card>
            ))
          : assignments.map((a) => {
              const l = label(a);
              const p = progress.get(a.id);
              return (
                <Link
                  key={a.id}
                  to={`/teaching-plan/${a.id}`}
                  className="block rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-fill px-1.5 py-0.5 text-[11px] font-medium tabular-nums">{l.code}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {l.where}
                      <ChevronForward className="h-3 w-3" />
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold leading-snug">{l.name}</p>
                  {p && <PlanProgress stats={p.stats} className="mt-2" />}
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">{nextText(p)}</p>
                </Link>
              );
            })}
      </div>

      <div className="table-panel hidden rounded-none border-t border-border shadow-none md:flex">
        <div className="table-panel-scroll scrollbar-hidden">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs">
              <tr>
                <th className="px-4 py-3">วิชา</th>
                <th className="px-4 py-3">ชั้น</th>
                <th className="px-4 py-3">ห้อง</th>
                <th className="px-4 py-3 text-center">ความคืบหน้า</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [0, 1, 2].map((i) => (
                    <tr key={i} role="status" aria-label="กำลังโหลด" className="h-14 border-t border-border first:border-t-0">
                      {["w-40", "w-24", "w-12", "w-48", "w-32"].map((w, j) => (
                        <td key={j} className="px-4 py-0">
                          <Skeleton className={`h-3 ${w}`} />
                        </td>
                      ))}
                      <td />
                    </tr>
                  ))
                : assignments.map((a) => {
                    const l = label(a);
                    const p = progress.get(a.id);
                    return (
                      <tr
                        key={a.id}
                        onClick={() => navigate(`/teaching-plan/${a.id}`)}
                        className="h-14 cursor-pointer border-t border-border first:border-t-0"
                      >
                        <td className="px-4 py-0">
                          <Link
                            to={`/teaching-plan/${a.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block min-w-0"
                          >
                            <p className="truncate text-sm font-medium">{l.name}</p>
                            <p className="font-mono text-xs tabular-nums text-muted-foreground">{l.code}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-0">
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">{l.grade}</span>
                        </td>
                        <td className="px-4 py-0 text-muted-foreground">{l.room}</td>
                        <td className="px-4 py-0">{p && <PlanProgress stats={p.stats} className="mx-auto w-40 flex-col gap-1.5 [&>div]:w-full [&>div]:flex-none" />}</td>
                        <td className="px-4 py-0 text-xs text-muted-foreground">{nextText(p)}</td>
                        <td className="px-4 py-0 text-muted-foreground">
                          <ChevronForward className="h-3 w-3" />
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
