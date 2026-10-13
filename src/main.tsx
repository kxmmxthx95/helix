import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "@/App";
import "@/index.css";

// autoUpdate: a new service worker activates and reloads the page by itself.
// The browser only re-checks sw.js on navigation, so poll for long-lived tabs / installed PWAs.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => void reg.update().catch(() => {});
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
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
