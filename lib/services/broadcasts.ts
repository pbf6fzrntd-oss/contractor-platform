import "server-only";
import { selectCampaignRecipients, selectNoticeRecipients, type CampaignAudience, type Selection } from "@/lib/automation/recipients";
import type { DateMove } from "@/lib/automation/schedule";
import { recordJobCompleted } from "@/lib/services/jobs";
import type { AdminClient } from "@/lib/supabase/admin";

/** Everything needed to pick recipients for a business. */
export async function loadRecipientData(db: AdminClient, orgId: string) {
  const [{ data: services }, { data: moves }] = await Promise.all([
    db
      .from("recurring_services")
      .select("id, contact_id, service_type, frequency, service_day, start_date, status, paused_until")
      .eq("org_id", orgId)
      .limit(5000),
    db.from("service_date_moves").select("recurring_service_id, from_date, to_date").eq("org_id", orgId).limit(5000),
  ]);
  const contactIds = [...new Set((services ?? []).map((s) => s.contact_id))];
  const contacts: {
    id: string;
    phone: string;
    name: string | null;
    preferred_language: string;
    opted_out_at: string | null;
    marketing_consent_at: string | null;
    address: string | null;
  }[] = [];
  // Fetch in chunks so long customer lists don't hit URL limits.
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await db
      .from("contacts")
      .select("id, phone, name, preferred_language, opted_out_at, marketing_consent_at, address")
      .in("id", contactIds.slice(i, i + 200));
    contacts.push(...(data ?? []));
  }
  return { services: services ?? [], contacts, moves: (moves ?? []) as DateMove[] };
}

export async function previewNotice(db: AdminClient, orgId: string, date: string): Promise<Selection> {
  const data = await loadRecipientData(db, orgId);
  return selectNoticeRecipients(data.services, data.contacts, date, data.moves);
}

export async function previewCampaign(
  db: AdminClient,
  orgId: string,
  audience: CampaignAudience,
  today: string,
): Promise<Selection> {
  const data = await loadRecipientData(db, orgId);
  return selectCampaignRecipients(data.services, data.contacts, audience, today);
}

/**
 * Sends a service notice (rain delay, running late, custom) to everyone
 * scheduled on `date`. For rain delays, also moves their visit to `newDate`
 * so they show up on that day's Today list.
 */
export async function createServiceNotice(
  db: AdminClient,
  orgId: string,
  input: {
    name: string;
    templateKey: string | null;
    bodyEn: string;
    bodyEs: string | null;
    date: string;
    newDate: string | null;
    userId: string;
    now?: Date;
  },
): Promise<{ broadcastId: string; recipients: number; excluded: Selection["excluded"] }> {
  const now = input.now ?? new Date();
  const selection = await previewNotice(db, orgId, input.date);

  const { data: broadcast, error } = await db
    .from("broadcasts")
    .insert({
      org_id: orgId,
      kind: "service_notice",
      name: input.name,
      template_key: input.templateKey,
      body_en: input.bodyEn,
      body_es: input.bodyEs,
      category: "informational",
      service_date: input.date,
      new_date: input.newDate,
      scheduled_at: now.toISOString(),
      status: "sent",
      recipient_count: selection.recipients.length,
      excluded: selection.excluded,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.newDate) {
    const moves = selection.recipients.flatMap((r) =>
      r.serviceIds.map((serviceId) => ({
        org_id: orgId,
        recurring_service_id: serviceId,
        from_date: input.date,
        to_date: input.newDate!,
        broadcast_id: broadcast.id,
      })),
    );
    if (moves.length) await db.from("service_date_moves").upsert(moves, { onConflict: "recurring_service_id,from_date" });
  }

  if (selection.recipients.length) {
    await db.from("scheduled_messages").insert(
      selection.recipients.map((r) => ({
        org_id: orgId,
        contact_id: r.contactId,
        broadcast_id: broadcast.id,
        kind: "broadcast",
        category: "informational",
        send_at: now.toISOString(),
        context: { service_date: input.date, new_date: input.newDate },
      })),
    );
  }
  return { broadcastId: broadcast.id, recipients: selection.recipients.length, excluded: selection.excluded };
}

/**
 * "Mark day complete": records a visit for every customer scheduled that day
 * who doesn't have one yet. Visits feed review requests and churn numbers.
 */
export async function markDayComplete(
  db: AdminClient,
  orgId: string,
  date: string,
  userId: string,
): Promise<{ visits: number; reviewsScheduled: number }> {
  const data = await loadRecipientData(db, orgId);
  const scheduled = selectNoticeRecipients(
    data.services,
    // Opted-out customers still get mowed, so count everyone for visits.
    data.contacts.map((c) => ({ ...c, opted_out_at: null })),
    date,
    data.moves,
  );
  const { data: existing } = await db
    .from("jobs")
    .select("recurring_service_id")
    .eq("org_id", orgId)
    .eq("completed_on", date)
    .not("recurring_service_id", "is", null);
  const done = new Set((existing ?? []).map((j) => j.recurring_service_id));

  let visits = 0;
  let reviewsScheduled = 0;
  for (const r of scheduled.recipients) {
    for (const serviceId of r.serviceIds) {
      if (done.has(serviceId)) continue;
      const result = await recordJobCompleted(db, orgId, {
        contactId: r.contactId,
        recurringServiceId: serviceId,
        completedOn: date,
        userId,
      });
      visits++;
      if (result.review.schedule) reviewsScheduled++;
    }
  }
  return { visits, reviewsScheduled };
}

/** Schedules a seasonal campaign to everyone in the audience who gave written consent. */
export async function createCampaign(
  db: AdminClient,
  orgId: string,
  input: {
    name: string;
    templateKey: string | null;
    bodyEn: string;
    bodyEs: string | null;
    audience: CampaignAudience;
    sendAt: Date;
    today: string;
    userId: string;
  },
): Promise<{ broadcastId: string; recipients: number; excluded: Selection["excluded"] }> {
  const selection = await previewCampaign(db, orgId, input.audience, input.today);
  const { data: broadcast, error } = await db
    .from("broadcasts")
    .insert({
      org_id: orgId,
      kind: "campaign",
      name: input.name,
      template_key: input.templateKey,
      body_en: input.bodyEn,
      body_es: input.bodyEs,
      category: "marketing",
      audience: input.audience,
      scheduled_at: input.sendAt.toISOString(),
      status: "scheduled",
      recipient_count: selection.recipients.length,
      excluded: selection.excluded,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (selection.recipients.length) {
    await db.from("scheduled_messages").insert(
      selection.recipients.map((r) => ({
        org_id: orgId,
        contact_id: r.contactId,
        broadcast_id: broadcast.id,
        kind: "broadcast",
        category: "marketing",
        send_at: input.sendAt.toISOString(),
      })),
    );
  }
  return { broadcastId: broadcast.id, recipients: selection.recipients.length, excluded: selection.excluded };
}
