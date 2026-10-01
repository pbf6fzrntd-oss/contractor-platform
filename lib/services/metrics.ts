import "server-only";
import { loadAllReportRows } from "@/lib/services/report-rows";
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
  const cols = "id, created_at, stage, first_response_at, estimate_amount_cents, won_at, lost_at";

  const [leads, openEstimates, calls, reviews] = await Promise.all([
    loadAllReportRows((cursor, size) => {
      const q = db
      .from("leads")
      .select(cols)
      .eq("org_id", org.id)
      .or(`created_at.gte.${since},won_at.gte.${since},lost_at.gte.${since}`)
      .neq("stage", "estimate_sent").lte("created_at", now.toISOString()).order("id").limit(size);
      return cursor ? q.gt("id", cursor) : q;
    }),
    loadAllReportRows((cursor, size) => {
      const q = db.from("leads").select(cols).eq("org_id", org.id).eq("stage", "estimate_sent").lte("created_at", now.toISOString()).order("id").limit(size);
      return cursor ? q.gt("id", cursor) : q;
    }),
    loadAllReportRows((cursor, size) => {
      const q = db
      .from("calls")
      .select("id, created_at, status, text_back_sent")
      .eq("org_id", org.id)
      .gte("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
      .lte("created_at", now.toISOString()).order("id").limit(size);
      return cursor ? q.gt("id", cursor) : q;
    }),
    loadAllReportRows((cursor, size) => {
      const q = db
      .from("scheduled_messages")
      .select("id, processed_at")
      .eq("org_id", org.id)
      .eq("kind", "review_request")
      .eq("status", "sent")
      .gte("processed_at", monthStart.toISOString()).lte("processed_at", now.toISOString()).order("id").limit(size);
      return cursor ? q.gt("id", cursor) : q;
    }),
  ]);

  return computeCoreMetrics({
    leads: [...leads, ...openEstimates],
    calls,
    reviewRequestTimes: reviews.map((r) => r.processed_at!).filter(Boolean),
    now,
    monthStart,
  });
}

export async function loadRecurringMetrics(db: Db, org: Pick<Org, "id" | "timezone">, now = new Date()): Promise<RecurringMetrics> {
  const data = await loadAllReportRows((cursor, size) => {
    const q = db
    .from("recurring_services")
    .select("id, status, paused_until, start_date, canceled_on, cancel_reason, frequency, price_cents")
    .eq("org_id", org.id)
    .order("id").limit(size);
    return cursor ? q.gt("id", cursor) : q;
  });
  const today = localDateString(now, org.timezone);
  return computeRecurringMetrics(data, today, `${today.slice(0, 8)}01`, addDays(today, -30));
}

/** Leads per week and money won (dashboard trend). */
export async function loadTrend(db: Db, org: Pick<Org, "id" | "timezone">, now = new Date()): Promise<Trend> {
  const since = new Date(now.getTime() - 100 * 86_400_000).toISOString();
  const data = await loadAllReportRows((cursor, size) => {
    const q = db
    .from("leads")
    .select("id, created_at, source, stage, won_at, estimate_amount_cents")
    .eq("org_id", org.id)
    .or(`created_at.gte.${since},won_at.gte.${since}`)
    .lte("created_at", now.toISOString()).order("id").limit(size);
    return cursor ? q.gt("id", cursor) : q;
  });
  return computeTrend(data, now, org.timezone);
}
