import "server-only";
import { bookingConfirmedText, bookingDeclinedText, bookingReceivedText } from "@/lib/booking/messages";
import { loadSendingContext, sendToContact } from "@/lib/messaging/send";
import type { Org } from "@/lib/org";
import { bookingWhen } from "@/lib/services/booking";
import type { AdminClient } from "@/lib/supabase/admin";

/** Sources where the customer is waiting to hear back from the business. */
const CUSTOMER_WAITING = ["customer_link", "outside_agent", "voice"];

/** Texts the customer about their booking. True if a text was sent. */
async function textAboutBooking(db: AdminClient, org: Org, bookingId: string, kind: "received" | "confirmed" | "declined", userId: string | null): Promise<boolean> {
  const { data: b } = await db.from("bookings").select("*").eq("id", bookingId).eq("org_id", org.id).maybeSingle();
  if (!b || !CUSTOMER_WAITING.includes(b.source)) return false;
  const { data: contact } = await db.from("contacts").select("*").eq("id", b.contact_id).eq("org_id", org.id).single();
  if (!contact) return false;
  const lang = contact.preferred_language === "es" ? "es" : "en";
  const when = bookingWhen(b, org.timezone);
  const body = kind === "received" ? bookingReceivedText(lang, org.name, when) : kind === "confirmed" ? bookingConfirmedText(lang, org.name, when) : bookingDeclinedText(lang, org.name, when);
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
export async function sendBookingReceived(db: AdminClient, org: Org, bookingId: string): Promise<void> {
  await textAboutBooking(db, org, bookingId, "received", null);
}

/** Tells a customer their (instantly confirmed) booking is set. */
export async function sendBookingConfirmed(db: AdminClient, org: Org, bookingId: string): Promise<void> {
  await textAboutBooking(db, org, bookingId, "confirmed", null);
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
    .update({ status: decision === "approve" ? "confirmed" : "canceled" })
    .eq("id", bookingId)
    .eq("org_id", org.id)
    .in("status", ["requested", "pending_approval"])
    .select("id")
    .maybeSingle();
  if (!b) return { done: false, texted: false };
  await db
    .from("approval_requests")
    .update({ status: decision === "approve" ? "approved" : "declined", decided_by: userId, decided_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .eq("org_id", org.id);
  const texted = await textAboutBooking(db, org, bookingId, decision === "approve" ? "confirmed" : "declined", userId);
  return { done: true, texted };
}
