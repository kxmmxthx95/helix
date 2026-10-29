import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Centered pop-up for short forms (a Sheet is the side drawer for long lists). Native <dialog>:
 * top layer, focus trap and focus return come from the browser. Controlled — Esc and a click on
 * the backdrop only call onOpenChange(false), so the parent decides whether it may close.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Actions below the body (cancel / save, etc.). */
  footer?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onOpenChange(false);
      }}
      onClick={(e) => e.target === ref.current && onOpenChange(false)}
      className={cn(
        "drawer-float m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl p-0 text-foreground backdrop:bg-black/35 backdrop:backdrop-blur-[2px] dark:backdrop:bg-black/60 open:flex open:flex-col",
        className,
      )}
    >
      <div className="shrink-0 border-b border-border px-5 pb-3 pt-5">
        <h2 id="modal-title" className="font-heading text-[17px] font-semibold leading-6 tracking-[-0.01em]">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{description}</p>}
      </div>
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      {footer && <div className="shrink-0 border-t border-border px-5 py-3">{footer}</div>}
    </dialog>
  );
}
