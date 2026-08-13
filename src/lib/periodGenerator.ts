/** Quick-setup wizard for period_definitions — see migration 0031 / Settings.tsx QuickSetupSheet. */

export type PeriodBreakConfig = {
  enabled: boolean;
  /** Insert this break right after this many teaching periods have been placed. */
  afterPeriod: number;
  minutes: number;
  label: string;
};

export type GeneratePeriodsInput = {
  startTime: string; // "HH:MM"
  periodsPerDay: number;
  minutesPerPeriod: number;
  recess?: PeriodBreakConfig;
  lunch?: PeriodBreakConfig;
  days: number[]; // 1(จันทร์)..6(เสาร์)
};

export type GeneratedPeriodRow = {
  day_of_week: number;
  period_no: number;
  period_type: "teaching" | "break";
  label: string;
  start_time: string;
  end_time: string;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** One day's rows — period_no counts teaching + break rows together (they share one sequence, see Timetable.tsx grid). */
function generateDayPeriods(
  input: Omit<GeneratePeriodsInput, "days">,
): Omit<GeneratedPeriodRow, "day_of_week">[] {
  const breaks = [input.recess, input.lunch].filter((b): b is PeriodBreakConfig => !!b?.enabled);
  let clock = toMinutes(input.startTime);
  let periodNo = 1;
  const rows: Omit<GeneratedPeriodRow, "day_of_week">[] = [];

  for (let teaching = 1; teaching <= input.periodsPerDay; teaching++) {
    const end = clock + input.minutesPerPeriod;
    rows.push({ period_no: periodNo++, period_type: "teaching", label: "", start_time: toHHMM(clock), end_time: toHHMM(end) });
    clock = end;

    for (const b of breaks) {
      if (b.afterPeriod !== teaching) continue;
      const breakEnd = clock + b.minutes;
      rows.push({
        period_no: periodNo++,
        period_type: "break",
        label: b.label,
        start_time: toHHMM(clock),
        end_time: toHHMM(breakEnd),
      });
      clock = breakEnd;
    }
  }
  return rows;
}

export function generatePeriods(input: GeneratePeriodsInput): GeneratedPeriodRow[] {
  const dayRows = generateDayPeriods(input);
  return input.days.flatMap((day) => dayRows.map((r) => ({ ...r, day_of_week: day })));
}
