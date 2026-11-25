import { FILLED_ICON } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Tinted square behind a card-header icon. */
export function IconTile({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&>svg]:size-3.5", tone)}>{children}</span>;
}

/** macOS-Settings-style tile (sidebar menu icons): white filled glyph on a coloured rounded square. */
export function GlyphTile({
  icon,
  tone,
  className,
  iconSize = 16,
}: {
  icon: (p: { className?: string; size?: number }) => React.JSX.Element;
  tone: string;
  className?: string;
  /** px — Ionicons take their size from this, not from a size-* class. */
  iconSize?: number;
}) {
  const Icon = (FILLED_ICON.get(icon) as typeof icon | undefined) ?? icon;
  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-[30%] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_0_0_0.5px_rgb(0_0_0/0.25)]", tone, className)}>
      <Icon size={iconSize} />
    </span>
  );
}

// macOS-Settings-style tile: white glyph on a coloured rounded square, one colour per menu group.
export const SECTION_TONE: Record<string, string> = {
  "": "bg-gradient-to-b from-sky-400 to-sky-600",
  การสอนและห้องเรียน: "bg-gradient-to-b from-orange-400 to-orange-600",
  การเงิน: "bg-gradient-to-b from-green-400 to-green-600",
  งานวิชาการ: "bg-gradient-to-b from-blue-400 to-blue-600",
  บริหารจัดการ: "bg-gradient-to-b from-slate-400 to-slate-600",
  บุคลากร: "bg-gradient-to-b from-purple-400 to-purple-600",
  บัญชี: "bg-gradient-to-b from-purple-400 to-purple-600",
  สนับสนุน: "bg-gradient-to-b from-pink-400 to-pink-600",
  สอบและแบบฝึกหัด: "bg-gradient-to-b from-indigo-400 to-indigo-600",
};
