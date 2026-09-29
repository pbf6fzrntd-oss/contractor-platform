import "server-only";
import { planFollowUps } from "@/lib/automation/followups";
import { evaluateScheduledMessage, type OutboxItem } from "@/lib/automation/outbox";
import type { Tables } from "@/lib/database.types";
import { loadSendingContext, sendToContact, type SendingContext } from "@/lib/messaging/send";
import { formatUSPhone } from "@/lib/phone";
import { getTemplateBody } from "@/lib/services/conversations";
import { parseSettings, type OrgSettings } from "@/lib/settings";
import type { AdminClient } from "@/lib/supabase/admin";
import { renderTemplate, type TemplateValues } from "@/lib/templates/render";
import { DAY_NAMES, weekdayOf } from "@/lib/time";

/**
 * The outbox: schedule texts for later, and send them when they're due.
 * `runDispatch` is called every minute by the scheduler (/api/cron/dispatch).
 */

type ScheduledRow = Tables<"scheduled_messages">;

export async function cancelPending(
  db: AdminClient,
  where: { orgId: string; leadId?: string; contactId?: string; broadcastId?: string; kind?: ScheduledRow["kind"] },
  reason = "canceled",
) {
  let q = db
    .from("scheduled_messages")
    .update({ status: "canceled", skip_reason: reason, processed_at: new Date().toISOString() })
    .eq("org_id", where.orgId)
    .eq("status", "pending");
  if (where.leadId) q = q.eq("lead_id", where.leadId);
  if (where.contactId) q = q.eq("contact_id", where.contactId);
  if (where.broadcastId) q = q.eq("broadcast_id", where.broadcastId);
  if (where.kind) q = q.eq("kind", where.kind);
  await q;
}

/** Called when a lead is marked "estimate sent": (re)schedules its follow-ups. */
export async function scheduleFollowUps(db: AdminClient, orgId: string, leadId: string) {
  await cancelPending(db, { orgId, leadId, kind: "estimate_followup" }, "estimate_resent");
  const { data: lead } = await db.from("leads").select("contact_id, estimate_sent_at").eq("id", leadId).single();
  const { data: org } = await db.from("organizations").select("timezone, settings").eq("id", orgId).single();
  if (!lead?.estimate_sent_at || !org) return;

  const plan = planFollowUps(new Date(lead.estimate_sent_at), parseSettings(org.settings), org.timezone);
  if (plan.length === 0) return;
  await db.from("scheduled_messages").insert(
    plan.map((p) => ({
      org_id: orgId,
      contact_id: lead.contact_id,
      lead_id: leadId,
      kind: "estimate_followup",
      template_key: p.templateKey,
      category: "informational",
      send_at: p.sendAt.toISOString(),
      context: { estimate_sent_at: lead.estimate_sent_at, step: p.step },
    })),
  );
}

type OrgBundle = {
  org: Tables<"organizations">;
  settings: OrgSettings;
  sending: SendingContext;
};

export type DispatchSummary = { sent: number; skipped: number; deferred: number; failed: number };

export type DispatchOptions = {
  now?: Date;
  limit?: number;
  /**
   * Simulator only: send this business's scheduled texts right away, as if
   * their scheduled time had arrived (so you can test follow-ups without
   * waiting days). Every other rule still applies.
   */
  fastForwardOrgId?: string;
  /** With fastForwardOrgId: only texts whose time has already come. */
  dueOnly?: boolean;
  /** Send this bulk send's due texts right now (used right after the owner taps Send). */
  broadcastId?: string;
};

export async function runDispatch(db: AdminClient, options: DispatchOptions = {}): Promise<DispatchSummary> {
  const now = options.now ?? new Date();
  const summary: DispatchSummary = { sent: 0, skipped: 0, deferred: 0, failed: 0 };
  const orgs = new Map<string, OrgBundle>();

  async function bundle(orgId: string): Promise<OrgBundle> {
    let b = orgs.get(orgId);
    if (!b) {
      const { data: org } = await db.from("organizations").select("*").eq("id", orgId).single();
      b = { org: org!, settings: parseSettings(org!.settings), sending: await loadSendingContext(db, orgId, now) };
      orgs.set(orgId, b);
    }
    return b;
  }

  let items: ScheduledRow[];
  if (options.broadcastId) {
    // Claim this send's due texts; anything another run already took is skipped.
    const { data } = await db
      .from("scheduled_messages")
      .update({ status: "processing", processed_at: now.toISOString() })
      .eq("broadcast_id", options.broadcastId)
      .eq("status", "pending")
      .lte("send_at", now.toISOString())
      .select("*");
    items = data ?? [];
  } else if (options.fastForwardOrgId) {
    let q = db
      .from("scheduled_messages")
      .select("*")
      .eq("org_id", options.fastForwardOrgId)
      .eq("status", "pending");
    if (options.dueOnly) q = q.lte("send_at", now.toISOString());
    const { data } = await q.order("send_at").limit(options.limit ?? 200);
    items = data ?? [];
    if (items.length) {
      await db
        .from("scheduled_messages")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .in(
          "id",
          items.map((i) => i.id),
        )
        .eq("status", "pending");
    }
  } else {
    const { data, error } = await db.rpc("claim_due_scheduled_messages", {
      p_now: now.toISOString(),
      p_limit: options.limit ?? 100,
    });
    if (error) throw error;
    items = (data ?? []) as ScheduledRow[];
  }

  for (const item of items) {
    try {
      let itemNow = now;
      if (options.fastForwardOrgId) {
        const due = new Date(item.send_at);
        if (due > itemNow) itemNow = due;
      }
      const outcome = await processItem(
        db,
        item,
        itemNow,
        await bundle(item.org_id),
        Boolean(options.fastForwardOrgId && !options.dueOnly),
      );
      summary[outcome] += 1;
    } catch (error) {
      console.error("Outbox item failed", item.id, error);
      await db.from("scheduled_messages").update({ status: "failed", skip_reason: "error" }).eq("id", item.id);
      summary.failed += 1;
    }
  }
  return summary;
}

