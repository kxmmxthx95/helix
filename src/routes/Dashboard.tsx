import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/components/ui";
import { roleLabels } from "@/lib/roles";

export function Dashboard() {
  const { profile } = useAuth();

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted-foreground">สิทธิ์การใช้งาน</p>
        <p className="text-lg font-semibold">{profile && roleLabels(profile.roles)}</p>
      </Card>
      {/* Stat tiles land here once the dashboard design is settled. */}
    </div>
  );
}
