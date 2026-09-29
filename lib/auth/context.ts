import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Tables } from "@/lib/database.types";
import type { Plan } from "@/lib/entitlements";
import { canVisit, homePath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppContext = {
  userId: string;
  role: "owner" | "manager";
  org: Tables<"organizations">;
  plan: Plan;
};

/** The logged-in user's id, or null. Cached for the rest of the request. */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
});

/**
 * Who is logged in and which business they're working in.
 * A login can belong to more than one business in the data model; for now
 * the app uses the first one they joined.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data: org } = await supabase.from("organizations").select("*").eq("id", membership.org_id).single();
  if (!org) return null;

  const { data: plan } = await supabase.from("plans").select("*").eq("id", org.plan_id).single();
  if (!plan) return null;

  return { userId, role: membership.role, org, plan };
});

/** Use at the top of every logged-in page. Sends people where they belong. */
export async function requireAppContext(path?: string): Promise<AppContext> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const ctx = await getAppContext();
  if (!ctx) redirect("/onboarding");
  if (path && !canVisit(path, ctx.org.business_type, ctx.plan)) {
    redirect(homePath(ctx.org.business_type, ctx.plan));
  }
  return ctx;
}

export async function requireOwner(): Promise<AppContext> {
  const ctx = await requireAppContext();
  if (ctx.role !== "owner") redirect("/settings");
  return ctx;
}
