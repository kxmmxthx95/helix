import { useRef } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { BANNER_MAX_BYTES, useRemoveBanner, useUploadBanner } from "@/hooks/useAvatar";
import type { Profile } from "@/lib/database.types";

/** "อัปโหลดรูป / ลบรูป" rows for the home-card cover picker (teacher + student). */
export function BannerUpload({ profile, onAdjust }: { profile: Pick<Profile, "id" | "banner_path">; onAdjust: () => void }) {
  const toast = useToast();
  const { refreshProfile } = useAuth(); // the signed-in profile is context state, not a query
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadBanner();
  const remove = useRemoveBanner();
  const busy = upload.isPending || remove.isPending;
  const fail = (err: unknown) => toast(err instanceof Error ? err.message : "ไม่สำเร็จ", "error");
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload.mutate({ file, profileId: profile.id }, { onSuccess: () => void refreshProfile().then(() => { toast("เปลี่ยนรูป Cover แล้ว"); onAdjust(); }), onError: fail });
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-muted text-[13px] font-medium disabled:opacity-50"
        >
          {upload.isPending && <Spinner className="h-3.5 w-3.5" />}
          อัปโหลดรูป
        </button>
        {profile.banner_path && (
          <button type="button" disabled={busy} onClick={onAdjust} className="inline-flex h-9 items-center justify-center rounded-xl bg-muted px-3 text-[13px] font-medium disabled:opacity-50">
            ปรับตำแหน่ง
          </button>
        )}
        {profile.banner_path && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove.mutate(profile.id, { onSuccess: () => void refreshProfile(), onError: fail })}
            className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-[13px] font-medium text-destructive disabled:opacity-50"
          >
            ลบรูป
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">แนะนำรูปแนวนอน (เช่น 1600×400) ไม่เกิน {BANNER_MAX_BYTES / 1024 / 1024} MB</p>
    </div>
  );
}
