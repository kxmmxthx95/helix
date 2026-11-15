import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One period in the timetable. A neutral card surface keeps every line at full
 * foreground contrast; colour comes from the left stripe (subject area + grade) and the chips (subject type, grade):
 *   code + grade (chips) → subject name (bold) → teacher/room (muted lines).
 */
export function TimetableCard({
  tone,
  code,
  name,
  grade,
  who,
  badge,
  action,
  footer,
  dragging,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  /** Area + grade colour classes (bg + readable text), used for the left stripe. */
  tone: string;
  code: string;
  name: string;
  /** Classroom pill (ม.5/1), tinted by grade level. */
  grade: { label: string; className: string };
  /** Teacher name; left out in the teacher view, where the classroom pill is the answer. */
  who?: string;
  /** Subject-type pill: colour classes + the type's name (พื้นฐาน/เพิ่มเติม/กิจกรรม) as its tooltip. */
  badge: { className: string; title: string };
  /** Top-right control, e.g. the delete button. */
  action?: ReactNode;
  /** Bottom row, e.g. the room picker or the room name. */
  footer?: ReactNode;
  dragging?: boolean;
}) {
  return (
    <div
      data-slot="timetable-card"
      className={cn(
        "relative flex flex-1 flex-col gap-1.5 overflow-hidden rounded-lg border border-border bg-card py-2 pl-3.5 pr-2 leading-snug text-foreground shadow-sm",
        dragging && "opacity-40",
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", tone)} />

      <div className="flex items-center gap-1.5">
        <span title={badge.title} className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", badge.className)}>
          {code}
        </span>
        <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", grade.className)}>{grade.label}</span>
        <span className="ml-auto flex items-center gap-1">{action}</span>
      </div>

      <p title={name} className="line-clamp-2 text-[13px] font-semibold">
        {name}
      </p>

      {who && (
        <p title={who} className="truncate text-xs text-muted-foreground">
          {who}
        </p>
      )}

      {footer}
    </div>
  );
}
