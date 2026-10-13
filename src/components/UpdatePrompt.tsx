import { useRegisterSW } from "virtual:pwa-register/react";
import { X } from "@/components/icons";

/** Bottom banner shown when a new service worker is waiting; user picks when to reload. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4 lg:bottom-6">
      <div
        role="status"
        className="glass pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border px-3 py-2 text-xs shadow-lg"
      >
        <span>มีเวอร์ชันใหม่</span>
        <button type="button" className="font-semibold underline" onClick={() => updateServiceWorker(true)}>
          รีเฟรช
        </button>
        <button type="button" aria-label="ปิด" onClick={() => setNeedRefresh(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
