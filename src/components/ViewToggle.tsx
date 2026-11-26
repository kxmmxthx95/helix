import { AppsIcon, BuildingIcon, ListIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type ViewMode = "cards" | "table" | "rooms";

/** Cards/table switch used by every staff tab that has both views (the exam timetable adds "rooms"). Icons match the tab icons (h-4 w-4). */
export function ViewToggle<T extends ViewMode = "cards" | "table">({
  value,
  onChange,
  views = ["cards", "table"] as unknown as readonly T[],
  className,
  framed = false,
}: {
  value: T;
  onChange: (v: T) => void;
  /** Which views to offer; default cards + table. */
  views?: readonly T[];
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
      {views.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={v === "cards" ? "มุมมองการ์ด" : v === "table" ? "มุมมองตาราง" : "มุมมองรายห้อง"}
          onClick={() => onChange(v)}
          className={cn(framed ? "flex h-full w-10 items-center justify-center rounded-md" : "flex h-8 w-9 items-center justify-center rounded-md", value === v ? "bg-background shadow-sm" : "text-muted-foreground")}
        >
          {(() => {
            const Icon = v === "cards" ? AppsIcon : v === "table" ? ListIcon : BuildingIcon;
            return <Icon className={framed ? "h-3.5 w-3.5" : "h-4 w-4"} />;
          })()}
        </button>
      ))}
    </div>
  );
}

/** Initial view of a staff tab: table on desktop (same 1024px breakpoint as AppShell), cards on mobile. */
export const defaultView = (): "cards" | "table" => (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "table" : "cards");
