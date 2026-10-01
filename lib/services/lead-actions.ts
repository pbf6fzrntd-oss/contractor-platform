import "server-only";
import type { ReviewPlan } from "@/lib/automation/reviews";
import type { Language } from "@/lib/business-types";
import type { LeadStage } from "@/lib/leads/stages";
import { loadSendingContext, sendToContact, type SendResult } from "@/lib/messaging/send";
import { onLeadStageChanged } from "@/lib/services/automations";
import { recordJobCompleted } from "@/lib/services/jobs";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Lead actions shared by the app's screens and the AI assistant (MCP), so
 * both follow exactly the same rules. Callers must already have confirmed
 * the person/key is allowed to act for `orgId`.
 */

export type Sender = { type: "user" | "assistant"; userId: string | null };

export async function loadLead(db: AdminClient, orgId: string, leadId: string) {
  const { data: lead } = await db.from("leads").select("*").eq("id", leadId).eq("org_id", orgId).maybeSingle();
  if (!lead) return null;
  const { data: contact } = await db.from("contacts").select("*").eq("id", lead.contact_id).eq("org_id", orgId).single();
  return contact ? { lead, contact } : null;
}

/** Sends a reply in a lead's conversation. The first reply records response time and moves New to Contacted. */
export async function replyToLead(
  db: AdminClient,
  orgId: string,
  leadId: string,
  body: string,
  sender: Sender,
  requestKey?: string,
): Promise<SendResult | { status: "not_found" }> {
  const loaded = await loadLead(db, orgId, leadId);
  if (!loaded) return { status: "not_found" };
  const sending = await loadSendingContext(db, orgId);
  const result = await sendToContact(db, sending, {
    contact: loaded.contact,
    body,
    category: "conversational",
    leadId,
    senderType: sender.type,
    userId: sender.userId,
    requestKey,
  });

  const updates: { first_response_at?: string; stage?: string } = {};
  if (result.status === "sent" && !loaded.lead.first_response_at) updates.first_response_at = new Date().toISOString();
  if (result.status === "sent" && loaded.lead.stage === "new") updates.stage = "contacted";
  if (Object.keys(updates).length) await db.from("leads").update(updates).eq("id", leadId);
  return result;
}

/**
 * Changes a lead's stage (and optionally the estimate amount). Marking
 * "estimate sent" (again) schedules follow-ups; leaving it cancels them.
 */
export async function changeLeadStage(
  db: AdminClient,
  orgId: string,
  leadId: string,
  stage: LeadStage,
  estimateAmountCents?: number | null,
): Promise<boolean> {
  const loaded = await loadLead(db, orgId, leadId);
  if (!loaded) return false;
  const update: { stage: string; estimate_amount_cents?: number | null } = { stage };
  if (estimateAmountCents !== undefined) update.estimate_amount_cents = estimateAmountCents;
  const { error } = await db.from("leads").update(update).eq("id", leadId);
  if (error) return false;
  if (stage !== loaded.lead.stage || stage === "estimate_sent") {
    await onLeadStageChanged(db, orgId, leadId, { from: loaded.lead.stage as LeadStage, to: stage });
  }
  return true;
}

/** Records a finished job for a lead, marks it won, and schedules the review request if due. */
export async function completeJobForLead(
  db: AdminClient,
  orgId: string,
  leadId: string,
  input: { amountCents: number | null; description: string | null; userId: string | null },
): Promise<ReviewPlan | null> {
  const loaded = await loadLead(db, orgId, leadId);
  if (!loaded) return null;
  const { review } = await recordJobCompleted(db, orgId, {
    contactId: loaded.contact.id,
    leadId,
    description: input.description,
    amountCents: input.amountCents ?? loaded.lead.estimate_amount_cents,
    userId: input.userId,
  });
  if (loaded.lead.stage !== "won") {
    await db.from("leads").update({ stage: "won" }).eq("id", leadId);
    await onLeadStageChanged(db, orgId, leadId, { from: loaded.lead.stage as LeadStage, to: "won" });
  }
  return review;
}

/** Adds a lead by hand (referral, walk-up), reusing the contact if the phone is known. */
export async function addManualLead(
  db: AdminClient,
  orgId: string,
  input: { phone: string; name: string | null; language: Language; notes: string | null },
): Promise<string> {
  let { data: contact } = await db.from("contacts").select("id").eq("org_id", orgId).eq("phone", input.phone).maybeSingle();
  if (!contact) {
    const inserted = await db
      .from("contacts")
      .insert({ org_id: orgId, phone: input.phone, name: input.name, preferred_language: input.language })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    contact = inserted.data;
  }
  const { data: lead, error } = await db
    .from("leads")
    .insert({ org_id: orgId, contact_id: contact.id, source: "manual", notes: input.notes })
    .select("id")
    .single();
  if (error) throw error;
  return lead.id;
}

