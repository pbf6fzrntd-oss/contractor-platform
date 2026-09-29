import { StatTile } from "@/components/stat-tile";
import { formatPercent } from "@/lib/automation/metrics";
import type { Org } from "@/lib/org";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { loadRecurringMetrics } from "@/lib/services/metrics";

/** Active customers, new vs canceled, churn and monthly revenue for lawn businesses. */
export async function RecurringMetricsSection({ org }: { org: Org }) {
  if (org.business_type !== "recurring") return null;
  const m = await loadRecurringMetrics(await createClient(), org);

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
