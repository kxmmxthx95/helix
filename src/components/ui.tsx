import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ComponentType } from "react";
import { BarChartIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const button = cva(
  "tappable inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium outline-none ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        accent: "bg-accent text-accent-foreground hover:opacity-90",
        outline: "border border-border bg-transparent hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        default: "h-8 px-2.5 text-xs",
        sm: "h-8 px-2 text-xs",
        lg: "h-8 px-3 text-xs",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/**
 * Native <select> on purpose: iOS and Android render it as the OS wheel
 * picker, which is more app-like than any custom dropdown we could build.
 */
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "ui-select h-8 w-full rounded-lg border border-input bg-background px-2.5 pr-8 text-xs outline-none focus-visible:border-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = "Select";

/** Glass surface — bottom nav, cards and sheets only (grill decision). */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("glass rounded-xl border border-border p-4 text-card-foreground", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
      <button
        type="button"
        className="tappable rounded-md px-2 py-1 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        ก่อนหน้า
      </button>
      <span>
        หน้า {page} จาก {pageCount}
      </span>
      <button
        type="button"
        className="tappable rounded-md px-2 py-1 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
      >
        ถัดไป
      </button>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role="status"
      aria-label="กำลังโหลด"
    />
  );
}

/** Centered empty placeholder — icon tile + title + muted description. */
export function EmptyState({
  title,
  description,
  icon: Icon = BarChartIcon,
  className,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("empty-state", className)}>
      <div className="empty-state-icon">
        <Icon className="h-5 w-5" />
      </div>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
    </div>
  );
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]!.slice(0, 2) || "?").toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Initials avatar — no photo column on profiles yet. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-semibold tracking-wide text-accent ring-1 ring-accent/25",
        className,
      )}
      aria-hidden
    >
      {initialsFromName(name)}
    </div>
  );
}

