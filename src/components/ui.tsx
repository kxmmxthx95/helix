import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, createContext, forwardRef, isValidElement, useContext, useRef, useState, type ComponentType, type ReactNode } from "react";
import { BarChartIcon, CameraIcon, TrashIcon, ChevronBack, ChevronForward, EyeIcon, EyeOffIcon, X } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Helix design system (Vercel × iOS). One `default` (black/white) button per view; `accent` for the
 * blue confirm; `secondary` gray fill for everything else; `destructive` is red text on a soft red
 * tint (iOS style) so it reads in both themes. Heights: 32px on desktop, 40px touch target below md.
 */
const button = cva(
  "tappable inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium outline-none ring-offset-background transition-[background-color,opacity,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-85",
        accent: "bg-accent text-accent-foreground hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-fill-strong",
        tinted: "bg-accent-soft text-accent hover:brightness-95",
        outline: "border border-input bg-card hover:bg-muted",
        ghost: "hover:bg-muted",
        plain: "px-1.5 text-accent hover:opacity-80",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
      },
      size: {
        default: "ui-control h-8 px-3 text-[13px]",
        sm: "ui-control h-8 px-2.5 text-[13px]",
        xs: "h-6 px-1.5 text-[11px]",
        lg: "ui-control h-10 px-4 text-sm font-semibold",
        icon: "ui-control-icon h-8 w-8",
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
  ({ className, type, value, onClick, onKeyDown, inputMode, ...props }, ref) => {
    const isDate = type === "date" || type === "datetime-local";
    return (
      <input
        ref={ref}
        type={type}
        value={value}
        inputMode={isDate ? "none" : inputMode}
        className={cn(
          "ui-control flex h-8 w-full min-w-0 rounded-md border border-input bg-field px-3 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50 md:text-[13px]",
          isDate && "ui-date pr-8",
          isDate && (value === "" || value === undefined) && "ui-date-empty",
          className,
        )}
        onClick={(e) => {
          if (isDate) {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* showPicker throws if input is not user-activated or unsupported */
            }
          }
          onClick?.(e);
        }}
        onKeyDown={(e) => {
          if (isDate && e.key.length === 1) e.preventDefault();
          onKeyDown?.(e);
        }}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { iconClassName?: string }
>(({ className, iconClassName, ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-8", className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className={cn(
          "absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
          iconClassName,
        )}
        aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      >
        {visible ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

/**
 * Native <select> on purpose: iOS and Android render it as the OS wheel
 * picker, which is more app-like than any custom dropdown we could build.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }
>(({ className, placeholder, children, value, ...props }, ref) => (
  <select
    ref={ref}
    value={value}
    className={cn(
      "ui-select ui-control h-8 w-full min-w-0 rounded-md border border-input bg-field px-3 pr-8 text-base outline-none transition-[border-color,box-shadow] hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50 md:text-[13px]",
      placeholder != null && (value === "" || value === undefined) && "ui-select-placeholder",
      className,
    )}
    {...props}
  >
    {placeholder != null && (
      <option value="" disabled>
        {placeholder}
      </option>
    )}
    {children}
  </select>
));
Select.displayName = "Select";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** วัน/เดือน/ปี (พ.ศ.) selects — native <input type=date> only ever shows ค.ศ., so birth dates use this instead. */
export function BuddhistDateSelect({
  value,
  onChange,
  required,
  className,
}: {
  /** ISO yyyy-mm-dd (ค.ศ.), or "" when unset — same shape as a native date input's value. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  // Own state, seeded once from `value` — NOT re-derived from it on every
  // render. Only two of three parts are ever picked at once, and the ISO
  // `value` prop can't represent that partial state, so deriving straight
  // from the prop made every incomplete pick round-trip back as onChange("")
  // and wipe whatever was just selected. Parent resets (e.g. closing a
  // sheet) remount this via a `key` at the call site instead.
  const initial = value ? (value.split("-").map(Number) as [number, number, number]) : undefined;
  const [ceYear, setCeYear] = useState<number | undefined>(initial?.[0]);
  const [month, setMonth] = useState<number | undefined>(initial?.[1]);
  const [day, setDay] = useState<number | undefined>(initial?.[2]);

  const thisYearBE = new Date().getFullYear() + 543;
  const years = Array.from({ length: 100 }, (_, i) => thisYearBE - i);
  // ponytail: no year picked yet → default to 31/29 days, clamped once a year is known.
  const dayCount = ceYear && month ? daysInMonth(ceYear, month) : month === 2 ? 29 : 31;

  function commit(nd: number | undefined, nm: number | undefined, ny: number | undefined) {
    if (nd === undefined || nm === undefined || ny === undefined) {
      onChange("");
      return;
    }
    const clampedDay = Math.min(nd, daysInMonth(ny, nm));
    onChange(`${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select
        value={day ? String(day) : ""}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : undefined;
          setDay(v);
          commit(v, month, ceYear);
        }}
        placeholder="วัน"
        required={required}
        className={className}
      >
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </Select>
      <Select
        value={month ? String(month) : ""}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : undefined;
          setMonth(v);
          commit(day, v, ceYear);
        }}
        placeholder="เดือน"
        required={required}
        className={className}
      >
        {THAI_MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </Select>
      <Select
        value={ceYear ? String(ceYear + 543) : ""}
        onChange={(e) => {
          const raw = e.target.value ? Number(e.target.value) : undefined;
          const v = raw !== undefined ? raw - 543 : undefined;
          setCeYear(v);
          commit(day, month, v);
        }}
        placeholder="ปี"
        required={required}
        className={className}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Surface card — solid `card` fill with the Vercel border-shadow, 14px corners. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-w-0 rounded-xl bg-card p-4 text-card-foreground shadow-card md:p-5", className)}
      {...props}
    />
  );
}

/** True inside a FormSection card: simple Input/Select fields render as label-left / value-right rows. */
const FormRowsContext = createContext(false);
/** True inside a Sheet body: loose Input/Select fields become `.form-row` rows that merge into grouped cards (see index.css). */
export const SheetFormContext = createContext(false);

export function Field({
  label,
  valueStart,
  error,
  required,
  children,
}: {
  label: React.ReactNode;
  /** Small adornment (e.g. a status dot) placed just before the value; the value then hugs its content. */
  valueStart?: React.ReactNode;
  error?: string;
  /** Shows a red * after the label — purely visual, doesn't set HTML required on children. */
  required?: boolean;
  children: React.ReactNode;
}) {
  const inRows = useContext(FormRowsContext);
  const inSheet = useContext(SheetFormContext);
  const star = required && (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  );
  const simple =
    isValidElement(children) &&
    (children.type === Input || children.type === Select) &&
    !(children.props as { multiple?: boolean }).multiple;

  if ((inRows || inSheet) && simple) {
    return (
      <label className={cn("block min-w-0", !inRows && "form-row")}>
        <span className="flex min-w-0 items-center gap-4">
          <span className="w-[42%] shrink-0 text-sm leading-5">
            {label}
            {star}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1",
              valueStart ? "flex items-center justify-end gap-2 [&_select]:w-auto [&_select]:[field-sizing:content]" : "block",
              "[&_input]:h-7 [&_input]:border-transparent [&_input]:bg-transparent [&_input]:px-0 [&_input]:text-right [&_input]:shadow-none [&_input]:hover:border-transparent",
              "[&_input:focus-visible]:border-transparent [&_input:focus-visible]:ring-0",
              // Values read lighter than their labels (iOS settings rows); focus and open dropdown stay full strength.
              "[&_input]:text-muted-foreground [&_select]:text-muted-foreground [&_input:focus]:text-foreground [&_option]:text-foreground",
              // Number inputs reserve room for spin buttons, which pushes the right-aligned value off the edge.
              "[&_input[type=number]]:[-moz-appearance:textfield] [&_input[type=number]::-webkit-inner-spin-button]:appearance-none [&_input[type=number]::-webkit-outer-spin-button]:appearance-none",
              "[&_select]:h-7 [&_select]:border-transparent [&_select]:bg-transparent [&_select]:pl-0 [&_select]:text-right [&_select]:shadow-none [&_select]:[text-align-last:right] [&_select]:hover:border-transparent",
              "[&_select:focus-visible]:border-transparent [&_select:focus-visible]:ring-0",
            )}
          >
            {valueStart}
            {children.type === Input && !(children.props as { placeholder?: string }).placeholder
              ? cloneElement(children as React.ReactElement<{ placeholder?: string }>, { placeholder: "ระบุ" })
              : children}
          </span>
        </span>
        {error && <span className="mt-1 block text-right text-xs text-destructive">{error}</span>}
      </label>
    );
  }

  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="font-ui text-[13px] font-medium leading-[18px]">
        {label}
        {star}
      </span>
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
    <div className="flex items-center justify-between px-1 py-3 text-xs text-muted-foreground">
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

/** "แสดง 1 จาก 20 รายการ" on the left, numbered page buttons on the right. */
export function PageFooter({ shown, total, page, pageCount, onChange }: { shown: number; total: number; page: number; pageCount: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  // First, last and the pages around the current one; gaps become an ellipsis.
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const btn = "tappable flex h-9 min-w-9 items-center justify-center rounded-lg px-2 font-mono text-[13px] tabular-nums text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
      <span className="min-w-0">
        แสดง {shown} จาก {total} รายการ
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-label="หน้าก่อนหน้า" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronBack className="h-4 w-4" />
        </button>
        {pages.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            {i > 0 && n - pages[i - 1]! > 1 && <span className="px-1">…</span>}
            <button
              type="button"
              aria-current={n === page ? "page" : undefined}
              className={cn(btn, n === page && "bg-secondary font-semibold")}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          </span>
        ))}
        <button type="button" aria-label="หน้าถัดไป" className={btn} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
          <ChevronForward className="h-4 w-4" />
        </button>
      </div>
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

/** Decorative loading placeholder block — compose per-page to mirror real content shape. Wrap the group in `role="status" aria-label="กำลังโหลด"`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted bg-gradient-to-r from-muted via-muted-foreground/20 to-muted bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none motion-reduce:bg-none",
        className,
      )}
    />
  );
}

/** Centered empty placeholder — icon tile + title + muted description. */
export function EmptyState({
  title,
  description,
  icon: Icon = BarChartIcon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("empty-state", className)}>
      <div className="empty-state-icon">
        <Icon className="h-5 w-5" />
      </div>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]!.slice(0, 2) || "?").toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Photo if uploaded (migration 0024), else initials. */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[11px] font-semibold tracking-wide text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initialsFromName(name)}
    </div>
  );
}

/** Photo tile with pick / remove controls — the caller decides when the file is actually uploaded. */
export function AvatarCard({
  name,
  src,
  busy,
  onPick,
  onRemove,
}: {
  name: string;
  src: string | null;
  busy?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-3">
      <div className="relative shrink-0">
        <Avatar name={name} src={src} className="h-16 w-16 text-xl" />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          aria-label={src ? "เปลี่ยนรูป" : "เลือกรูป"}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background shadow-sm"
        >
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <CameraIcon className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">รูปโปรไฟล์</p>
        <p className="text-xs text-muted-foreground">รองรับไฟล์ JPG, PNG ขนาดไม่เกิน 2MB</p>
      </div>
      {src && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRemove}>
          <TrashIcon className="h-3.5 w-3.5" />
          ลบรูป
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </section>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  size = "default",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "default" | "sm" | "xs";
}) {
  const sm = size === "sm";
  const xs = size === "xs";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-ios focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40",
        xs ? "h-5 w-8" : sm ? "h-6 w-10" : "h-[31px] w-[51px]",
        checked ? "bg-accent" : "bg-fill-strong",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-thumb ring-0 transition-transform duration-200 ease-ios",
          xs ? "h-4 w-4" : sm ? "h-5 w-5" : "h-[27px] w-[27px]",
          checked ? (xs ? "translate-x-3" : sm ? "translate-x-4" : "translate-x-5") : "translate-x-0",
        )}
      />
    </button>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="ปิด"
      onClick={onClick}
      className="tappable flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-fill-strong text-muted-foreground transition-colors hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Grouped form block: small heading above a bordered card whose rows are split by hairlines
 * (iOS inset-grouped / Vercel settings style). `icon` and `description` are accepted for
 * call-site compatibility but are no longer shown.
 */
export function FormSection({
  title,
  children,
}: {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      {title && <h3 className="font-heading mb-2 px-0.5 text-[15px] font-semibold leading-tight">{title}</h3>}
      <FormRowsContext.Provider value>
        <div className="min-w-0 overflow-hidden rounded-xl bg-muted [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border [&>*]:px-4 [&>*]:py-1.5 [&>*:last-child:has(textarea)]:pb-4 [&>.grid]:!grid-cols-1 [&>.grid]:gap-0 [&>.grid>*+*]:relative [&>.grid>*+*]:before:absolute [&>.grid>*+*]:before:inset-x-4 [&>.grid>*+*]:before:top-0 [&>.grid>*+*]:before:h-px [&>.grid>*+*]:before:bg-border [&>.grid]:!p-0 [&>.grid>*]:px-4 [&>.grid>*]:py-1.5">
          {children}
        </div>
      </FormRowsContext.Provider>
    </section>
  );
}
