import { cn } from "@/lib/utils";

/** Tinted square behind a card-header icon. */
export function IconTile({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tone)}>{children}</span>;
}
