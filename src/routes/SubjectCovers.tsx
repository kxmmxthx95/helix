import { useRef, useState } from "react";
import { Plus } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Input, Skeleton, Spinner } from "@/components/ui";
import {
  libraryCoverUrl,
  useDeleteCover,
  useRenameCover,
  useReplaceCover,
  useSubjectCoverLibrary,
  useUploadCovers,
  type CoverWithUsage,
} from "@/hooks/useSubjectCovers";

/** จัดปกรายวิชา (super_admin): upload covers to the library first, bind them to subjects later in the subject form. */
export function SubjectCovers() {
  const toast = useToast();
  const { data: covers, isLoading, error } = useSubjectCoverLibrary();
  const upload = useUploadCovers();
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    upload.mutate(files, {
      onSuccess: () => toast(`อัพโหลด ${files.length} รูปสำเร็จ`),
      onError: (err) => toast(err instanceof Error ? err.message : "อัพโหลดไม่สำเร็จ", "error"),
    });
  }

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">อัพโหลดปกไว้ที่นี่ก่อน แล้วไปเลือกผูกในฟอร์มแก้รายวิชาทีหลัง</p>
        <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Spinner className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          อัพโหลดปก
        </Button>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {error ? (
          <EmptyState title="โหลดไม่สำเร็จ" description={error.message} />
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[16/10] w-full" />
            ))}
          </div>
        ) : !covers || covers.length === 0 ? (
          <EmptyState title="ยังไม่มีปกในคลัง" description="กด “อัพโหลดปก” เพื่อเพิ่มรูป เลือกได้หลายไฟล์" />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {covers.map((c) => (
              <CoverCard key={c.id} cover={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CoverCard({ cover }: { cover: CoverWithUsage }) {
  const toast = useToast();
  const rename = useRenameCover();
  const replace = useReplaceCover();
  const del = useDeleteCover();
  const [name, setName] = useState(cover.name);
  const fileRef = useRef<HTMLInputElement>(null);
  const fail = (err: unknown) => toast(err instanceof Error ? err.message : "ไม่สำเร็จ", "error");

  return (
    <Card className="space-y-2 p-3">
      <img src={libraryCoverUrl(cover)} alt={cover.name} className="aspect-[16/10] w-full rounded-lg bg-muted object-cover" />
      <Input
        value={name}
        aria-label="ชื่อปก"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const n = name.trim();
          if (!n) return setName(cover.name);
          if (n !== cover.name) rename.mutate({ id: cover.id, name: n }, { onError: fail });
        }}
      />
      <p className="text-xs text-muted-foreground">{cover.usage > 0 ? `ใช้อยู่ ${cover.usage} รายวิชา` : "ยังไม่ได้ผูกรายวิชา"}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" disabled={replace.isPending} onClick={() => fileRef.current?.click()}>
          {replace.isPending ? <Spinner className="h-3 w-3" /> : "เปลี่ยนรูป"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-destructive"
          disabled={cover.usage > 0 || del.isPending}
          title={cover.usage > 0 ? `ลบไม่ได้ มี ${cover.usage} รายวิชาใช้อยู่` : undefined}
          onClick={() => confirm(`ลบปก “${cover.name}”?`) && del.mutate(cover.id, { onError: fail })}
        >
          ลบ
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) replace.mutate({ id: cover.id, name: cover.name, file }, { onSuccess: () => toast("เปลี่ยนรูปแล้ว"), onError: fail });
        }}
      />
    </Card>
  );
}
