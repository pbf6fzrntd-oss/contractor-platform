import "server-only";
import { manageUrl } from "@/lib/booking/manage-link";
import {
  agentBookingVerifyText,
  bookingCanceledText,
  bookingConfirmedText,
  bookingDeclinedText,
  bookingExpiredText,
  bookingReceivedText,
} from "@/lib/booking/messages";
import { parseBookingSettings } from "@/lib/booking/settings";
import { scheduleBookingReminder } from "@/lib/services/booking-reminders";
import { loadSendingContext, sendToContact } from "@/lib/messaging/send";
import type { Org } from "@/lib/org";
import { bookingWhen } from "@/lib/services/booking";
import type { AdminClient } from "@/lib/supabase/admin";

/** Sources where the customer is waiting to hear back from the business. */
const CUSTOMER_WAITING = ["customer_link", "outside_agent", "voice"];

/** Texts the customer about their booking. True if a text was sent. */
export type BookingTextKind = "received" | "confirmed" | "declined" | "expired" | "canceled" | "verify";

/**
 * Texts the customer about their booking. By default only for bookings made
 * from outside (the customer is waiting to hear back); `always` is for texts
 * the customer asked for (their own cancel, reminders' replies).
 */
export async function textAboutBooking(db: AdminClient, org: Org, bookingId: string, kind: BookingTextKind, userId: string | null, always = false): Promise<boolean> {
  const { data: b } = await db.from("bookings").select("*").eq("id", bookingId).eq("org_id", org.id).maybeSingle();
  if (!b || (!always && !CUSTOMER_WAITING.includes(b.source))) return false;
  const { data: contact } = await db.from("contacts").select("*").eq("id", b.contact_id).eq("org_id", org.id).single();
  if (!contact) return false;
  const lang = contact.preferred_language === "es" ? "es" : "en";
  const when = bookingWhen(b, org.timezone, lang);
  const body =
    kind === "received"
      ? bookingReceivedText(lang, org.name, when)
      : kind === "confirmed"
        ? bookingConfirmedText(lang, org.name, when, manageUrl(b.id))
        : kind === "declined"
          ? bookingDeclinedText(lang, org.name, when)
          : kind === "expired"
            ? bookingExpiredText(lang, org.name, when)
            : kind === "canceled"
              ? bookingCanceledText(lang, org.name, when)
              : agentBookingVerifyText(lang, org.name, when, parseBookingSettings(org.booking_settings).agentVerifyMinutes);
  // Same pipeline as every other text: opt-outs, hours, plan limits and the STOP footer apply.
  const result = await sendToContact(db, await loadSendingContext(db, org.id), {
    contact,
    body,
    category: "informational",
    leadId: b.lead_id,
    senderType: userId ? "user" : "automation",
    userId,
  });
  return result.status === "sent";
}

/** Tells a customer we got their request (for bookings that wait for approval). */
export async function sendBookingReceived(db: AdminClient, org: Org, bookingId: string): Promise<boolean> {
  return textAboutBooking(db, org, bookingId, "received", null);
}

/** Tells a customer their (instantly confirmed) booking is set. */
export async function sendBookingConfirmed(db: AdminClient, org: Org, bookingId: string): Promise<boolean> {
  return textAboutBooking(db, org, bookingId, "confirmed", null);
}

/**
 * Approves or declines a booking that's waiting, records who decided, and
 * texts the customer if they booked from outside (online, their AI agent, phone assistant).
 */
export async function decideBooking(
  db: AdminClient,
  org: Org,
  bookingId: string,
  decision: "approve" | "decline",
  userId: string | null,
): Promise<{ done: boolean; texted: boolean }> {
  const { data: b } = await db
    .from("bookings")
    .update(decision === "approve" ? { status: "confirmed" } : { status: "canceled", canceled_by: "team" })
    .eq("id", bookingId)
    .eq("org_id", org.id)
    .in("status", ["requested", "pending_approval"])
    .select("id, verify_by, customer_verified_at")
    .maybeSingle();
  if (!b) return { done: false, texted: false };
  // An AI-agent booking the customer never confirmed by text: nobody has agreed to texts yet, so don't send any more.
  const unverified = b.verify_by !== null && b.customer_verified_at === null;
  await db
    .from("approval_requests")
    .update({ status: decision === "approve" ? "approved" : "declined", decided_by: userId, decided_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .eq("org_id", org.id);
  if (decision === "approve") await scheduleBookingReminder(db, org, bookingId);
  const texted = unverified && decision === "decline" ? false : await textAboutBooking(db, org, bookingId, decision === "approve" ? "confirmed" : "declined", userId);
  return { done: true, texted };
}
