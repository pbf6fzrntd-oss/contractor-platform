import { addDays, daysBetween, weekdayOf } from "@/lib/time";

/**
 * Recurring service schedules (lawn care). Dates are "YYYY-MM-DD" strings in
 * the business's local calendar.
 */

export const FREQUENCIES = ["weekly", "biweekly", "every_4_weeks"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  every_4_weeks: "Every 4 weeks",
};

const INTERVAL_WEEKS: Record<Frequency, number> = { weekly: 1, biweekly: 2, every_4_weeks: 4 };

export type ServiceSchedule = {
  id: string;
  frequency: string;
  service_day: number;
  start_date: string;
  status: string;
  paused_until: string | null;
};

/** One-off moves, e.g. a rain delay moving Tuesday's customers to Thursday. */
export type DateMove = { recurring_service_id: string; from_date: string; to_date: string };

/** "paused" with a resume date that has arrived counts as active. */
export function effectiveStatus(s: Pick<ServiceSchedule, "status" | "paused_until">, date: string): "active" | "paused" | "canceled" {
  if (s.status === "paused" && s.paused_until && s.paused_until <= date) return "active";
  return s.status === "paused" || s.status === "canceled" ? s.status : "active";
}

/** The first service date on or after start_date that falls on the service day. */
export function firstServiceDate(s: Pick<ServiceSchedule, "start_date" | "service_day">): string {
  const shift = (s.service_day - weekdayOf(s.start_date) + 7) % 7;
  return addDays(s.start_date, shift);
}

/** Is this customer normally due on `date` (ignoring pauses and moves)? */
export function isRegularServiceDate(s: ServiceSchedule, date: string): boolean {
  const first = firstServiceDate(s);
  const diff = daysBetween(first, date);
  if (diff < 0 || diff % 7 !== 0) return false;
  const interval = INTERVAL_WEEKS[s.frequency as Frequency] ?? 1;
  return (diff / 7) % interval === 0;
}

/** Is this customer on the schedule for `date`, counting pauses, cancellations and moves? */
export function isScheduledOn(s: ServiceSchedule, date: string, moves: DateMove[] = []): boolean {
  if (effectiveStatus(s, date) !== "active") return false;
  const mine = moves.filter((m) => m.recurring_service_id === s.id);
  if (mine.some((m) => m.to_date === date)) return true;
  if (mine.some((m) => m.from_date === date)) return false;
  return isRegularServiceDate(s, date);
}

/** Next date on or after `from` this customer is scheduled (within a year), or null. */
export function nextServiceDate(s: ServiceSchedule, from: string, moves: DateMove[] = []): string | null {
  for (let i = 0; i < 366; i++) {
    const d = addDays(from, i);
    if (isScheduledOn(s, d, moves)) return d;
  }
  return null;
}

// --- Parsing what people type or paste (spreadsheets) ----------------------

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, domingo: 0,
  mon: 1, monday: 1, lunes: 1,
  tue: 2, tues: 2, tuesday: 2, martes: 2,
  wed: 3, weds: 3, wednesday: 3, miercoles: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, jueves: 4,
  fri: 5, friday: 5, viernes: 5,
  sat: 6, saturday: 6, sabado: 6,
};

export function parseServiceDay(input: string): number | null {
  const key = input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return key in DAY_WORDS ? DAY_WORDS[key] : null;
}

export function parseFrequency(input: string): Frequency | null {
  const s = input.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/^(weekly|every week|1 week|each week|w|semanal)$/.test(s)) return "weekly";
  if (/^(biweekly|bi weekly|every other week|every 2 weeks|2 weeks|eow|quincenal|cada dos semanas)$/.test(s)) return "biweekly";
  if (/^(monthly|every 4 weeks|4 weeks|every four weeks|mensual)$/.test(s)) return "every_4_weeks";
  return null;
}
