import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { expireStaleBookings } from "@/lib/services/booking-maintenance";
import { runDailyJobs } from "@/lib/services/daily";
import { deleteExpiredDemos } from "@/lib/services/demo";
import { runDispatch } from "@/lib/services/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The scheduler calls this every minute to send texts that are due.
 * It must send "Authorization: Bearer <CRON_SECRET>" (Vercel Cron does this
 * automatically; see README for the Supabase pg_cron option).
 */
export const maxDuration = 60;

async function handle(request: Request) {
  const secret = serverEnv.cronSecret;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const summary = await runDispatch(db);
  // Release booking requests nobody finished (customer's YES or the owner's OK).
  const released = await expireStaleBookings(db);
  // Once a day (the first call after 12:00 UTC): expiry alerts and reminders.
  const daily = await runDailyJobs(db);
  // "Try it live" demo businesses are deleted when their 24 hours are up.
  const demosDeleted = await deleteExpiredDemos(db);
  return NextResponse.json({ ...summary, released, ...(Object.keys(daily).length ? { daily } : {}), ...(demosDeleted ? { demosDeleted } : {}) });
}

export const GET = handle;
export const POST = handle;
