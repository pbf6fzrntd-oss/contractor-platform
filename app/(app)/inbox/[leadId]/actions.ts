"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { isLanguage } from "@/lib/business-types";
import { parseDollars } from "@/lib/format";
import { LEAD_STAGES, type LeadStage } from "@/lib/leads/stages";
import { BLOCK_REASON_TEXT } from "@/lib/messaging/gate";
import { loadSendingContext, sendToContact } from "@/lib/messaging/send";
import { onLeadStageChanged } from "@/lib/services/automations";
import { loadLeadForUser } from "@/lib/services/leads";
import { cancelPending } from "@/lib/services/outbox";
import { recordJobCompleted } from "@/lib/services/jobs";
import { REVIEW_REASON_TEXT } from "@/lib/automation/reviews";
import { createAdminClient } from "@/lib/supabase/admin";

function refresh(leadId: string) {
  revalidatePath(`/inbox/${leadId}`);
  revalidatePath("/inbox");
}

export async function sendReply(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Type a message first." };
  if (body.length > 1000) return { error: "That's too long for a text. Keep it under 1,000 characters." };

  const db = createAdminClient();
  const sending = await loadSendingContext(db, ctx.org.id);
  const result = await sendToContact(db, sending, {
    contact: loaded.contact,
    body,
    category: "conversational",
    leadId,
    senderType: "user",
    userId: ctx.userId,
  });

  // First human reply: record response time and move "New" leads to "Contacted".
  const updates: { first_response_at?: string; stage?: string } = {};
  if (result.status === "sent" && !loaded.lead.first_response_at) updates.first_response_at = new Date().toISOString();
  if (result.status === "sent" && loaded.lead.stage === "new") updates.stage = "contacted";
  if (Object.keys(updates).length) await db.from("leads").update(updates).eq("id", leadId);

  refresh(leadId);
  if (result.status !== "sent") return { error: BLOCK_REASON_TEXT[result.reason] };
  return { success: "Sent." };
}

export async function setStage(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };

  const stage = String(formData.get("stage"));
  if (!(LEAD_STAGES as readonly string[]).includes(stage)) return { error: "Pick a stage." };
  const amount = parseDollars(formData.get("estimate_amount")?.toString());
  if (amount === undefined) return { error: "Enter the estimate as a dollar amount, like 4500." };

  const update: { stage: string; estimate_amount_cents?: number | null } = { stage };
  if (formData.has("estimate_amount")) update.estimate_amount_cents = amount;

  const { error } = await loaded.supabase.from("leads").update(update).eq("id", leadId);
  if (error) return { error: "Couldn't update the stage." };

  if (stage !== loaded.lead.stage || stage === "estimate_sent") {
    await onLeadStageChanged(createAdminClient(), ctx.org.id, leadId, {
      from: loaded.lead.stage as LeadStage,
      to: stage as LeadStage,
    });
  }
  refresh(leadId);
  return { success: "Updated." };
}

const contactSchema = z.object({
  name: z.string().trim().max(100),
  email: z.string().trim().max(200),
  address: z.string().trim().max(300),
  preferred_language: z.string().refine(isLanguage),
  notes: z.string().trim().max(2000),
});

export async function saveContact(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };
  const parsed = contactSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    preferred_language: formData.get("preferred_language") ?? "en",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: "Check the contact details." };
  const d = parsed.data;
  const { error } = await loaded.supabase
    .from("contacts")
    .update({
      name: d.name || null,
      email: d.email || null,
      address: d.address || null,
      preferred_language: d.preferred_language,
      notes: d.notes || null,
      do_not_autotext: formData.get("do_not_autotext") === "on",
    })
    .eq("id", loaded.contact.id);
  if (error) return { error: "Couldn't save." };
  refresh(leadId);
  return { success: "Saved." };
}

export async function confirmOptOut(leadId: string): Promise<void> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return;
  await loaded.supabase.rpc("record_consent_event", {
    p_org_id: ctx.org.id,
    p_contact_id: loaded.contact.id,
    p_kind: "opt_out",
    p_method: "owner_confirmed_reply",
    p_evidence: "Owner confirmed the customer's reply was a request to stop texts.",
  });
  await loaded.supabase.from("leads").update({ flag: "opt_out" }).eq("id", leadId);
  refresh(leadId);
}

export async function dismissFlag(leadId: string): Promise<void> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return;
  await loaded.supabase.from("leads").update({ flag: null }).eq("id", leadId);
  refresh(leadId);
}

export async function cancelFollowUps(leadId: string): Promise<void> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return;
  await cancelPending(createAdminClient(), { orgId: ctx.org.id, leadId, kind: "estimate_followup" }, "canceled");
  refresh(leadId);
}

export async function markJobComplete(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };
  const amount = parseDollars(formData.get("amount")?.toString());
  if (amount === undefined) return { error: "Enter the job amount in dollars, like 4500." };
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;

  const db = createAdminClient();
  const { review } = await recordJobCompleted(db, ctx.org.id, {
    contactId: loaded.contact.id,
    leadId,
    description,
    amountCents: amount ?? loaded.lead.estimate_amount_cents,
    userId: ctx.userId,
  });

  if (loaded.lead.stage !== "won") {
    await db.from("leads").update({ stage: "won" }).eq("id", leadId);
    await onLeadStageChanged(db, ctx.org.id, leadId, { from: loaded.lead.stage as LeadStage, to: "won" });
  }
  refresh(leadId);
  return review.schedule
    ? { success: "Job marked complete. A Google review request is scheduled." }
    : { success: `Job marked complete. ${REVIEW_REASON_TEXT[review.reason]}` };
}
