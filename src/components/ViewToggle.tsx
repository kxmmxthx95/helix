import { AppsIcon, ListIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Cards/table switch used by every staff tab that has both views. Icons match the tab icons (h-4 w-4). */
export function ViewToggle({
  value,
  onChange,
  className,
  framed = false,
}: {
  value: "cards" | "table";
  onChange: (v: "cards" | "table") => void;
  className?: string;
  /** Bordered, smaller-icon variant for the student exams page. Default keeps the staff look. */
  framed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 rounded-lg p-0.5",
        framed ? "border border-border bg-muted" : "bg-muted",
        className,
      )}
      role="group"
      aria-label="มุมมอง"
    >
      {(["cards", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={v === "cards" ? "มุมมองการ์ด" : "มุมมองตาราง"}
          onClick={() => onChange(v)}
          className={cn(framed ? "flex h-full w-10 items-center justify-center rounded-md" : "flex h-8 w-9 items-center justify-center rounded-md", value === v ? "bg-background shadow-sm" : "text-muted-foreground")}
        >
          {v === "cards" ? <AppsIcon className={framed ? "h-3.5 w-3.5" : "h-4 w-4"} /> : <ListIcon className={framed ? "h-3.5 w-3.5" : "h-4 w-4"} />}
        </button>
      ))}
    </div>
  );
}

/** Initial view of a staff tab: table on desktop (same 1024px breakpoint as AppShell), cards on mobile. */
export const defaultView = (): "cards" | "table" => (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "table" : "cards");
