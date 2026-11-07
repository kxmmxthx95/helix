import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/components/ui";
import { isOrgWide } from "@/lib/roles";
import { PortalView } from "@/routes/CardTopupPortal";
import { PosTab } from "@/routes/CardTopupPos";

// บัตรเติมเงิน — see migration 0107. Cashier sees only ขาย; org-wide sees every tab.
export function CardTopup() {
  const { profile: me } = useAuth();
  if (!me) return null;
  const orgWide = isOrgWide(me.roles);
  const self = me.roles.includes("parent") || me.roles.includes("student");
  if (self && !orgWide) return <PortalView canAct={me.roles.includes("parent")} />;
  if (!orgWide && !me.roles.includes("cashier")) return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  if (!orgWide) return <PosTab orgWide={false} />;
  // Org-wide gets a sidebar inside the POS for slips / report / products / terminals.
  return <PosTab orgWide />;
}
