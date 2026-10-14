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
