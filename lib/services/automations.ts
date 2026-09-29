import "server-only";
import type { LeadStage } from "@/lib/leads/stages";
import { cancelPending, scheduleFollowUps } from "@/lib/services/outbox";
import type { AdminClient } from "@/lib/supabase/admin";

/** Runs the automations tied to a lead's stage changing. */
export async function onLeadStageChanged(
  db: AdminClient,
  orgId: string,
  leadId: string,
  change: { from: LeadStage; to: LeadStage },
): Promise<void> {
  if (change.to === "estimate_sent") {
    await scheduleFollowUps(db, orgId, leadId);
  } else if (change.from === "estimate_sent") {
    // Not required (texts re-check at send time) but keeps the schedule tidy.
    await cancelPending(db, { orgId, leadId, kind: "estimate_followup" }, "stage_changed");
  }
}
