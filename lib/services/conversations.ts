import "server-only";
import type { Tables } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { getProvider } from "@/lib/messaging/provider";
import { loadSendingContext, monthKey } from "@/lib/messaging/send";
import { checkSendingGate } from "@/lib/messaging/gate";
import { formatUSPhone } from "@/lib/phone";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Shared building blocks for conversations: contacts, leads and owner alerts.
 * All functions take the admin client and an org id that the caller has
 * already verified.
 */

export type Contact = Tables<"contacts">;
export type Lead = Tables<"leads">;

export const OPEN_STAGES = ["new", "contacted", "estimate_sent"] as const;

/** Replies within this many days of a campaign text count as campaign leads. */
export const CAMPAIGN_ATTRIBUTION_DAYS = 14;

export async function findOrCreateContact(
  db: AdminClient,
  orgId: string,
  phone: string,
  defaults: { language?: string; name?: string | null } = {},
): Promise<{ contact: Contact; created: boolean }> {
  const { data: existing } = await db.from("contacts").select("*").eq("org_id", orgId).eq("phone", phone).maybeSingle();
  if (existing) return { contact: existing, created: false };

  const { data, error } = await db
    .from("contacts")
    .insert({ org_id: orgId, phone, preferred_language: defaults.language ?? "en", name: defaults.name ?? null })
    .select("*")
    .single();
  if (error) {
    // Another request created it at the same moment.
    const { data: again } = await db.from("contacts").select("*").eq("org_id", orgId).eq("phone", phone).single();
    if (again) return { contact: again, created: false };
    throw error;
  }
  return { contact: data, created: true };
}

export async function findOpenLead(db: AdminClient, orgId: string, contactId: string): Promise<Lead | null> {
  const { data } = await db
    .from("leads")
    .select("*")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .in("stage", [...OPEN_STAGES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** The campaign this contact was last sent, if it was recent enough to credit a reply to it. */
export async function findRecentCampaign(
  db: AdminClient,
  orgId: string,
  contactId: string,
  now: Date,
): Promise<string | null> {
  const since = new Date(now.getTime() - CAMPAIGN_ATTRIBUTION_DAYS * 86_400_000).toISOString();
  const { data } = await db
    .from("messages")
    .select("broadcast_id")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .eq("direction", "outbound")
    .eq("category", "marketing")
    .not("broadcast_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.broadcast_id ?? null;
}

const SOURCE_LABEL: Record<string, string> = {
  missed_call: "missed call",
  inbound_text: "new text",
  campaign: "campaign reply",
  manual: "added by hand",
};

export async function createLead(
  db: AdminClient,
  input: { orgId: string; contact: Contact; source: "missed_call" | "inbound_text" | "campaign"; broadcastId?: string | null },
): Promise<Lead> {
  const { data, error } = await db
    .from("leads")
    .insert({
      org_id: input.orgId,
      contact_id: input.contact.id,
      source: input.source,
      broadcast_id: input.broadcastId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const who = input.contact.name ? `${input.contact.name} ${formatUSPhone(input.contact.phone)}` : formatUSPhone(input.contact.phone);
  await notifyOwner(db, input.orgId, {
    kind: "new_lead",
    body: `New lead (${SOURCE_LABEL[input.source]}): ${who}`,
    link: `/inbox/${data.id}`,
  });
  return data;
}

/**
 * Records a notification and texts it to the owner's cell (when a real number
 * is connected and approved). Alerts don't go to customers, so consent rules
 * don't apply, but they do count toward the plan's text allowance.
 */
export async function notifyOwner(
  db: AdminClient,
  orgId: string,
  alert: { kind: "new_lead" | "flagged_reply" | "system"; body: string; link?: string },
): Promise<void> {
  const { data: org } = await db.from("organizations").select("alert_phone").eq("id", orgId).single();
  const { data: row } = await db
    .from("notifications")
    .insert({ org_id: orgId, kind: alert.kind, body: alert.body, link: alert.link ?? null })
    .select("id")
    .single();

  if (!org?.alert_phone || !row) return;
  const ctx = await loadSendingContext(db, orgId);
  if (ctx.phone?.provider === "simulator") return; // shown on the simulator screen instead
  if (checkSendingGate({ ...ctx, hasPhoneNumber: Boolean(ctx.phone) })) return;

  const text = alert.link ? `${alert.body}\n${publicEnv.siteUrl}${alert.link}` : alert.body;
  const result = await getProvider().sendSms({
    from: ctx.phone!.e164,
    messagingServiceSid: ctx.phone!.messaging_service_sid,
    to: org.alert_phone,
    body: text,
  });
  await db.from("notifications").update({ sms_status: result.ok ? "sent" : "failed" }).eq("id", row.id);
  if (result.ok) {
    await db.rpc("increment_sms_usage", { p_org_id: orgId, p_month: monthKey(new Date(), ctx.timezone), p_count: 1 });
  }
}

/** The business's saved template text for a key, in the contact's language (English fallback). */
export async function getTemplateBody(
  db: AdminClient,
  orgId: string,
  key: string,
  language: string,
): Promise<{ body: string; category: "conversational" | "informational" | "marketing" } | null> {
  const { data } = await db
    .from("message_templates")
    .select("body, category, language")
    .eq("org_id", orgId)
    .eq("key", key)
    .in("language", [language, "en"]);
  const row = data?.find((t) => t.language === language) ?? data?.find((t) => t.language === "en");
  if (!row) return null;
  return { body: row.body, category: row.category as "conversational" | "informational" | "marketing" };
}
