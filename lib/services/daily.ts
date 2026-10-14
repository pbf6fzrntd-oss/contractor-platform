import "server-only";
import { credentialAlertDue, credentialAlertText, vaccineReminderDue, VACCINE_REMINDER_DAYS, VACCINE_REMINDER_GRACE_DAYS } from "@/lib/automation/expiry";
import { parseBookingSettings } from "@/lib/booking/settings";
import { RETENTION, retentionCutoff } from "@/lib/automation/retention";
import type { Json } from "@/lib/database.types";
import { reportError } from "@/lib/monitoring/report";
import { toOrg } from "@/lib/org";
import { notifyOwner } from "@/lib/services/conversations";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateString } from "@/lib/time";

/**
 * Jobs that run once a day, from the every-minute scheduler (no extra setup).
 * They start after 12:00 UTC (7–8am in Charleston). A row in job_runs makes
 * sure each job runs once per day even if the scheduler is called many times.
 */
export const DAILY_START_HOUR_UTC = 12;
export const DAILY_STALE_AFTER_MS = 10 * 60_000;

export function failedDailyResult(result: Json | null): boolean {
  return Boolean(result && typeof result === "object" && !Array.isArray(result) && "error" in result);
}

type DailyJob = (db: AdminClient, now: Date) => Promise<Json>;

const JOBS: Record<string, DailyJob> = {
  credential_expiry: alertExpiringCredentials,
  vaccine_expiry: queueVaccineReminders,
  cleanup: cleanUpOldRecords,
};

export async function runDailyJobs(db: AdminClient, now = new Date(), moduleJobs: { name: string; run: DailyJob }[] = []): Promise<Record<string, Json>> {
  if (now.getUTCHours() < DAILY_START_HOUR_UTC) return {};
  const today = now.toISOString().slice(0, 10);
  const results: Record<string, Json> = {};
  const all: [string, DailyJob][] = [...Object.entries(JOBS), ...moduleJobs.map((j) => [j.name, j.run] as [string, DailyJob])];
  for (const [name, job] of all) {
    try {
      // Preserve the once-a-day claim even after a partial failure. Replaying a
      // job could duplicate notifications or texts already queued before it failed.
      const { data: claimed } = await db.from("job_runs").upsert({ job: name, run_on: today }, { onConflict: "job,run_on", ignoreDuplicates: true }).select("job").throwOnError();
      if (!claimed?.length) {
        const { data: previous } = await db.from("job_runs").select("result, ran_at").eq("job", name).eq("run_on", today).maybeSingle().throwOnError();
        if (previous && failedDailyResult(previous.result)) results[name] = { error: "previous_run_failed" };
        else if (previous && previous.result === null && now.getTime() - Date.parse(previous.ran_at) >= DAILY_STALE_AFTER_MS) results[name] = { error: "incomplete_run" };
        continue;
      }
      try {
        results[name] = await job(db, now);
      } catch (error) {
        results[name] = { error: "job_failed" };
        console.error("Daily job failed", name);
        await reportError(error, { where: "server", route: `daily:${name}`, path: "/api/cron/dispatch" });
      }
      await db.from("job_runs").update({ result: results[name] }).eq("job", name).eq("run_on", today).throwOnError();
    } catch (error) {
      results[name] = { error: "job_tracking_failed" };
      console.error("Daily job tracking failed", name);
      await reportError(error, { where: "server", route: `daily:${name}`, path: "/api/cron/dispatch" });
    }
  }
  return results;
}

