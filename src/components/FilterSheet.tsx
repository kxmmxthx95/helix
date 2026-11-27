import { FunnelIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** The one button that replaces a row of filter selects below lg: funnel, label, and a count of active filters. */
export function FilterButton({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className={cn("ui-control-compact h-8 gap-1.5 px-2.5 lg:hidden", count > 0 && "border-accent text-accent")} aria-label={label} onClick={onClick}>
      <FunnelIcon className="h-3 w-3" />
      {count > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums leading-none text-white">{count}</span>}
    </Button>
  );
}

/** Bottom sheet that holds every filter of a list. Footer: clear + the one primary action showing how many results remain. */
export function FilterSheet({
  open,
  onOpenChange,
  title,
  activeCount,
  resultText,
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  activeCount: number;
  /** Label of the primary button, e.g. "ดู 12 รายการ". */
  resultText: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={activeCount === 0} onClick={onClear}>
            ล้าง{activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>
          <Button type="button" className="flex-[2]" onClick={() => onOpenChange(false)}>
            {resultText}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">{children}</div>
    </Sheet>
  );
}

/** Inset-grouped card: label on the left, the current choice in accent blue on the right. */
function FilterSection({ label, current, children }: { label: string; current?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-muted p-3.5">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold">{label}</h3>
        {current && <span className="min-w-0 truncate text-xs font-medium text-accent">{current}</span>}
      </div>
      {children}
    </section>
  );
}

/** Pick one of a few choices (scope, period): iOS segmented control, no "all" option. */
export function SegmentedFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <FilterSection label={label}>
      <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-secondary p-0.5">
        {options.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={cn("tappable min-w-0 flex-1 truncate rounded-[10px] px-2 py-1.5 text-[13px] font-medium transition-colors", value === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >
            {name}
          </button>
        ))}
      </div>
    </FilterSection>
  );
}

/** Pick one of many (grade, room, learning area): wrapping chips; the selected one carries a check so colour is not the only cue. */
export function ChipFilter({ label, value, onChange, options, all = "ทั้งหมด" }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; all?: string }) {
  const chip = (active: boolean) =>
    cn(
      "tappable inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
      active ? "border-accent bg-accent-soft text-accent" : "border-border bg-card text-foreground",
    );
  const current = options.find(([id]) => id === value)?.[1];
  return (
    <FilterSection label={label} current={current}>
      <div className="flex flex-wrap gap-1.5">
        {[["", all] as [string, string], ...options].map(([id, name]) => (
          <button key={id || "all"} type="button" aria-pressed={value === id} onClick={() => onChange(id)} className={chip(value === id)}>
            {value === id && <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.5 6.5l2.3 2.3L9.5 3.5" /></svg>}
            {name}
          </button>
        ))}
      </div>
    </FilterSection>
  );
}
