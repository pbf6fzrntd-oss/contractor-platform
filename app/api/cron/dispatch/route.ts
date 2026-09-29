import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
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
  const summary = await runDispatch(createAdminClient());
  return NextResponse.json(summary);
}

export const GET = handle;
export const POST = handle;
