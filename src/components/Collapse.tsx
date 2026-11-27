import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Height-animated disclosure: grid 0fr→1fr, no measuring. Closed content is inert.
 * `lazy`: children mount on the first open (and stay, so reopening is instant) instead of rendering while closed.
 */
export function Collapse({ open, lazy = false, children }: { open: boolean; lazy?: boolean; children: React.ReactNode }) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return (
    <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="min-h-0 overflow-hidden" inert={!open}>{!lazy || seen ? children : null}</div>
    </div>
  );
}
