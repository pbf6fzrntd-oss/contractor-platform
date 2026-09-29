import "server-only";
import type { AppContext } from "@/lib/auth/context";
import type { LeadStage } from "@/lib/leads/stages";
import { createClient } from "@/lib/supabase/server";

/**
 * Loads a lead the logged-in user is allowed to see (row-level security does
 * the checking). Use this at the start of every lead action.
 */
export async function loadLeadForUser(ctx: AppContext, leadId: string) {
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("org_id", ctx.org.id).maybeSingle();
  if (!lead) return null;
  const { data: contact } = await supabase.from("contacts").select("*").eq("id", lead.contact_id).single();
  if (!contact) return null;
  return { lead, contact, supabase };
}

export function isOpenStage(stage: string): boolean {
  return stage === "new" || stage === "contacted" || stage === "estimate_sent";
}

export type StageChange = { leadId: string; from: LeadStage; to: LeadStage };
