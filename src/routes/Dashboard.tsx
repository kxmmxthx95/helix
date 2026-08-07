import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/roles";

export function Dashboard() {
  const { profile } = useAuth();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">สวัสดี {profile?.full_name}</h2>
      <Card>
        <p className="text-sm text-muted-foreground">สิทธิ์การใช้งาน</p>
        <p className="text-lg font-semibold">{profile && ROLE_LABEL[profile.role]}</p>
      </Card>
      {/* Stat tiles land here once the dashboard design is settled. */}
    </div>
  );
}
