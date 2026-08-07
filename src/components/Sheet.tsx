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
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
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
          <div className="px-5 pb-2 pt-5">
            <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="text-sm text-muted-foreground">
                {description}
              </Drawer.Description>
            ) : (
              // Vaul warns without a description; keep it for screen readers.
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pb-safe">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
