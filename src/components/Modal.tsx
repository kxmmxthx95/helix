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
        "drawer-float m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl p-0 text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:flex-col",
        className,
      )}
    >
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
        <h2 id="modal-title" className="font-heading text-base font-semibold">
          {title}
        </h2>
        {description && <p className="font-sarabun text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="scrollbar-hidden flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      {footer && <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>}
    </dialog>
  );
}
