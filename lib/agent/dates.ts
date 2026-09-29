import { addDays, weekdayOf } from "@/lib/time";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Turns what an assistant (or person) says into a calendar date:
 * "today", "tomorrow", "yesterday", "2026-10-01", or a weekday like
 * "Thursday". A weekday means the next one on or after `base`
 * (or strictly after it when `after` is true, e.g. "move to Thursday").
 * Returns null if it can't tell.
 */
export function resolveDay(input: string | undefined, base: string, options: { after?: boolean } = {}): string | null {
  const s = (input ?? "today").trim().toLowerCase();
  if (s === "today") return options.after ? null : base;
  if (s === "tomorrow") return addDays(base, 1);
  if (s === "yesterday") return options.after ? null : addDays(base, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const check = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
    if (check !== s) return null;
    if (options.after && s <= base) return null;
    return s;
  }
  const idx = WEEKDAYS.findIndex((w) => w === s || w.slice(0, 3) === s.slice(0, 3));
  if (idx >= 0 && s.length >= 3) {
    let shift = (idx - weekdayOf(base) + 7) % 7;
    if (options.after && shift === 0) shift = 7;
    return addDays(base, shift);
  }
  return null;
}
