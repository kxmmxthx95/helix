import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Right-side drawer, floated off the screen edges like the sidebar rather
 * than flush against them — same glass-sidebar treatment, same rounding.
 * Drag-to-dismiss (toward the right edge) comes from Vaul.
 */
export function Sheet({
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
  /** Sticky actions below the scroll body (cancel / save, etc.). */
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content
          className={cn(
            "glass-sidebar fixed inset-y-2 right-2 z-50 flex w-[calc(100%-1rem)] max-w-sm flex-col rounded-2xl outline-none",
            className,
          )}
        >
          <div className="shrink-0 border-b border-border px-3 pb-3 pt-3">
            <Drawer.Title className="text-base font-semibold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="text-xs text-muted-foreground">
                {description}
              </Drawer.Description>
            ) : (
              // Vaul warns without a description; keep it for screen readers.
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div
            className={cn(
              "flex-1 overflow-y-auto overscroll-contain px-3",
              footer ? "pb-3" : "pb-6 pb-safe",
            )}
          >
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-border px-3 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
