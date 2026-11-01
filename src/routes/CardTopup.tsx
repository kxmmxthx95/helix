import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card } from "@/components/ui";
import { isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { CardsTab, TerminalsTab } from "@/routes/CardTopupAdmin";
import { PortalView } from "@/routes/CardTopupPortal";
import { PosTab } from "@/routes/CardTopupPos";
import { RegisterTab } from "@/routes/CardTopupRegister";
import { ReportTab } from "@/routes/CardTopupReport";
import { SlipsTab } from "@/routes/CardTopupSlips";

const TABS = [
  { key: "cards", label: "บัตรและยอดคงเหลือ" },
  { key: "register", label: "ลงทะเบียนบัตร" },
  { key: "slips", label: "อนุมัติสลิป" },
  { key: "report", label: "รายงาน" },
  { key: "terminals", label: "เครื่องขาย" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// บัตรเติมเงิน — see migration 0107. Cashier sees only ขาย; org-wide sees every tab.
export function CardTopup() {
  const { profile: me } = useAuth();
  const [tab, setTab] = useState<Tab>("cards");
  const [managing, setManaging] = useState(false);
  if (!me) return null;
  const orgWide = isOrgWide(me.roles);
  const self = me.roles.includes("parent") || me.roles.includes("student");
  if (self && !orgWide) return <PortalView canAct={me.roles.includes("parent")} />;
  if (!orgWide && !me.roles.includes("cashier")) return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  if (!orgWide) return <PosTab orgWide={false} />;
  // Org-wide opens on the full-screen POS too; the admin tabs sit behind "จัดการ".
  if (!managing) return <PosTab orgWide onManage={() => setManaging(true)} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <Button variant="outline" size="sm" onClick={() => setManaging(false)}>
          ← กลับหน้าขาย
        </Button>
      </div>
      <div role="tablist" aria-label="บัตรเติมเงิน" className="flex border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "tappable -mb-px min-h-10 flex-1 whitespace-nowrap border-b-2 px-2 text-[13px] font-semibold transition-colors",
              tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "cards" && <CardsTab />}
      {tab === "register" && <RegisterTab />}
      {tab === "slips" && <SlipsTab />}
      {tab === "report" && <ReportTab />}
      {tab === "terminals" && <TerminalsTab />}
    </div>
  );
}
