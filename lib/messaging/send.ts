import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Language } from "@/lib/business-types";
import { addComplianceFooter, checkSendPolicy, MARKETING_WINDOW, type SendPurpose } from "@/lib/automation/compliance";
import type { Tables } from "@/lib/database.types";
import { serverEnv } from "@/lib/env";
import { checkSendingGate, type BlockReason } from "@/lib/messaging/gate";
import { getProvider } from "@/lib/messaging/provider";
import type { AdminClient } from "@/lib/supabase/admin";
import type { MessageCategory } from "@/lib/templates/defaults";
import { isWithinWindow } from "@/lib/time";

/**
 * THE way to send a text to a contact. Every feature uses this, so the rules
 * (opt-outs, consent, sending hours, plan limits, carrier approval, opt-out
 * footer) are enforced in exactly one place. Blocked texts are still logged
 * so the owner can see why they didn't go out.
 */

export type Contact = Tables<"contacts">;

export type SendResult =
  | { status: "sent"; messageId: string }
  | { status: "blocked" | "failed"; reason: BlockReason; messageId: string | null };

export type SendingContext = {
  orgId: string;
  timezone: string;
  phone: Tables<"phone_numbers"> | null;
  textingApproved: boolean;
  subscriptionStatus: string | null;
  monthlyLimit: number;
  sentThisMonth: number;
};

export function monthKey(now: Date, timezone: string): string {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).format(now);
  return `${local}-01`;
}

/** Everything about the business needed to decide whether it can text right now. */
export async function loadSendingContext(db: AdminClient, orgId: string, now = new Date()): Promise<SendingContext> {
  const [{ data: org }, { data: phone }, { data: sub }, { data: registration }] = await Promise.all([
    db.from("organizations").select("id, timezone, plan_id").eq("id", orgId).single(),
    db.from("phone_numbers").select("*").eq("org_id", orgId).order("created_at").limit(1).maybeSingle(),
    db.from("subscriptions").select("status").eq("org_id", orgId).maybeSingle(),
    db.from("a2p_registrations").select("status").eq("org_id", orgId).maybeSingle(),
  ]);
  if (!org) throw new Error(`Organization ${orgId} not found`);
  const [{ data: plan }, { data: usage }] = await Promise.all([
    db.from("plans").select("monthly_sms_limit").eq("id", org.plan_id).single(),
    db.from("usage_counters").select("sms_sent").eq("org_id", orgId).eq("month", monthKey(now, org.timezone)).maybeSingle(),
  ]);

  const textingApproved =
    phone?.provider === "simulator" || serverEnv.allowUnregisteredTexting || registration?.status === "approved";

  return {
    orgId,
    timezone: org.timezone,
    phone: phone ?? null,
    textingApproved,
    subscriptionStatus: sub?.status ?? null,
    monthlyLimit: plan?.monthly_sms_limit ?? 0,
    sentThisMonth: usage?.sms_sent ?? 0,
  };
}

export type SendInput = {
  contact: Contact;
  body: string;
  category: MessageCategory;
  leadId?: string | null;
  broadcastId?: string | null;
  senderType: "user" | "automation" | "assistant";
  userId?: string | null;
  purpose?: SendPurpose;
  now?: Date;
  /** Stable outbox/request key. Ambiguous provider attempts are never resent. */
  requestKey?: string;
};

