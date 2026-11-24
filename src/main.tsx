import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "@/App";
import { applyIfIdle, applyWaitingIfIdle } from "@/lib/swUpdate";
import "@/index.css";

// registerType "prompt": new SW waits; we activate + reload it ourselves, only when the user
// has been idle (no input for IDLE_MS) and the outbox is empty. Browser only re-checks sw.js on
// navigation, so also poll; an always-open page never hides, so idle is tracked from input, not visibility.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const apply = () => void updateSW(true);
    let lastActive = Date.now();
    const idle = () => Date.now() - lastActive;
    for (const e of ["pointerdown", "keydown", "scroll", "touchstart"])
      window.addEventListener(e, () => (lastActive = Date.now()), { passive: true, capture: true });
    void applyIfIdle(reg, Infinity, apply); // cold start
    setInterval(() => void reg.update().catch(() => {}), 10 * 60 * 1000);
    setInterval(() => void applyWaitingIfIdle(reg, idle(), apply), 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void applyIfIdle(reg, idle(), apply);
    });
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline-first: keep serving the last known data instead of erroring.
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "offlineFirst" },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
