import { addDays, localDateString } from "@/lib/time";

/**
 * Dashboard trend numbers (pure): leads per week and money won, so an owner
 * sees at a glance what the app brought in. Weeks start on Monday (local time).
 */
export type TrendLead = { created_at: string; source: string; stage: string; won_at: string | null; estimate_amount_cents: number | null };

export type Trend = {
  weeks: { start: string; leads: number }[];
  /** Won in the last 30 days: count and total of their estimates. */
  won30: { count: number; cents: number };
  /** Leads that started as a missed call in the last 30 days (would have been lost without the text-back). */
  missedCallLeads30: number;
  missedCallWon30: { count: number; cents: number };
};

/** Monday of the week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function computeTrend(leads: TrendLead[], now: Date, timeZone: string, weeks = 12): Trend {
  const today = localDateString(now, timeZone);
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const series = Array.from({ length: weeks }, (_, i) => ({ start: addDays(first, i * 7), leads: 0 }));
  const cutoff = now.getTime() - 30 * 86_400_000;
  const won30 = { count: 0, cents: 0 };
  const missedCallWon30 = { count: 0, cents: 0 };
  let missedCallLeads30 = 0;

  for (const l of leads) {
    const day = localDateString(new Date(l.created_at), timeZone);
    if (day >= first) {
      const idx = Math.floor((Date.parse(`${weekStart(day)}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / (7 * 86_400_000));
      if (series[idx]) series[idx].leads += 1;
    }
    if (l.source === "missed_call" && Date.parse(l.created_at) >= cutoff) missedCallLeads30 += 1;
    if (l.stage === "won" && l.won_at && Date.parse(l.won_at) >= cutoff) {
      won30.count += 1;
      won30.cents += l.estimate_amount_cents ?? 0;
      if (l.source === "missed_call") {
        missedCallWon30.count += 1;
        missedCallWon30.cents += l.estimate_amount_cents ?? 0;
      }
    }
  }
  return { weeks: series, won30, missedCallLeads30, missedCallWon30 };
}
