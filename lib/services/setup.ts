import "server-only";
import type { AppContext } from "@/lib/auth/context";
import { bookingOn, canUse } from "@/lib/entitlements";
import { setupProgress, setupSteps, type SetupStep } from "@/lib/setup/checklist";
import { createClient } from "@/lib/supabase/server";

/** The owner's setup checklist, from what the business has done so far. */
export async function loadSetup(ctx: AppContext): Promise<{ steps: SetupStep[]; progress: ReturnType<typeof setupProgress> }> {
  const { org } = ctx;
  const db = await createClient();
  const count = { count: "exact" as const, head: true };
  const [{ data: phone }, { count: calls }, { data: reg }, { count: recurring }, { count: credentials }, { count: members }] = await Promise.all([
    db.from("phone_numbers").select("provider").eq("org_id", org.id).limit(1).maybeSingle(),
    db.from("calls").select("id", count).eq("org_id", org.id),
    db.from("a2p_registrations").select("status").eq("org_id", org.id).maybeSingle(),
    db.from("recurring_services").select("id", count).eq("org_id", org.id),
    db.from("business_credentials").select("id", count).eq("org_id", org.id),
    db.from("memberships").select("user_id", count).eq("org_id", org.id),
  ]);
  const steps = setupSteps({
    businessType: org.business_type,
    hasPhone: Boolean(phone),
    phoneIsPretend: phone?.provider === "simulator",
    hasAlertPhone: Boolean(org.alert_phone),
    hasReviewLink: Boolean(org.google_review_url),
    callsReceived: calls ?? 0,
    registrationStatus: reg?.status ?? "not_started",
    recurringCustomers: recurring ?? 0,
    credentials: credentials ?? 0,
    teamMembers: members ?? 1,
    profileAvailable: canUse(ctx.plan, ctx.modules, "agent_ready"),
    profileOn: org.public_profile_enabled,
    bookingAvailable: canUse(ctx.plan, ctx.modules, "booking"),
    bookingOn: bookingOn(org, ctx.plan, ctx.modules),
  });
  return { steps, progress: setupProgress(steps) };
}

/** Show the "finish setting up" card? Owners only, until done or hidden; never in demo businesses. */
export function showSetupCard(ctx: AppContext): boolean {
  return ctx.role === "owner" && !ctx.org.is_demo && !ctx.org.setup_dismissed_at;
}
