import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle, CheckmarkCircleIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error";
type ToastItem = { id: number; message: string; variant: ToastVariant };

let nextId = 0;
const DISMISS_MS = 3000;
/** Longer messages (e.g. conflict details) can ask for more reading time. */
type ToastOptions = { durationMs?: number };

const ToastContext = createContext<((message: string, variant?: ToastVariant, options?: ToastOptions) => void) | null>(null);

/** Bottom-center stack, auto-dismiss after 3s. Mounted once at the app root. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success", options?: ToastOptions) => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), options?.durationMs ?? DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "glass pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium leading-5 shadow-float",
              )}
            >
              {t.variant === "success" ? (
                <CheckmarkCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <span className="whitespace-pre-line">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
