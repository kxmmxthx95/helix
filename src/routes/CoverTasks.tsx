import { Button, Avatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useMyCovers, useSetCoverStatus } from "@/hooks/useAttendanceCovers";
import { avatarUrl } from "@/hooks/useAvatar";

type Cover = NonNullable<ReturnType<typeof useMyCovers>["data"]>[number];

const dateTh = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

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

  const row = (c: Cover, caption: string, actions: React.ReactNode) => (
    <li key={c.id} className="flex items-center gap-3 rounded-xl bg-card p-3">
      <Avatar
        name={c.owner_name}
        src={c.owner_avatar_path ? avatarUrl({ avatar_path: c.owner_avatar_path, updated_at: c.owner_updated_at ?? "" }) : null}
        className="h-11 w-11 text-sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{c.owner_name}</p>
        <p className="truncate text-sm text-muted-foreground">{c.label}</p>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">{actions}</div>
    </li>
  );

  return (
    <section className="mx-4 mb-3 space-y-2 rounded-2xl bg-muted/70 p-3 sm:mx-8">
      <h2 className="px-1 text-sm font-semibold">งานเช็คชื่อแทน</h2>
      <ul className="space-y-2">
        {pending.map((c) =>
          row(
            c,
            `รอยืนยัน · ${dateTh(c.date)}`,
            <>
              <Button size="sm" disabled={respond.isPending} onClick={() => answer(c.id, "confirmed")}>
                ยืนยัน
              </Button>
              <Button size="sm" variant="outline" disabled={respond.isPending} onClick={() => answer(c.id, "declined")}>
                ปฏิเสธ
              </Button>
            </>,
          ),
        )}
        {ready.map((c) =>
          row(
            c,
            "วันนี้",
            <Button size="sm" onClick={() => onCheck(c)}>
              เช็คชื่อ
            </Button>,
          ),
        )}
      </ul>
    </section>
  );
}