/** Warns owners 30 days and 7 days before a license or insurance policy expires, and when it has. */
export async function alertExpiringCredentials(db: AdminClient, now = new Date()): Promise<Json> {
  const horizon = addDays(now.toISOString().slice(0, 10), 32);
  const { data: rows } = await db
    .from("business_credentials")
    .select("id, org_id, label, expires_on, expiry_alert_stage, expiry_alert_for")
    .not("expires_on", "is", null)
    .lte("expires_on", horizon)
    .limit(2000).throwOnError();
  const orgIds = [...new Set((rows ?? []).map((r) => r.org_id))];
  const { data: orgs } = orgIds.length ? await db.from("organizations").select("id, timezone").in("id", orgIds).throwOnError() : { data: [] };
  let alerted = 0;
  for (const c of rows ?? []) {
    const today = localDateString(now, orgs?.find((o) => o.id === c.org_id)?.timezone ?? "America/New_York");
    const stage = credentialAlertDue({ expiresOn: c.expires_on, alertStage: c.expiry_alert_stage, alertFor: c.expiry_alert_for }, today);
    if (!stage) continue;
    // Record first, so a failure while notifying never causes repeat alerts.
    const { data: marked } = await db
      .from("business_credentials")
      .update({ expiry_alert_stage: stage, expiry_alert_for: c.expires_on })
      .eq("id", c.id)
      .select("id").throwOnError();
    if (!marked?.length) continue;
    await notifyOwner(db, c.org_id, { kind: "system", body: credentialAlertText(c.label, stage, c.expires_on!, today), link: "/settings/licenses" });
    alerted += 1;
  }
  return { alerted };
}

/** Queues a reminder text for vaccine records on file that expire within 2 weeks. The outbox re-checks and sends in business hours. */
export async function queueVaccineReminders(db: AdminClient, now = new Date()): Promise<Json> {
  const utcToday = now.toISOString().slice(0, 10);
  const { data: files } = await db
    .from("files")
    .select("id, org_id, contact_id, subject_id, document_type, expires_on, reminder_sent_at, deleted_at")
    .eq("kind", "vaccination_record")
    .is("deleted_at", null)
    .is("reminder_sent_at", null)
    .not("contact_id", "is", null)
    .gte("expires_on", addDays(utcToday, -VACCINE_REMINDER_GRACE_DAYS - 1))
    .lte("expires_on", addDays(utcToday, VACCINE_REMINDER_DAYS + 1))
    .limit(2000).throwOnError();
  const orgIds = [...new Set((files ?? []).map((f) => f.org_id))];
  const { data: orgRows } = orgIds.length ? await db.from("organizations").select("*").in("id", orgIds).throwOnError() : { data: [] };
  let queued = 0;
  for (const f of files ?? []) {
    const orgRow = orgRows?.find((o) => o.id === f.org_id);
    if (!orgRow) continue;
    const org = toOrg(orgRow);
    if (!parseBookingSettings(org.booking_settings).vaccineReminders) continue;
    const today = localDateString(now, org.timezone);
    let newer = db
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("org_id", f.org_id)
      .eq("kind", "vaccination_record")
      .is("deleted_at", null)
      .gt("expires_on", f.expires_on!);
    newer = f.subject_id ? newer.eq("subject_id", f.subject_id) : newer.eq("contact_id", f.contact_id!);
    newer = f.document_type ? newer.eq("document_type", f.document_type) : newer.is("document_type", null);
    const { count } = await newer.throwOnError();
    if (!vaccineReminderDue({ expiresOn: f.expires_on, reminderSentAt: f.reminder_sent_at, hasNewerRecord: Boolean(count), deleted: Boolean(f.deleted_at) }, today)) continue;
    const { data: marked } = await db.from("files").update({ reminder_sent_at: now.toISOString() }).eq("id", f.id).is("reminder_sent_at", null).select("id").throwOnError();
    if (!marked?.length) continue;
    await db.from("scheduled_messages").insert({
      org_id: f.org_id,
      contact_id: f.contact_id!,
      kind: "vaccine_reminder",
      category: "informational",
      send_at: now.toISOString(),
      context: { file_id: f.id },
    }).throwOnError();
    queued += 1;
  }
  return { queued };
}

/** Deletes short-lived records past their keep-for time (see lib/automation/retention.ts). */
export async function cleanUpOldRecords(db: AdminClient, now = new Date()): Promise<Json> {
  const deleted: Record<string, number> = {};
  for (const rule of RETENTION) {
    let q = db.from(rule.table).delete({ count: "exact" }).lt(rule.column, retentionCutoff(rule, now));
    // Accepted invitations stay (they show who joined when).
    if (rule.table === "invitations") q = q.is("accepted_at", null);
    const { count, error } = await q;
    if (error) throw error;
    deleted[rule.table] = count ?? 0;
  }
  return deleted;
}
