import type { DateOption } from "./types";

const ISTANBUL_TZ = "Europe/Istanbul";

/** "en-CA" formats short dates as YYYY-MM-DD, which is what we store/compare. */
function formatIstanbulDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

/**
 * Pure calendar-day arithmetic on a YYYY-MM-DD string. Uses a UTC-based
 * Date purely as a day counter (never reads real UTC-vs-Istanbul offsets),
 * so this stays correct across DST changes and UTC-date pitfalls.
 */
function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function addDays(dateStr: string, days: number): string {
  const { year, month, day } = parseDateParts(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function endOfMonth(dateStr: string): string {
  const { year, month } = parseDateParts(dateStr);
  // Day 0 of next month == last day of this month.
  const utc = new Date(Date.UTC(year, month, 0));
  return utc.toISOString().slice(0, 10);
}

export type DateRange = {
  fromDate: string;
  toDate: string;
};

/** All date math is anchored to "today" in Europe/Istanbul, computed server-side. */
export function resolveDateRange(option: DateOption, now: Date = new Date()): DateRange {
  const today = formatIstanbulDate(now);

  switch (option) {
    case "tomorrow": {
      const tomorrow = addDays(today, 1);
      return { fromDate: tomorrow, toDate: tomorrow };
    }
    case "this_week":
      return { fromDate: today, toDate: addDays(today, 6) };
    case "this_month":
      return { fromDate: today, toDate: endOfMonth(today) };
  }
}
