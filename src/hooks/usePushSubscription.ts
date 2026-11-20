import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Per-device web push opt-in (migration 0185). The service worker handlers live in public/push-sw.js;
// delivery is done by supabase/functions/line-notify. Needs VITE_VAPID_PUBLIC_KEY.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(b64: string) {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function usePushSubscription() {
  // iOS exposes PushManager only once the PWA is added to the home screen.
  const supported = !!VAPID_PUBLIC_KEY && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const denied = supported && Notification.permission === "denied";

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready.then(async (reg) => setSubscribed(!!(await reg.pushManager.getSubscription())));
  }, [supported]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("ไม่ได้รับอนุญาตให้แจ้งเตือน");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) }));
      const json = sub.toJSON();
      const { error } = await supabase.rpc("save_push_subscription", {
        p_endpoint: sub.endpoint,
        p_p256dh: json.keys!.p256dh!,
        p_auth: json.keys!.auth!,
      });
      if (error) throw error;
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, denied, subscribed, busy, enable, disable };
}
