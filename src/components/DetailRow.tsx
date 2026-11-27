import { AlertTriangle, ChevronForward, Plus } from "@/components/icons";
import { GlyphTile } from "@/components/IconTile";
import { cn } from "@/lib/utils";

/** One hue per group of rows, so a long list of collapsible cards reads as a few distinct sections. */
export const TONE = {
  people: "bg-gradient-to-b from-green-400 to-green-600",
  setup: "bg-gradient-to-b from-orange-400 to-orange-600",
  content: "bg-gradient-to-b from-indigo-400 to-indigo-600",
  check: "bg-gradient-to-b from-pink-400 to-pink-600",
} as const;
export type DetailTone = keyof typeof TONE;

/** Labelled group of cards: the label is what tells "การจัดสอบ" from "เนื้อหาข้อสอบ" at a glance. */
export function DetailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="shrink-0 space-y-2">
      <h2 className="px-1 text-xs font-semibold text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

/**
 * Header row of a collapsible card: coloured glyph, bold title, and the current value on a second line
 * (plain text; only a missing setting turns red). Replaces a row of identical grey tiles and green pills.
 */
export function DetailRow({
  icon,
  tone,
  title,
  summary,
  alert = false,
  open,
  className,
  ...button
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  icon: (p: { className?: string; size?: number }) => React.JSX.Element;
  tone: DetailTone;
  title: string;
  summary?: React.ReactNode;
  /** Something required is missing: summary in red with a warning mark. */
  alert?: boolean;
  open: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className={cn("flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset", className)}
      {...button}
    >
      <GlyphTile icon={icon} tone={TONE[tone]} className="size-9" iconSize={18} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5 text-foreground">{title}</span>
        {summary != null && <span className={cn("mt-0.5 block truncate text-xs tabular-nums", alert ? "font-medium text-destructive" : "text-muted-foreground")}>{summary}</span>}
      </span>
      {alert && (
        <span className="flex shrink-0 text-destructive" role="img" aria-label="ยังไม่ได้ตั้งค่า">
          <AlertTriangle className="h-4 w-4" />
        </span>
      )}
      <ChevronForward className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
    </button>
  );
}

/** "เพิ่ม…" row at the foot of a card: an action, so it is blue instead of a coloured menu tile. */
export function DetailAddRow({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 border-t border-border px-3.5 py-2 text-left text-sm font-medium text-accent hover:bg-muted focus-visible:outline-offset-[-2px] focus-visible:ring-inset"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[30%] bg-accent-soft">
        <Plus className="h-4 w-4" />
      </span>
      <span className="flex-1">{label}</span>
      <ChevronForward className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
    </button>
  );
}
