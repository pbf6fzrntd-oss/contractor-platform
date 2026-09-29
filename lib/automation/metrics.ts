/**
 * Owner dashboard numbers, computed from plain rows so they're easy to test.
 * "This week" = the last 7 days; compared with the 7 days before that.
 */

const DAY = 86_400_000;

export type LeadRow = {
  created_at: string;
  stage: string;
  first_response_at: string | null;
  estimate_amount_cents: number | null;
  won_at: string | null;
  lost_at: string | null;
};

export type CallRow = { created_at: string; status: string; text_back_sent: boolean };

export type CoreMetrics = {
  leadsThisWeek: number;
  leadsLastWeek: number;
  /** Median minutes from lead arriving to the first reply a person typed (last 30 days). */
  medianResponseMinutes: number | null;
  responseSampleSize: number;
  estimatesOutstanding: number;
  estimatesOutstandingCents: number;
  /** Won ÷ (won + lost) for leads closed in the last 90 days. */
  winRate: number | null;
  closedLast90Days: number;
  reviewsRequestedThisMonth: number;
  missedCallsThisWeek: number;
  missedCallsTextedBack: number;
};

function within(iso: string | null, from: number, to: number) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= from && t < to;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeCoreMetrics(input: {
  leads: LeadRow[];
  calls: CallRow[];
  reviewRequestTimes: string[];
  now: Date;
  monthStart: Date;
}): CoreMetrics {
  const now = input.now.getTime();
  const end = now + 1;
  const weekAgo = now - 7 * DAY;
  const twoWeeksAgo = now - 14 * DAY;

  const responseMinutes = input.leads
    .filter((l) => l.first_response_at && within(l.created_at, now - 30 * DAY, end))
    .map((l) => Math.max(0, (Date.parse(l.first_response_at!) - Date.parse(l.created_at)) / 60_000));

  const outstanding = input.leads.filter((l) => l.stage === "estimate_sent");
  const won = input.leads.filter((l) => l.stage === "won" && within(l.won_at, now - 90 * DAY, end)).length;
  const lost = input.leads.filter((l) => l.stage === "lost" && within(l.lost_at, now - 90 * DAY, end)).length;
  const missed = input.calls.filter((c) => c.status === "missed" && within(c.created_at, weekAgo, end));

  return {
    leadsThisWeek: input.leads.filter((l) => within(l.created_at, weekAgo, end)).length,
    leadsLastWeek: input.leads.filter((l) => within(l.created_at, twoWeeksAgo, weekAgo)).length,
    medianResponseMinutes: median(responseMinutes),
    responseSampleSize: responseMinutes.length,
    estimatesOutstanding: outstanding.length,
    estimatesOutstandingCents: outstanding.reduce((sum, l) => sum + (l.estimate_amount_cents ?? 0), 0),
    winRate: won + lost > 0 ? won / (won + lost) : null,
    closedLast90Days: won + lost,
    reviewsRequestedThisMonth: input.reviewRequestTimes.filter((t) => within(t, input.monthStart.getTime(), end)).length,
    missedCallsThisWeek: missed.length,
    missedCallsTextedBack: missed.filter((c) => c.text_back_sent).length,
  };
}

/** "8 min", "2.5 hr", "1.2 days" */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "–";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} hr`;
  return `${(minutes / 1440).toFixed(1).replace(/\.0$/, "")} days`;
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? "–" : `${Math.round(ratio * 100)}%`;
}
