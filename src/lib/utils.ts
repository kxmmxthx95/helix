import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BANGKOK_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });

/** YYYY-MM-DD for the Thailand calendar day (fixed UTC+7), not the browser's zone and not UTC. */
export function todayIso() {
  return BANGKOK_DATE.format(new Date());
}

const BANGKOK_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hourCycle: "h23" });

/** Student leave for today closes at 08:00 Thailand time (mirrors check_student_leave_cutoff(), migration 0177). */
export function leaveClosedForToday() {
  return Number(BANGKOK_HOUR.format(new Date())) >= 8;
}
