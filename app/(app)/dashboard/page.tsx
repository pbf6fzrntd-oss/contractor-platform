import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { requireAppContext } from "@/lib/auth/context";
import { formatDuration, formatPercent } from "@/lib/automation/metrics";
import { money } from "@/lib/format";
import { stageLabel } from "@/lib/leads/stages";
import { createClient } from "@/lib/supabase/server";
import { loadCoreMetrics } from "@/lib/services/metrics";
import { RecurringMetricsSection } from "./recurring-metrics";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { org } = await requireAppContext("/dashboard");
  const supabase = await createClient();
  const m = await loadCoreMetrics(supabase, org);
  const estimateWord = stageLabel(org.business_type, "estimate_sent").replace(/ sent$/, "");

  return (
    <>
      <PageHeader title="Dashboard" subtitle={org.name} />
      <div className="flex flex-col gap-3">
        <StatTile
          hero
          label="New leads, last 7 days"
          value={String(m.leadsThisWeek)}
          delta={{ change: m.leadsThisWeek - m.leadsLastWeek, goodWhenUp: true, period: "the week before" }}
        />
        <div className="grid grid-cols-2 gap-3">
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
        <StatTile
          label="Missed calls, last 7 days"
          value={String(m.missedCallsThisWeek)}
          detail={
            m.missedCallsThisWeek
              ? `${m.missedCallsTextedBack} got an automatic text back within seconds`
              : "Every missed call gets a text back automatically"
          }
        />
        <RecurringMetricsSection org={org} />
      </div>
    </>
  );
}
