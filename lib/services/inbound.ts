import "server-only";
import { toOrg } from "@/lib/org";
import { handleBookingReply } from "@/lib/services/booking-replies";
import { classifyInbound } from "@/lib/automation/keywords";
import { shouldTextBackMissedCall } from "@/lib/automation/missed-call";
import type { Tables } from "@/lib/database.types";
import { mapTwilioStatus } from "@/lib/messaging/provider";
import { loadSendingContext, sendToContact } from "@/lib/messaging/send";
import { formatUSPhone } from "@/lib/phone";
import {
  createLead,
  findOpenLead,
  findOrCreateContact,
  findRecentCampaign,
  getTemplateBody,
  notifyOwner,
  type Contact,
} from "@/lib/services/conversations";
import { parseSettings } from "@/lib/settings";
import type { AdminClient } from "@/lib/supabase/admin";
import { renderTemplate } from "@/lib/templates/render";

/**
 * What happens when someone calls or texts a business number. Used by the
 * Twilio webhooks AND the simulator, so both behave identically.
 */

export type BusinessLine = {
  phone: Tables<"phone_numbers">;
  org: Tables<"organizations">;
};

/** Finds which business owns the number that was called/texted. */
export async function findBusinessLine(db: AdminClient, e164: string): Promise<BusinessLine | null> {
  const { data: phone } = await db.from("phone_numbers").select("*").eq("e164", e164).maybeSingle();
  if (!phone) return null;
  const { data: org } = await db.from("organizations").select("*").eq("id", phone.org_id).single();
  return org ? { phone, org } : null;
}

function templateValues(line: BusinessLine, contact: Contact) {
  return {
    business_name: line.org.name,
    business_phone: formatUSPhone(line.phone.e164),
    first_name: contact.name?.split(" ")[0] ?? null,
    review_link: line.org.google_review_url,
  };
}

/** Log a call when it starts ringing (Option B: calls ring the owner first). */
export async function recordIncomingCall(db: AdminClient, line: BusinessLine, from: string, callSid: string) {
  const { contact } = await findOrCreateContact(db, line.org.id, from, { language: line.org.default_language });
  await db
    .from("calls")
    .upsert({ org_id: line.org.id, contact_id: contact.id, provider_sid: callSid, status: "ringing" }, {
      onConflict: "provider_sid",
      ignoreDuplicates: true,
    });
}

export async function markCallAccepted(db: AdminClient, callSid: string) {
  await db.from("calls").update({ accepted: true }).eq("provider_sid", callSid);
}

export async function isCallAccepted(db: AdminClient, callSid: string): Promise<boolean> {
  const { data } = await db.from("calls").select("accepted").eq("provider_sid", callSid).maybeSingle();
  return Boolean(data?.accepted);
}

export async function markCallAnswered(db: AdminClient, callSid: string) {
  await db.from("calls").update({ status: "answered" }).eq("provider_sid", callSid);
}

/**
 * Nobody picked up: log it, make sure there's a lead, and text the caller
 * (unless a guardrail says not to).
 */
export async function handleMissedCall(
  db: AdminClient,
  line: BusinessLine,
  input: { from: string; callSid: string; now?: Date },
): Promise<{ texted: boolean; reason?: string; leadId: string }> {
  const now = input.now ?? new Date();
  const orgId = line.org.id;
  const { contact } = await findOrCreateContact(db, orgId, input.from, { language: line.org.default_language });

  // Look at recent texts BEFORE anything new is logged.
  const { data: lastMessage } = await db
    .from("messages")
    .select("created_at")
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .neq("status", "blocked")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lead = (await findOpenLead(db, orgId, contact.id)) ?? (await createLead(db, { orgId, contact, source: "missed_call" }));
  await db.from("leads").update({ last_message_at: now.toISOString(), unread: true }).eq("id", lead.id);

  const { data: call } = await db
    .from("calls")
    .upsert(
      { org_id: orgId, contact_id: contact.id, lead_id: lead.id, provider_sid: input.callSid, status: "missed" },
      { onConflict: "provider_sid" },
    )
    .select("id, text_back_sent")
    .single();
  if (call?.text_back_sent) return { texted: false, reason: "already_sent", leadId: lead.id };

  const settings = parseSettings(line.org.settings);
  const decision = shouldTextBackMissedCall({
    enabled: settings.missedCallTextEnabled,
    contact,
    lastMessageAt: lastMessage ? new Date(lastMessage.created_at) : null,
    now,
  });
  if (!decision.send) return { texted: false, reason: decision.reason, leadId: lead.id };

  const template = await getTemplateBody(db, orgId, "missed_call_reply", contact.preferred_language);
  if (!template) return { texted: false, reason: "no_template", leadId: lead.id };

  const ctx = await loadSendingContext(db, orgId, now);
  const result = await sendToContact(db, ctx, {
    contact,
    body: renderTemplate(template.body, templateValues(line, contact)),
    category: "conversational",
    leadId: lead.id,
    senderType: "automation",
    now,
  });
  if (result.status === "sent" && call) {
    await db.from("calls").update({ text_back_sent: true }).eq("id", call.id);
  }
  return { texted: result.status === "sent", reason: result.status === "sent" ? undefined : result.reason, leadId: lead.id };
}

