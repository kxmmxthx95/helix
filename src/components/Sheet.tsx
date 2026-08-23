import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Side drawer, floating off all four edges with full rounding + shadow (Vercel-style).
 * Drag-to-dismiss toward the open edge comes from Vaul.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  headerEnd,
  children,
  footer,
  className,
  bodyClassName,
  wide = false,
  side = "right",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Optional trailing content in the header row (e.g. a badge). */
  headerEnd?: React.ReactNode;
  children: React.ReactNode;
  /** Sticky actions below the scroll body (cancel / save, etc.). */
  footer?: React.ReactNode;
  className?: string;
  /** Extra classes on the scroll body (e.g. flex column fill for long inline lists). */
  bodyClassName?: string;
  /** Wider drawer — for tables that need more horizontal space. */
  wide?: boolean;
  side?: "left" | "right";
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={side}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content
          className={cn(
            "drawer-float fixed inset-y-2 z-50 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl outline-none",
            wide ? "max-w-2xl" : "max-w-sm",
            side === "left" ? "left-2" : "right-2",
            className,
          )}
        >
          <div className="shrink-0 border-b border-border px-3 pb-3 pt-3">
            <div className="flex items-center gap-2">
              <Drawer.Title className="font-heading min-w-0 flex-1 truncate text-base font-semibold">{title}</Drawer.Title>
              {headerEnd}
            </div>
            {description ? (
              <Drawer.Description className="font-sarabun text-xs text-muted-foreground">
                {description}
              </Drawer.Description>
            ) : (
              // Vaul warns without a description; keep it for screen readers.
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div
            className={cn(
              "scrollbar-hidden flex-1 overflow-y-auto overscroll-contain px-3 pt-3",
              footer ? "pb-3" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
              bodyClassName,
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