async function processItem(
  db: AdminClient,
  item: ScheduledRow,
  now: Date,
  b: OrgBundle,
  fastForward: boolean,
): Promise<keyof DispatchSummary> {
  const [{ data: contact }, { data: lead }, { data: lastInbound }, broadcast] = await Promise.all([
    db.from("contacts").select("*").eq("id", item.contact_id).maybeSingle(),
    item.lead_id
      ? db.from("leads").select("stage, estimate_sent_at").eq("id", item.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("messages")
      .select("created_at")
      .eq("contact_id", item.contact_id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadBroadcast(db, item.broadcast_id),
  ]);

  const outboxItem: OutboxItem = {
    kind: item.kind as OutboxItem["kind"],
    category: item.category as OutboxItem["category"],
    context: (item.context ?? {}) as OutboxItem["context"],
  };
  let decision = evaluateScheduledMessage(outboxItem, {
    now,
    timezone: b.org.timezone,
    settings: b.settings,
    contact: contact ?? null,
    lead: lead ?? null,
    lastInboundAt: lastInbound?.created_at ?? null,
    hasReviewLink: Boolean(b.org.google_review_url),
    broadcastStatus: broadcast?.status ?? null,
  });

  // In fast-forward, jump straight to when the window opens instead of waiting.
  if (fastForward && decision.action === "defer") {
    now = decision.until;
    decision = { action: "send" };
  }

  if (decision.action === "defer") {
    await db
      .from("scheduled_messages")
      .update({ status: "pending", send_at: decision.until.toISOString() })
      .eq("id", item.id);
    return "deferred";
  }
  if (decision.action === "skip") {
    await db
      .from("scheduled_messages")
      .update({ status: "skipped", skip_reason: decision.reason, processed_at: new Date().toISOString() })
      .eq("id", item.id);
    return "skipped";
  }

  const language = contact!.preferred_language === "es" ? "es" : "en";
  const values: TemplateValues = {
    business_name: b.org.name,
    business_phone: b.sending.phone ? formatUSPhone(b.sending.phone.e164) : null,
    first_name: contact!.name?.split(" ")[0] ?? null,
    review_link: b.org.google_review_url,
  };

  let body: string | null = null;
  if (item.kind === "broadcast" && broadcast) {
    const context = (item.context ?? {}) as { service_date?: string; new_date?: string };
    if (context.service_date) values.service_day = DAY_NAMES[language][weekdayOf(context.service_date)];
    if (context.new_date) values.new_day = DAY_NAMES[language][weekdayOf(context.new_date)];
    body = language === "es" && broadcast.body_es ? broadcast.body_es : broadcast.body_en;
  } else if (item.template_key) {
    body = (await getTemplateBody(db, b.org.id, item.template_key, language))?.body ?? null;
  }
  if (!body) {
    await db.from("scheduled_messages").update({ status: "skipped", skip_reason: "no_template" }).eq("id", item.id);
    return "skipped";
  }

  const result = await sendToContact(db, b.sending, {
    contact: contact!,
    body: renderTemplate(body, values),
    category: outboxItem.category,
    leadId: item.lead_id,
    broadcastId: item.broadcast_id,
    senderType: "automation",
    now,
  });

  if (result.status === "sent") {
    await db
      .from("scheduled_messages")
      .update({ status: "sent", message_id: result.messageId, processed_at: new Date().toISOString() })
      .eq("id", item.id);
    if (item.kind === "review_request") {
      await db.from("contacts").update({ review_requested_at: now.toISOString() }).eq("id", contact!.id);
    }
    return "sent";
  }
  const failed = result.reason === "provider_error";
  await db
    .from("scheduled_messages")
    .update({
      status: failed ? "failed" : "skipped",
      skip_reason: result.reason,
      message_id: result.messageId,
      processed_at: new Date().toISOString(),
    })
    .eq("id", item.id);
  return failed ? "failed" : "skipped";
}

/** Bulk sends keep their text on the broadcast. */
async function loadBroadcast(
  db: AdminClient,
  broadcastId: string | null,
): Promise<{ status: string; body_en: string; body_es: string | null } | null> {
  if (!broadcastId) return null;
  const { data } = await db.from("broadcasts").select("status, body_en, body_es").eq("id", broadcastId).maybeSingle();
  return data ?? null;
}
