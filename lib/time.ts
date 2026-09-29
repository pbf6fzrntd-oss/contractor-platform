/**
 * Time-zone helpers. Everything is stored in UTC; these convert to and from a
 * business's local time (e.g. America/New_York), handling daylight saving.
 * Calendar dates are plain "YYYY-MM-DD" strings.
 */

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The moment when the clock in `timeZone` shows this local date and time. */
export function zonedTimeToUtc(dateString: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = dateString.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const first = offsetMs(new Date(guess), timeZone);
  let result = guess - first;
  const second = offsetMs(new Date(result), timeZone);
  if (second !== first) result = guess - second;
  return new Date(result);
}

/** Local calendar date ("YYYY-MM-DD") of a moment. */
export function localDateString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(dateString: string): number {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type HourWindow = { start: number; end: number };

export function isWithinWindow(date: Date, timeZone: string, window: HourWindow): boolean {
  const { hour } = zonedParts(date, timeZone);
  return hour >= window.start && hour < window.end;
}

/** `date` if it's inside the window, otherwise the next time the window opens. */
export function nextTimeInWindow(date: Date, timeZone: string, window: HourWindow): Date {
  if (isWithinWindow(date, timeZone, window)) return date;
  const today = localDateString(date, timeZone);
  const { hour } = zonedParts(date, timeZone);
  const day = hour < window.start ? today : addDays(today, 1);
  return zonedTimeToUtc(day, window.start, 0, timeZone);
}

export const DAY_NAMES = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
} as const;
