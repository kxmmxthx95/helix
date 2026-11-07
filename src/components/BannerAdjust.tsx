import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { useSaveBannerFocus } from "@/hooks/useAvatar";
import type { Profile } from "@/lib/database.types";

type Focus = { x: number; y: number };
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Drag-to-reposition for the home banner. `draft` is null outside adjust mode; spread `dragProps` on the banner
 * element and render <BannerAdjustOverlay> inside it. touch-action:none is only set while adjusting, so the page scrolls normally otherwise.
 */
/** Pointer handlers that turn a drag into a focal-point change (% of the element size). Spread on the element being dragged. */
export function useFocusDrag(focus: Focus, setFocus: (f: Focus) => void) {
  const start = useRef<{ px: number; py: number; f: Focus } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { px: e.clientX, py: e.clientY, f: focus };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      const r = e.currentTarget.getBoundingClientRect();
      // ponytail: treats the box as the overflow range; exact only if the image overflows by one box — good enough to feel right
      setFocus({ x: clamp(s.f.x - ((e.clientX - s.px) / r.width) * 100), y: clamp(s.f.y - ((e.clientY - s.py) / r.height) * 100) });
    },
    onPointerUp: () => (start.current = null),
    onPointerCancel: () => (start.current = null),
  };
}

export function useBannerAdjust(profile: Pick<Profile, "id" | "banner_focus_x" | "banner_focus_y"> | null | undefined) {
  const [draft, setDraft] = useState<Focus | null>(null);
  const drag = useFocusDrag(draft ?? { x: 50, y: 50 }, setDraft);
  return {
    draft,
    dragProps: draft ? drag : {},
    start: () => profile && setDraft({ x: profile.banner_focus_x, y: profile.banner_focus_y }),
    cancel: () => setDraft(null),
    profileId: profile?.id,
  };
}

export function BannerAdjustOverlay({ adjust }: { adjust: ReturnType<typeof useBannerAdjust> }) {
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const save = useSaveBannerFocus();
  const { draft, profileId } = adjust;
  if (!draft || !profileId) return null;
  return (
    <div className="absolute inset-0 z-20 flex cursor-grab touch-none select-none items-end justify-between gap-2 bg-black/20 p-2 ring-2 ring-inset ring-white active:cursor-grabbing">
      <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">ลากเพื่อปรับตำแหน่ง</span>
      <div className="flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={adjust.cancel} className="h-8 rounded-full bg-white/90 px-3 text-xs font-medium text-neutral-800">
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { profileId, ...draft },
              {
                onSuccess: () => void refreshProfile().then(() => { toast("บันทึกตำแหน่งแล้ว"); adjust.cancel(); }),
                onError: (err) => toast(err instanceof Error ? err.message : "ไม่สำเร็จ", "error"),
              },
            )
          }
          className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {save.isPending && <Spinner className="h-3 w-3" />}
          บันทึก
        </button>
      </div>
    </div>
  );
}
