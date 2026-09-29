import { describe, expect, it } from "vitest";
import { computeCoreMetrics, computeRecurringMetrics, formatDuration, formatPercent, median, type LeadRow } from "@/lib/automation/metrics";

const now = new Date("2026-09-29T16:00:00Z");
const daysAgo = (d: number, extraMinutes = 0) => new Date(now.getTime() - d * 86_400_000 + extraMinutes * 60_000).toISOString();
const lead = (over: Partial<LeadRow>): LeadRow => ({
  created_at: daysAgo(1),
  stage: "new",
  first_response_at: null,
  estimate_amount_cents: null,
  won_at: null,
  lost_at: null,
  ...over,
});

describe("dashboard metrics", () => {
  const leads: LeadRow[] = [
    lead({ created_at: daysAgo(1), first_response_at: daysAgo(1, 10) }), // 10 min
    lead({ created_at: daysAgo(3), first_response_at: daysAgo(3, 30) }), // 30 min
    lead({ created_at: daysAgo(5), first_response_at: daysAgo(5, 240) }), // 4 hr
    lead({ created_at: daysAgo(9), stage: "estimate_sent", estimate_amount_cents: 450000 }),
    lead({ created_at: daysAgo(40), stage: "estimate_sent", estimate_amount_cents: 120000 }),
    lead({ created_at: daysAgo(20), stage: "won", won_at: daysAgo(10) }),
    lead({ created_at: daysAgo(30), stage: "won", won_at: daysAgo(15) }),
    lead({ created_at: daysAgo(30), stage: "lost", lost_at: daysAgo(12) }),
    lead({ created_at: daysAgo(200), stage: "won", won_at: daysAgo(150) }), // too old for win rate
  ];
  const m = computeCoreMetrics({
    leads,
    calls: [
      { created_at: daysAgo(1), status: "missed", text_back_sent: true },
      { created_at: daysAgo(2), status: "missed", text_back_sent: false },
      { created_at: daysAgo(2), status: "answered", text_back_sent: false },
      { created_at: daysAgo(10), status: "missed", text_back_sent: true },
    ],
    reviewRequestTimes: [daysAgo(2), daysAgo(40)],
    now,
    monthStart: new Date("2026-09-01T04:00:00Z"),
  });

  it("counts leads this week vs last week", () => {
    expect(m.leadsThisWeek).toBe(3);
    expect(m.leadsLastWeek).toBe(1);
  });
  it("uses the median response time, so one slow day doesn't skew it", () => {
    expect(m.medianResponseMinutes).toBe(30);
    expect(m.responseSampleSize).toBe(3);
  });
  it("totals open estimates of any age", () => {
    expect(m.estimatesOutstanding).toBe(2);
    expect(m.estimatesOutstandingCents).toBe(570000);
  });
  it("computes win rate over the last 90 days", () => {
    expect(m.winRate).toBeCloseTo(2 / 3);
    expect(m.closedLast90Days).toBe(3);
  });
  it("counts this month's review requests and this week's missed calls", () => {
    expect(m.reviewsRequestedThisMonth).toBe(1);
    expect(m.missedCallsThisWeek).toBe(2);
    expect(m.missedCallsTextedBack).toBe(1);
  });
  it("handles a brand-new business with no data", () => {
    const empty = computeCoreMetrics({ leads: [], calls: [], reviewRequestTimes: [], now, monthStart: now });
    expect(empty.winRate).toBeNull();
    expect(empty.medianResponseMinutes).toBeNull();
    expect(formatPercent(empty.winRate)).toBe("–");
  });
});

describe("formatting", () => {
  it("formats durations and percents", () => {
    expect(formatDuration(8)).toBe("8 min");
    expect(formatDuration(150)).toBe("2.5 hr");
    expect(formatDuration(120)).toBe("2 hr");
    expect(formatDuration(3000)).toBe("2.1 days");
    expect(formatPercent(0.666)).toBe("67%");
    expect(median([5, 1, 3, 2])).toBe(2.5);
  });
});

describe("recurring customer metrics", () => {
  const row = (over: Partial<import("@/lib/automation/metrics").RecurringRow>) => ({
    status: "active",
    paused_until: null,
    start_date: "2026-03-01",
    canceled_on: null,
    cancel_reason: null,
    frequency: "weekly",
    price_cents: 4500,
    ...over,
  });
  const today = "2026-09-29";
  const rows = [
    row({}),
    row({ frequency: "biweekly", price_cents: 6000 }),
    row({ start_date: "2026-09-10" }), // new this month
    row({ status: "paused" }), // paused indefinitely
    row({ status: "paused", paused_until: "2026-09-20" }), // back already = active
    row({ status: "canceled", canceled_on: "2026-09-15", cancel_reason: "Price" }),
    row({ status: "canceled", canceled_on: "2026-09-20", cancel_reason: "Price" }),
    row({ status: "canceled", canceled_on: "2026-05-01", cancel_reason: "Moving" }), // long ago
  ];
  const m = computeRecurringMetrics(rows, today, "2026-09-01", "2026-08-30");

  it("counts active (including paused customers whose resume date has come) and paused", () => {
    expect(m.active).toBe(4);
    expect(m.paused).toBe(1);
  });
  it("counts new and canceled this month, with top reasons", () => {
    expect(m.newThisMonth).toBe(1);
    expect(m.canceledThisMonth).toBe(2);
    expect(m.topCancelReasons).toEqual([{ reason: "Price", count: 2 }]);
  });
  it("computes 30-day churn against customers active at the start", () => {
    // Active 30 days ago: everyone who started before Aug 30 and hadn't canceled before then = 6.
    expect(m.churn30Days).toBeCloseTo(2 / 6);
  });
  it("estimates monthly revenue from price and visit frequency", () => {
    // weekly $45 ×3 active weekly (incl. resumed) + biweekly $60
    const expected = Math.round(3 * 4500 * (52 / 12) + 6000 * (26 / 12));
    expect(m.estimatedMonthlyCents).toBe(expected);
  });
});
