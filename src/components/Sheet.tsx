import { createContext, useContext, useEffect, useState } from "react";
import { Drawer } from "vaul";
import { ContractIcon, ExpandIcon } from "@/components/icons";
import { Button, CloseButton, SheetFormContext } from "@/components/ui";
import { cn } from "@/lib/utils";

/** "ios" (student portal): phones get an iPhone-style bottom card sheet with a grabber instead of the side drawer. */
export const SheetStyleContext = createContext<"drawer" | "ios">("drawer");

function usePhone() {
  const q = "(max-width: 1023px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

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
  headerClassName,
  footerClassName,
  icon,
  iconClassName,
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
  /** Extra classes on the header band / the footer band (e.g. to give both the same height). */
  headerClassName?: string;
  footerClassName?: string;
  /** Optional trailing content in the header row (e.g. a badge). */
  headerEnd?: React.ReactNode;
  /** Optional tinted tile before the title (e.g. a document icon). */
  icon?: React.ReactNode;
  /** Overrides the icon tile's look (e.g. a bare back button: "bg-transparent text-foreground"). */
  iconClassName?: string;
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
  const phone = usePhone();
  const ios = useContext(SheetStyleContext) === "ios" && phone;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={ios ? "bottom" : side}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] dark:bg-black/60" />
        <Drawer.Content
          className={cn(
            ios
              ? "fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[14px] bg-background text-foreground shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none"
              : cn(
                  "drawer-float fixed inset-y-2 z-50 flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl text-foreground outline-none",
                  effectiveWide === "full" ? "" : effectiveWide ? "max-w-2xl" : "max-w-[24rem]",
                  side === "left" ? "left-2" : "right-2",
                ),
            className,
          )}
        >
          {ios && <div aria-hidden className="mx-auto mt-1.5 h-[5px] w-9 shrink-0 rounded-full bg-muted-foreground/40" />}
          <div className={cn("shrink-0 px-4", ios ? "pb-2 pt-2" : "border-b border-border py-3", headerClassName)}>
            <div className="flex min-w-0 items-center gap-3">
              {icon && <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent", iconClassName)}>{icon}</div>}
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
            {/* Description is kept for screen readers only; the header shows just the title. */}
            <Drawer.Description className="sr-only">{description ?? title}</Drawer.Description>
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
            <SheetFormContext.Provider value>{children}</SheetFormContext.Provider>
          </div>
          {footer ? (
            <div className={cn("shrink-0 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]", footerClassName)}>
              {footer}
            </div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
