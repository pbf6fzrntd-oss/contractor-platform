import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { requireAppContext } from "@/lib/auth/context";
import { formatDuration, formatPercent } from "@/lib/automation/metrics";
import { money } from "@/lib/format";
import { stageLabel } from "@/lib/leads/stages";
import { createClient } from "@/lib/supabase/server";
import { loadCoreMetrics, loadTrend } from "@/lib/services/metrics";
import { WeeklyBars } from "@/components/weekly-bars";
import { RecurringMetricsSection } from "./recurring-metrics";
import { SourcesSection } from "./sources";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { org } = await requireAppContext("/dashboard");
  const supabase = await createClient();
  const [m, trend] = await Promise.all([loadCoreMetrics(supabase, org), loadTrend(supabase, org)]);
  const estimateWord = stageLabel(org.business_type, "estimate_sent", org.industry).replace(/ sent$/, "");

  return (
    <div data-wide>
      <PageHeader title="Dashboard" subtitle={org.name} />
      <div className="flex flex-col gap-3 lg:gap-5">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
          <StatTile
            hero
            label="New leads, last 7 days"
            value={String(m.leadsThisWeek)}
            delta={{ change: m.leadsThisWeek - m.leadsLastWeek, goodWhenUp: true, period: "the week before" }}
          />
          <StatTile
            hero
            label="Won, last 30 days"
            value={money(trend.won30.cents)}
            detail={trend.won30.count ? `${trend.won30.count} ${trend.won30.count === 1 ? "job" : "jobs"} won` : "Mark leads as won to track this"}
          />
          <StatTile
            hero
            label="Saved from missed calls, last 30 days"
            value={String(trend.missedCallLeads30)}
            detail={
              trend.missedCallWon30.count
                ? `${trend.missedCallWon30.count} became ${trend.missedCallWon30.count === 1 ? "a job" : "jobs"} worth ${money(trend.missedCallWon30.cents)}`
                : "Callers who got an automatic text back"
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          <StatTile
            label="Time to first reply"
            value={formatDuration(m.medianResponseMinutes)}
            detail={m.responseSampleSize ? `Typical, last 30 days (${m.responseSampleSize} ${m.responseSampleSize === 1 ? "lead" : "leads"})` : "Reply to a lead to start tracking"}
          />
          <StatTile
            label="Win rate"
            value={formatPercent(m.winRate)}
            detail={m.closedLast90Days ? `${m.closedLast90Days} closed, last 90 days` : "No won/lost leads yet"}
          />
          <StatTile
            label={`Open ${estimateWord.toLowerCase()}s`}
            value={String(m.estimatesOutstanding)}
            detail={m.estimatesOutstandingCents ? `${money(m.estimatesOutstandingCents)} waiting` : undefined}
          />
          <StatTile label="Review requests" value={String(m.reviewsRequestedThisMonth)} detail="Sent this month" />
        </div>
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
          <div className="lg:col-span-2">
            <WeeklyBars title="New leads per week" subtitle="Last 12 weeks" weeks={trend.weeks.map((w) => ({ start: w.start, value: w.leads }))} unit={["lead", "leads"]} />
          </div>
          <StatTile
            label="Missed calls, last 7 days"
            value={String(m.missedCallsThisWeek)}
            detail={
              m.missedCallsThisWeek
                ? `${m.missedCallsTextedBack} got an automatic text back within seconds`
                : "Every missed call gets a text back automatically"
            }
          />
        </div>
        <RecurringMetricsSection org={org} />
        <SourcesSection org={org} />
      </div>
    </div>
  );
}
