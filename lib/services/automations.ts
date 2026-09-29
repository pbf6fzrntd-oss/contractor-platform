import "server-only";
import type { LeadStage } from "@/lib/leads/stages";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Runs the automations tied to a lead's stage changing.
 * (Estimate follow-ups are added in Milestone 3.)
 */
export async function onLeadStageChanged(
  _db: AdminClient,
  _orgId: string,
  _leadId: string,
  _change: { from: LeadStage; to: LeadStage },
): Promise<void> {}
