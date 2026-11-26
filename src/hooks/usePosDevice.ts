import { useEffect } from "react";

/** Keeps the tablet screen on while a POS page is open; re-requests the lock when the app returns to the foreground. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const request = async () => {
      try {
        const l = await navigator.wakeLock?.request("screen");
        if (!l) return;
        if (gone) void l.release();
        else lock = l;
      } catch {
        /* unsupported, battery saver, or not visible: the screen just dims as usual */
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void request();
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}

/** The Back button stays on this page: one extra history entry is re-pushed whenever Back lands on it. Sign-out is the way out. */
export function useBackLock() {
  useEffect(() => {
    history.pushState(history.state, "");
    const stay = () => history.pushState(history.state, "");
    window.addEventListener("popstate", stay);
    return () => window.removeEventListener("popstate", stay);
  }, []);
}
