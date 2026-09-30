import "server-only";
import { manageUrl } from "@/lib/booking/manage-link";
import { reminderConfirmedText, rescheduleLinkText } from "@/lib/booking/messages";
import { classifyBookingReply } from "@/lib/booking/reminders";
import type { Tables } from "@/lib/database.types";
import { normalizeKeyword } from "@/lib/automation/keywords";
import { loadSendingContext, sendToContact } from "@/lib/messaging/send";
import type { Org } from "@/lib/org";
import { formatUSPhone } from "@/lib/phone";
import { scheduleBookingReminder } from "@/lib/services/booking-reminders";
import { bookingWhen } from "@/lib/services/booking";
import { notifyOwner } from "@/lib/services/conversations";
import { textAboutBooking } from "@/lib/services/approvals";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Short replies about a booking:
 *  - YES to "an AI assistant requested a booking for you" → the request goes ahead
 *    (to the owner's approval queue, or confirmed if no rule applies);
 *  - C to a reminder → marked "customer confirmed";
 *  - R to a reminder → they get their reschedule link.
 * Anything else is an ordinary message (returns false).
 */
export async function handleBookingReply(
  db: AdminClient,
  org: Org,
  contact: Tables<"contacts">,
  body: string,
  now = new Date(),
): Promise<boolean> {
  const intent = classifyBookingReply(normalizeKeyword(body));
  if (!intent) return false;
  const lang = contact.preferred_language === "es" ? "es" : "en";
  const who = contact.name ?? formatUSPhone(contact.phone);

  if (intent === "confirm") {
    // 1. A request from their AI agent, waiting for them to confirm it's really them.
    const { data: waiting } = await db
      .from("bookings")
      .select("*")
      .eq("org_id", org.id)
      .eq("contact_id", contact.id)
      .eq("status", "requested")
      .is("customer_verified_at", null)
      .gt("verify_by", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (waiting) {
      const needsOk = waiting.pending_reasons.length > 0;
      await db
        .from("bookings")
        .update({ customer_verified_at: now.toISOString(), status: needsOk ? "pending_approval" : "confirmed" })
        .eq("id", waiting.id)
        .eq("status", "requested");
      if (needsOk) {
        await db.from("approval_requests").insert({
          org_id: org.id,
          kind: "booking",
          booking_id: waiting.id,
          lead_id: waiting.lead_id,
          contact_id: contact.id,
          reasons: waiting.pending_reasons,
        });
        await textAboutBooking(db, org, waiting.id, "received", null);
      } else {
        await scheduleBookingReminder(db, org, waiting.id, now.getTime());
        await textAboutBooking(db, org, waiting.id, "confirmed", null);
      }
      await notifyOwner(db, org.id, {
        kind: "new_lead",
        body: `${who} confirmed the booking their AI assistant requested: ${bookingWhen(waiting, org.timezone)}${needsOk ? ". Needs your OK." : "."}`,
        link: needsOk ? "/schedule" : waiting.lead_id ? `/inbox/${waiting.lead_id}` : "/schedule",
      });
      return true;
    }
  }

  // 2. Replies to a reminder: their next confirmed booking in the next 3 days.
  const { data: upcoming } = await db
    .from("bookings")
    .select("*")
    .eq("org_id", org.id)
    .eq("contact_id", contact.id)
    .eq("status", "confirmed")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + 3 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (!upcoming) return false;
  const { count: reminded } = await db
    .from("scheduled_messages")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("kind", "booking_reminder")
    .eq("status", "sent")
    .contains("context", { booking_id: upcoming.id });
  if (!reminded) return false; // only treat C/R as booking replies after a reminder

  const when = bookingWhen(upcoming, org.timezone, lang);
  const reply = intent === "confirm" ? reminderConfirmedText(lang, org.name, when) : rescheduleLinkText(lang, org.name, manageUrl(upcoming.id));
  if (intent === "confirm") await db.from("bookings").update({ customer_confirmed_at: now.toISOString() }).eq("id", upcoming.id);
  await sendToContact(db, await loadSendingContext(db, org.id, now), {
    contact,
    body: reply,
    category: "conversational",
    leadId: upcoming.lead_id,
    senderType: "automation",
    now,
  });
  if (intent === "reschedule") {
    await notifyOwner(db, org.id, {
      kind: "flagged_reply",
      body: `${who} wants to reschedule ${when}. They got their reschedule link.`,
      link: upcoming.lead_id ? `/inbox/${upcoming.lead_id}` : "/schedule",
    });
  }
  return true;
}