/**
 * A text came in: log it, handle STOP/START/HELP, attach it to a lead (or
 * start a new one) and alert the owner when needed.
 */
export async function handleInboundSms(
  db: AdminClient,
  line: BusinessLine,
  input: { from: string; body: string; messageSid: string; now?: Date },
): Promise<{ leadId: string | null; kind: string }> {
  const now = input.now ?? new Date();
  const orgId = line.org.id;

  const { data: duplicate } = await db.from("messages").select("id").eq("provider_sid", input.messageSid).maybeSingle();
  if (duplicate) return { leadId: null, kind: "duplicate" };

  let classification = classifyInbound(input.body);
  const { contact } = await findOrCreateContact(db, orgId, input.from, {
    // Someone whose first text is a Spanish keyword gets Spanish texts.
    language: classification.language ?? line.org.default_language,
  });
  // "YES" / "SÍ" from someone who never opted out is just a normal reply (e.g. to a campaign).
  if (classification.kind === "opt_in" && !contact.opted_out_at) {
    classification = { kind: "message", carrierReplies: false };
  }

  // Which lead does this belong to?
  let lead = await findOpenLead(db, orgId, contact.id);
  const needsOwner =
    classification.flag === "cancel_keyword" || classification.flag === "possible_opt_out";
  if (!lead && (classification.kind === "message" || needsOwner)) {
    const broadcastId = await findRecentCampaign(db, orgId, contact.id, now);
    lead = await createLead(db, {
      orgId,
      contact,
      source: broadcastId ? "campaign" : "inbound_text",
      broadcastId,
    });
  }

  await db.from("messages").insert({
    org_id: orgId,
    contact_id: contact.id,
    lead_id: lead?.id ?? null,
    direction: "inbound",
    body: input.body,
    sender_type: "contact",
    provider_sid: input.messageSid,
    status: "received",
    flag: classification.flag ?? null,
  });

  if (lead) {
    const leadFlag =
      classification.flag === "cancel_keyword" || classification.flag === "possible_opt_out" || classification.flag === "opt_out"
        ? classification.flag
        : lead.flag;
    await db
      .from("leads")
      .update({ last_message_at: now.toISOString(), unread: true, flag: leadFlag })
      .eq("id", lead.id);
  }

  const values = templateValues(line, contact);
  // Replies to Spanish keywords are in Spanish.
  const reply = async (key: string, purpose: "opt_out_confirmation" | "help_reply" | "normal") => {
    const template = await getTemplateBody(db, orgId, key, classification.language ?? contact.preferred_language);
    if (!template) return;
    const ctx = await loadSendingContext(db, orgId, now);
    await sendToContact(db, ctx, {
      contact: { ...contact, opted_out_at: purpose === "normal" ? null : contact.opted_out_at },
      body: renderTemplate(template.body, values),
      category: "conversational",
      leadId: lead?.id ?? null,
      senderType: "automation",
      purpose,
      now,
    });
  };
  // With a real Twilio number, Twilio already answers standard English keywords itself.
  const weReply = line.phone.provider === "simulator" || !classification.carrierReplies;

  if (classification.kind === "opt_out") {
    await db.rpc("record_consent_event", {
      p_org_id: orgId,
      p_contact_id: contact.id,
      p_kind: "opt_out",
      p_method: "sms_keyword",
      p_evidence: `Texted "${input.body.slice(0, 200)}"`,
    });
    if (weReply) await reply("opt_out_confirmation", "opt_out_confirmation");
    if (classification.flag === "cancel_keyword") {
      await notifyOwner(db, orgId, {
        kind: "flagged_reply",
        body: `${contact.name ?? formatUSPhone(contact.phone)} texted "${input.body.trim()}". They're unsubscribed from texts. Call them if they meant to cancel service.`,
        link: lead ? `/inbox/${lead.id}` : undefined,
      });
    }
  } else if (classification.kind === "opt_in") {
    await db.rpc("record_consent_event", {
      p_org_id: orgId,
      p_contact_id: contact.id,
      p_kind: "opt_in",
      p_method: "sms_keyword",
      p_evidence: `Texted "${input.body.slice(0, 200)}"`,
    });
    if (weReply) await reply("opt_in_confirmation", "normal");
  } else if (classification.kind === "help") {
    if (weReply) await reply("help_reply", "help_reply");
  } else if (classification.kind === "message" && !contact.opted_out_at) {
    // YES / C / R about a booking (only when there's a booking waiting for that answer).
    await handleBookingReply(db, toOrg(line.org), contact, input.body, now);
  }

  return { leadId: lead?.id ?? null, kind: classification.kind };
}

/** Twilio tells us whether a text was delivered. */
export async function handleStatusCallback(
  db: AdminClient,
  input: { messageSid: string; status: string; errorCode?: string | null },
) {
  await db
    .from("messages")
    .update({
      status: mapTwilioStatus(input.status),
      ...(input.errorCode ? { error: `Carrier error ${input.errorCode}` } : {}),
    })
    .eq("provider_sid", input.messageSid);
}
