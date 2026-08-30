import { useState } from "react";
import { Drawer } from "vaul";
import { ContractIcon, ExpandIcon } from "@/components/icons";
import { Button } from "@/components/ui";
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
  resizable = false,
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
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content
          className={cn(
            "drawer-float fixed inset-y-2 z-50 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl outline-none",
            effectiveWide === "full" ? "" : effectiveWide ? "max-w-2xl" : "max-w-sm",
            side === "left" ? "left-2" : "right-2",
            className,
          )}
        >
          <div className="shrink-0 border-b border-border px-3 pb-3 pt-3">
            <div className="flex items-center gap-2">
              <Drawer.Title className="font-heading min-w-0 flex-1 truncate text-base font-semibold">{title}</Drawer.Title>
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
