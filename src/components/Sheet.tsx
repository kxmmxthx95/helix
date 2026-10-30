import { useState } from "react";
import { Drawer } from "vaul";
import { ContractIcon, ExpandIcon } from "@/components/icons";
import { Button, CloseButton } from "@/components/ui";
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
  icon,
  closable = false,
  children,
  footer,
  className,
  bodyClassName,
  wide = false,
  side = "right",
  resizable = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Optional trailing content in the header row (e.g. a badge). */
  headerEnd?: React.ReactNode;
  /** Optional tinted tile before the title (e.g. a document icon). */
  icon?: React.ReactNode;
  /** Shows an X button at the end of the header row. */
  closable?: boolean;
  children: React.ReactNode;
  /** Sticky actions below the scroll body (cancel / save, etc.). */
  footer?: React.ReactNode;
  className?: string;
  /** Extra classes on the scroll body (e.g. flex column fill for long inline lists). */
  bodyClassName?: string;
  /** Wider drawer — for tables that need more horizontal space. `"full"` drops the max-width cap entirely (near full-screen). */
  wide?: boolean | "full";
  side?: "left" | "right";
  /** Adds a header button letting the user toggle between wide and full-screen. Only useful when `wide` is `true` or `"full"`. */
  resizable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const effectiveWide = resizable ? (expanded ? "full" : true) : wide;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={side}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] dark:bg-black/60" />
        <Drawer.Content
          className={cn(
            "drawer-float fixed inset-y-2 z-50 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl text-foreground outline-none",
            effectiveWide === "full" ? "" : effectiveWide ? "max-w-2xl" : "max-w-[24rem]",
            side === "left" ? "left-2" : "right-2",
            className,
          )}
        >
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
            <div className="flex min-w-0 items-center gap-3">
              {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</div>}
              <Drawer.Title className="font-heading min-w-0 flex-1 truncate text-[17px] font-semibold leading-6 tracking-[-0.01em]">{title}</Drawer.Title>
              {resizable && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={expanded ? "ย่อขนาด" : "ขยายขนาด"}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? <ContractIcon className="h-3.5 w-3.5" /> : <ExpandIcon className="h-3.5 w-3.5" />}
                </Button>
              )}
              {headerEnd}
              {closable && <CloseButton onClick={() => onOpenChange(false)} />}
            </div>
            {description ? (
              <Drawer.Description className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
                {description}
              </Drawer.Description>
            ) : (
              // Vaul warns without a description; keep it for screen readers.
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          {/* Vertical scroll only: no-drag stops Vaul turning a finger drag here into a horizontal frame drag; pan-y blocks sideways panning. */}
          <div
            data-vaul-no-drag
            className={cn(
              "scrollbar-hidden min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-4",
              footer ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
