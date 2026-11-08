import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "@/App";
import { applyIfIdle } from "@/lib/swUpdate";
import "@/index.css";

// registerType "prompt": new SW waits; we activate + reload it ourselves, only when idle
// (see applyIfIdle). Browser only re-checks sw.js on navigation, so also poll.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const apply = () => void updateSW(true);
    let hiddenAt = 0;
    void applyIfIdle(reg, Infinity, apply); // cold start
    setInterval(() => void reg.update().catch(() => {}), 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt) void applyIfIdle(reg, Date.now() - hiddenAt, apply);
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
