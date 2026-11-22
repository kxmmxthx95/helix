import { AppsIcon, ListIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Cards/table switch used by every staff tab that has both views. Icons match the tab icons (h-4 w-4). */
export function ViewToggle({ value, onChange, className }: { value: "cards" | "table"; onChange: (v: "cards" | "table") => void; className?: string }) {
  return (
    <div className={cn("flex shrink-0 rounded-lg bg-muted p-0.5", className)} role="group" aria-label="มุมมอง">
      {(["cards", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={v === "cards" ? "มุมมองการ์ด" : "มุมมองตาราง"}
          onClick={() => onChange(v)}
          className={cn("flex h-8 w-9 items-center justify-center rounded-md", value === v ? "bg-background shadow-sm" : "text-muted-foreground")}
        >
          {v === "cards" ? <AppsIcon className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
        </button>
      ))}
    </div>
  );
}

/** Initial view of a staff tab: table on desktop (same 1024px breakpoint as AppShell), cards on mobile. */
export const defaultView = (): "cards" | "table" => (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "table" : "cards");