export async function sendToContact(db: AdminClient, ctx: SendingContext, input: SendInput): Promise<SendResult> {
  const now = input.now ?? new Date();
  const { contact } = input;
  const language = (contact.preferred_language === "es" ? "es" : "en") as Language;

  const base = {
    org_id: ctx.orgId,
    contact_id: contact.id,
    lead_id: input.leadId ?? null,
    broadcast_id: input.broadcastId ?? null,
    direction: "outbound",
    category: input.category,
    sender_type: input.senderType,
    sent_by: input.userId ?? null,
  };

  async function logBlocked(reason: BlockReason, status: "blocked" | "failed" = "blocked", error?: string) {
    const { data } = await db
      .from("messages")
      .insert({ ...base, body: input.body, status, error: error ?? reason })
      .select("id")
      .single();
    return { status, reason, messageId: data?.id ?? null } as const;
  }

  const requestKey = input.requestKey ?? randomUUID();
  const fingerprint = createHash("sha256").update(JSON.stringify([ctx.orgId, contact.id, input.body, input.category, input.leadId ?? null, input.broadcastId ?? null])).digest("hex");
  const { data: previous, error: lookupError } = await db.from("sms_attempts").select("fingerprint, message_id, state").eq("org_id", ctx.orgId).eq("request_key", requestKey).maybeSingle();
  if (lookupError) return { status: "failed", reason: "provider_error", messageId: null };
  if (previous) {
    if (previous.fingerprint !== fingerprint) return { status: "failed", reason: "provider_error", messageId: previous.message_id };
    return previous.state === "accepted" ? { status: "sent", messageId: previous.message_id } :
      { status: "failed", reason: previous.state === "rejected" ? "provider_error" : "delivery_unknown", messageId: previous.message_id };
  }

  const gate = checkSendingGate({
    hasPhoneNumber: Boolean(ctx.phone),
    textingApproved: ctx.textingApproved,
    subscriptionStatus: ctx.subscriptionStatus,
    monthlyLimit: ctx.monthlyLimit,
    sentThisMonth: ctx.sentThisMonth,
  });
  if (gate) return logBlocked(gate);

  const policy = checkSendPolicy(input.category, contact, input.purpose);
  if (!policy.allowed) return logBlocked(policy.reason);

  if (input.category === "marketing" && !isWithinWindow(now, ctx.timezone, MARKETING_WINDOW)) {
    return logBlocked("outside_marketing_hours");
  }

  const { count: previousOutbound, error: historyError } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("contact_id", contact.id)
    .eq("direction", "outbound")
    .neq("status", "blocked");

  if (historyError) return { status: "failed", reason: "provider_error", messageId: null };

  const body = addComplianceFooter(input.body, {
    isFirstMessage: (previousOutbound ?? 0) === 0,
    category: input.category,
    language,
  });

  const { data: reserved, error: reserveError } = await db.rpc("reserve_sms_attempt", {
    p_message: { ...base, body }, p_month: monthKey(now, ctx.timezone),
    p_limit: ctx.monthlyLimit, p_key: requestKey, p_fingerprint: fingerprint,
  });
  if (reserveError || !reserved) return { status: "failed", reason: "provider_error", messageId: null };
  const attempt = reserved as { fresh?: boolean; limited?: boolean; message_id?: string; state?: string; usage?: number };
  if (attempt.limited) return logBlocked("monthly_limit_reached");
  if (!attempt.message_id) return { status: "failed", reason: "provider_error", messageId: null };
  const messageId = attempt.message_id;
  if (!attempt.fresh) return attempt.state === "accepted" ? { status: "sent", messageId } : { status: "failed", reason: "delivery_unknown", messageId };
  ctx.sentThisMonth = attempt.usage ?? ctx.sentThisMonth + 1;

  async function finish(state: "accepted" | "rejected" | "unknown", status: string, sid?: string, error?: string) {
    const r = await db.rpc("finish_sms_attempt", { p_org_id: ctx.orgId, p_key: requestKey, p_state: state,
      p_status: status, p_sid: sid, p_error: error });
    return !r.error && r.data === true;
  }
  const phone = ctx.phone!;
  let result;
  try {
    result = await getProvider(phone).sendSms({ from: phone.e164, messagingServiceSid: phone.messaging_service_sid, to: contact.phone, body });
  } catch {
    await finish("unknown", "queued", undefined, "delivery_unknown: provider response missing; reconcile before retry");
    return { status: "failed", reason: "delivery_unknown", messageId };
  }
  if (!result.ok) {
    if (result.unknown) {
      await finish("unknown", "queued", undefined, "delivery_unknown: " + result.error);
      return { status: "failed", reason: "delivery_unknown", messageId };
    }
    const finished = await finish("rejected", "failed", undefined, result.error);
    if (!finished) return { status: "failed", reason: "delivery_unknown", messageId };
    ctx.sentThisMonth = Math.max(0, ctx.sentThisMonth - 1);
    if (result.code === 21610) {
      await db.rpc("record_consent_event", { p_org_id: ctx.orgId, p_contact_id: contact.id,
        p_kind: "opt_out", p_method: "sms_keyword", p_evidence: "Phone company reported STOP (Twilio error 21610)." });
      return { status: "blocked", reason: "opted_out", messageId };
    }
    return { status: "failed", reason: "provider_error", messageId };
  }
  if (!await finish("accepted", result.status, result.sid)) return { status: "failed", reason: "delivery_unknown", messageId };
  if (input.leadId) await db.from("leads").update({ last_message_at: now.toISOString() }).eq("id", input.leadId);
  return { status: "sent", messageId };
}
