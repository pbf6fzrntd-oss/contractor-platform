import "server-only";
import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Platform admin = you. Emails listed in PLATFORM_ADMIN_EMAILS. Everyone else gets "not found". */
export async function requirePlatformAdmin(): Promise<{ email: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = String(data?.claims?.email ?? "").toLowerCase();
  if (!email || !serverEnv.platformAdminEmails.includes(email)) notFound();
  return { email };
}

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = String(data?.claims?.email ?? "").toLowerCase();
  return Boolean(email) && serverEnv.platformAdminEmails.includes(email);
}
