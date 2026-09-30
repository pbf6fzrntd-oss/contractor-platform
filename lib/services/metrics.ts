import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCoreMetrics, computeRecurringMetrics, type CoreMetrics, type RecurringMetrics } from "@/lib/automation/metrics";
import type { Database } from "@/lib/database.types";
import { computeTrend, type Trend } from "@/lib/automation/trend";
import type { Org } from "@/lib/org";
import { addDays, localDateString, zonedTimeToUtc } from "@/lib/time";

type Db = SupabaseClient<Database>;

/** The dashboard numbers. Used by the Dashboard screen and the AI assistant. */
export async function loadCoreMetrics(db: Db, org: Pick<Org, "id" | "timezone">, now = new Date()): Promise<CoreMetrics> {
  const since = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  const monthStart = zonedTimeToUtc(`${localDateString(now, org.timezone).slice(0, 8)}01`, 0, 0, org.timezone);
  const cols = "created_at, stage, first_response_at, estimate_amount_cents, won_at, lost_at";

  const [{ data: leads }, { data: openEstimates }, { data: calls }, { data: reviews }] = await Promise.all([
    db
      .from("leads")
      .select(cols)
      .eq("org_id", org.id)
      .or(`created_at.gte.${since},won_at.gte.${since},lost_at.gte.${since}`)
      .neq("stage", "estimate_sent")
      .limit(5000),
    db.from("leads").select(cols).eq("org_id", org.id).eq("stage", "estimate_sent").limit(5000),
    db
      .from("calls")
      .select("created_at, status, text_back_sent")
      .eq("org_id", org.id)
      .gte("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
      .limit(5000),
    db
      .from("scheduled_messages")
      .select("processed_at")
      .eq("org_id", org.id)
      .eq("kind", "review_request")
      .eq("status", "sent")
      .gte("processed_at", monthStart.toISOString()),
  ]);

  return computeCoreMetrics({
    leads: [...(leads ?? []), ...(openEstimates ?? [])],
    calls: calls ?? [],
    reviewRequestTimes: (reviews ?? []).map((r) => r.processed_at!).filter(Boolean),
    now,
    monthStart,
  });
}

export async function loadRecurringMetrics(db: Db, org: Pick<Org, "id" | "timezone">, now = new Date()): Promise<RecurringMetrics> {
  const { data } = await db
    .from("recurring_services")
    .select("status, paused_until, start_date, canceled_on, cancel_reason, frequency, price_cents")
    .eq("org_id", org.id)
    .limit(5000);
  const today = localDateString(now, org.timezone);
  return computeRecurringMetrics(data ?? [], today, `${today.slice(0, 8)}01`, addDays(today, -30));
}

/** Leads per week and money won (dashboard trend). */
export async function loadTrend(db: Db, org: Pick<Org, "id" | "timezone">, now = new Date()): Promise<Trend> {
  const since = new Date(now.getTime() - 100 * 86_400_000).toISOString();
  const { data } = await db
    .from("leads")
    .select("created_at, source, stage, won_at, estimate_amount_cents")
    .eq("org_id", org.id)
    .or(`created_at.gte.${since},won_at.gte.${since}`)
    .limit(5000);
  return computeTrend(data ?? [], now, org.timezone);
}
