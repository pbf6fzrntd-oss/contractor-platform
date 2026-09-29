import { StatTile } from "@/components/stat-tile";
import { computeRecurringMetrics, formatPercent } from "@/lib/automation/metrics";
import type { Org } from "@/lib/org";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDateString } from "@/lib/time";

/** Active customers, new vs canceled, churn and monthly revenue for lawn businesses. */
export async function RecurringMetricsSection({ org }: { org: Org }) {
  if (org.business_type !== "recurring") return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_services")
    .select("status, paused_until, start_date, canceled_on, cancel_reason, frequency, price_cents")
    .eq("org_id", org.id)
    .limit(5000);
  const today = localDateString(new Date(), org.timezone);
  const m = computeRecurringMetrics(data ?? [], today, `${today.slice(0, 8)}01`, addDays(today, -30));

  return (
    <>
      <h2 className="mt-3 text-lg font-semibold">Recurring customers</h2>
      <StatTile
        label="Active customers"
        value={String(m.active)}
        detail={`${m.paused} paused · about ${money(m.estimatedMonthlyCents)}/month`}
      />
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="New this month" value={String(m.newThisMonth)} />
        <StatTile label="Canceled this month" value={String(m.canceledThisMonth)} />
      </div>
      <StatTile
        label="Churn, last 30 days"
        value={formatPercent(m.churn30Days)}
        detail={
          m.topCancelReasons.length
            ? `Top reasons: ${m.topCancelReasons.map((r) => `${r.reason} (${r.count})`).join(", ")}`
            : "Share of customers who canceled"
        }
      />
    </>
  );
}
