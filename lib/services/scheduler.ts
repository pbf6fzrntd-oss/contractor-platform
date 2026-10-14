import "server-only";
import type { Json } from "@/lib/database.types";
import { reportError } from "@/lib/monitoring/report";
import { expireStaleBookings } from "@/lib/services/booking-maintenance";
import { failedDailyResult, runDailyJobs } from "@/lib/services/daily";
import { deleteExpiredDemos } from "@/lib/services/demo";
import { runDispatch } from "@/lib/services/outbox";
import type { AdminClient } from "@/lib/supabase/admin";

type DailyJob = { name: string; run: (db: AdminClient, now: Date) => Promise<Json> };

/** Independent jobs must still run when another job fails. Failed work is never
 * disguised as an empty success, and database/provider details stay out of HTTP responses. */
export async function runScheduler(db: AdminClient, now = new Date(), moduleJobs: DailyJob[] = []) {
  const errors: string[] = [];
  async function attempt<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (error) {
      errors.push(name);
      console.error("Scheduler stage failed", name);
      await reportError(error, { where: "server", route: `scheduler:${name}`, path: "/api/cron/dispatch" });
      return null;
    }
  }

  const dispatch = await attempt("dispatch", () => runDispatch(db, { now }));
  if (dispatch?.failed) errors.push("dispatch_items");
  const released = await attempt("booking_expiry", () => expireStaleBookings(db, now));
  const daily = await attempt("daily", () => runDailyJobs(db, now, moduleJobs));
  if (daily && Object.values(daily).some(failedDailyResult)) {
    errors.push("daily_jobs");
  }
  const demosDeleted = await attempt("demo_cleanup", () => deleteExpiredDemos(db, now));
  return {
    status: errors.length ? "partial_failure" as const : "ok" as const,
    ...(dispatch ?? {}),
    released,
    ...(daily && Object.keys(daily).length ? { daily } : {}),
    ...(demosDeleted ? { demosDeleted } : {}),
    ...(errors.length ? { errors } : {}),
  };
}
