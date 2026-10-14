import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { moduleDailyJobs } from "@/lib/modules/types";
import { MODULES } from "@/modules/registry";
import { runScheduler } from "@/lib/services/scheduler";
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
  const result = await runScheduler(db, new Date(), moduleDailyJobs(MODULES));
  // A failing stage must be visible to the scheduler/uptime monitor. Other
  // independent stages have still been attempted, and successful claims remain deduplicated.
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}

export const GET = handle;
export const POST = handle;
