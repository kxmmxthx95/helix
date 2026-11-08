import { Sheet } from "@/components/Sheet";
import { clockHoliday } from "@/hooks/useTimeClock";
import { useStaffAttendanceRange } from "@/hooks/useStaffAttendance";
import { AttendanceMonthView } from "@/routes/Dashboard";
import type { ProfileWithRoles } from "@/lib/database.types";

/** "ดูสถิติ" on the staff clock-in card: month calendar of มา/สาย/ขาด/ลา, same look as the student's check-in panel. */
export function StaffClockStatsSheet({ open, onOpenChange, me }: { open: boolean; onOpenChange: (o: boolean) => void; me: ProfileWithRoles }) {
  const useMine = (start: string, end: string) => {
    const q = useStaffAttendanceRange(start, end);
    return { data: q.data?.filter((r) => r.profile_id === me.id), isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="สถิติเข้างาน" closable bottomOnPhone>
      <AttendanceMonthView
        departmentId={me.department_id}
        useRecords={useMine}
        holiday={(iso, events) => clockHoliday(iso, events.filter((e) => e.start_date <= iso && iso <= e.end_date), me.department_id)}
      />
    </Sheet>
  );
}
