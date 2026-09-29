import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { requireAppContext } from "@/lib/auth/context";
import { computeCoreMetrics, formatDuration, formatPercent } from "@/lib/automation/metrics";
import { money } from "@/lib/format";
import { stageLabel } from "@/lib/leads/stages";
import { createClient } from "@/lib/supabase/server";
import { localDateString, zonedTimeToUtc } from "@/lib/time";
import { RecurringMetricsSection } from "./recurring-metrics";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { org } = await requireAppContext("/dashboard");
  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  const monthStart = zonedTimeToUtc(`${localDateString(now, org.timezone).slice(0, 8)}01`, 0, 0, org.timezone);

  const [{ data: leads }, { data: openEstimates }, { data: calls }, { data: reviews }] = await Promise.all([
    supabase
      .from("leads")
      .select("created_at, stage, first_response_at, estimate_amount_cents, won_at, lost_at")
      .eq("org_id", org.id)
      .or(`created_at.gte.${since},won_at.gte.${since},lost_at.gte.${since}`)
      .neq("stage", "estimate_sent")
      .limit(5000),
    supabase
      .from("leads")
      .select("created_at, stage, first_response_at, estimate_amount_cents, won_at, lost_at")
      .eq("org_id", org.id)
      .eq("stage", "estimate_sent")
      .limit(5000),
    supabase
      .from("calls")
      .select("created_at, status, text_back_sent")
      .eq("org_id", org.id)
      .gte("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
      .limit(5000),
    supabase
      .from("scheduled_messages")
      .select("processed_at")
      .eq("org_id", org.id)
      .eq("kind", "review_request")
      .eq("status", "sent")
      .gte("processed_at", monthStart.toISOString()),
  ]);

  const m = computeCoreMetrics({
    leads: [...(leads ?? []), ...(openEstimates ?? [])],
    calls: calls ?? [],
    reviewRequestTimes: (reviews ?? []).map((r) => r.processed_at!).filter(Boolean),
    now,
    monthStart,
  });
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
