import { Button } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useMyCovers, useSetCoverStatus } from "@/hooks/useAttendanceCovers";

type Cover = NonNullable<ReturnType<typeof useMyCovers>["data"]>[number];

/** งานเช็คชื่อแทน: คำขอที่รอยืนยัน + งานของวันนี้ที่ยืนยันแล้ว (ใบลาต้อง approved ถึงเช็คได้) */
export function CoverTasks({
  today,
  covers,
  onCheck,
}: {
  today: string;
  covers: Cover[];
  onCheck: (c: Cover) => void;
}) {
  const toast = useToast();
  const respond = useSetCoverStatus();
  const pending = covers.filter((c) => c.status === "pending");
  const ready = covers.filter((c) => c.status === "confirmed" && c.date === today && c.leave_status === "approved");
  if (pending.length === 0 && ready.length === 0) return null;

  const answer = (id: string, status: "confirmed" | "declined") =>
    respond.mutate(
      { id, status },
      { onError: (e) => toast(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ", "error") },
    );

  return (
    <section className="mx-4 mb-3 space-y-2 rounded-2xl bg-muted/70 p-3 sm:mx-8">
      <h2 className="px-1 text-sm font-semibold">งานเช็คชื่อแทน</h2>
      <ul className="space-y-2">
        {pending.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              แทน {c.owner_name}: {c.label} <span className="text-muted-foreground">({c.date})</span>
            </span>
            <Button size="sm" disabled={respond.isPending} onClick={() => answer(c.id, "confirmed")}>
              ยืนยัน
            </Button>
            <Button size="sm" variant="outline" disabled={respond.isPending} onClick={() => answer(c.id, "declined")}>
              ปฏิเสธ
            </Button>
          </li>
        ))}
        {ready.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              วันนี้ แทน {c.owner_name}: {c.label}
            </span>
            <Button size="sm" onClick={() => onCheck(c)}>
              เช็คชื่อ
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
