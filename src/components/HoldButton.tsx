import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Press-and-hold to confirm (pointer or Enter/Space). A tint fills the button over `ms`;
 * onConfirm fires the moment it is full, onEarly when released first.
 */
export function HoldButton({
  onConfirm,
  onEarly,
  ms = 2000,
  disabled,
  className,
  children,
}: {
  onConfirm: () => void;
  onEarly?: () => void;
  ms?: number;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = (early: boolean) => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    if (early) onEarly?.();
  };
  const start = () => {
    if (disabled || timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      navigator.vibrate?.(30);
      onConfirm();
    }, ms);
  };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={() => stop(true)}
      onPointerLeave={() => stop(false)}
      onPointerCancel={() => stop(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => (e.key === "Enter" || e.key === " ") && stop(true)}
      onBlur={() => stop(false)}
      className={cn("relative select-none overflow-hidden [-webkit-touch-callout:none]", className)}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 origin-left bg-accent/15 ease-linear motion-reduce:hidden",
          holding ? "scale-x-100 transition-transform" : "scale-x-0 transition-transform duration-200",
        )}
        style={holding ? { transitionDuration: `${ms}ms` } : undefined}
      />
      {holding && <span className="absolute right-16 top-2 hidden text-xs text-accent motion-reduce:block">กำลังบันทึก…</span>}
      <span className="relative flex w-full items-center gap-3">{children}</span>
    </button>
  );
}
