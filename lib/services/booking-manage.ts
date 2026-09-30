import "server-only";
import { toOrg, type Org } from "@/lib/org";
import { formatUSPhone } from "@/lib/phone";
import { sendBookingConfirmed, sendBookingReceived, textAboutBooking } from "@/lib/services/approvals";
import { bookingWhen, createBooking } from "@/lib/services/booking";
import { notifyOwner } from "@/lib/services/conversations";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/database.types";

/**
 * What a customer can do from their private booking link: see it, cancel it,
 * or move it. Moving frees the old time, then books the new one with the same
 * rules, approvals and capacity checks as online booking; if the new time
 * can't be booked, the old booking is put back.
 */

export type ManagedBooking = { booking: Tables<"bookings">; org: Org; serviceName: string; contact: Tables<"contacts"> };

const ACTIVE = ["requested", "pending_approval", "confirmed"];

export async function loadManagedBooking(db: AdminClient, bookingId: string): Promise<ManagedBooking | null> {
  const { data: booking } = await db.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!booking) return null;
  const [{ data: orgRow }, { data: service }, { data: contact }] = await Promise.all([
    db.from("organizations").select("*").eq("id", booking.org_id).single(),
    booking.service_id ? db.from("service_catalog").select("name, name_es").eq("id", booking.service_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("contacts").select("*").eq("id", booking.contact_id).single(),
  ]);
  if (!orgRow || !contact) return null;
  const es = contact.preferred_language === "es";
  return { booking, org: toOrg(orgRow), serviceName: (es ? service?.name_es : null) ?? service?.name ?? "Visit", contact };
}

export function canChange(b: Tables<"bookings">, nowMs = Date.now()): boolean {
  return ACTIVE.includes(b.status) && Date.parse(b.starts_at) > nowMs;
}

export async function cancelByCustomer(db: AdminClient, m: ManagedBooking): Promise<{ ok: boolean; error?: string }> {
  if (!canChange(m.booking)) return { ok: false, error: "This booking can't be changed anymore. Please call or text the business." };
  const { data } = await db
    .from("bookings")
    .update({ status: "canceled", canceled_by: "customer", notes: "Canceled by the customer from their link." })
    .eq("id", m.booking.id)
    .in("status", ACTIVE)
    .select("id");
  if (!data?.length) return { ok: false, error: "This booking was already changed." };
  await db.from("approval_requests").update({ status: "declined", decided_at: new Date().toISOString() }).eq("booking_id", m.booking.id).eq("status", "pending");
  await textAboutBooking(db, m.org, m.booking.id, "canceled", null, true);
  await notifyOwner(db, m.org.id, {
    kind: "flagged_reply",
    body: `${m.contact.name ?? formatUSPhone(m.contact.phone)} canceled ${bookingWhen(m.booking, m.org.timezone)} (from their booking link).`,
    link: m.booking.lead_id ? `/inbox/${m.booking.lead_id}` : "/schedule",
  });
  return { ok: true };
}

export async function rescheduleByCustomer(
  db: AdminClient,
  m: ManagedBooking,
  choice: { startMs?: number; date?: string; checkIn?: string; checkOut?: string },
): Promise<{ ok: true; bookingId: string; status: string; when: string } | { ok: false; error: string }> {
  if (!canChange(m.booking)) return { ok: false, error: "This booking can't be changed anymore. Please call or text the business." };
  if (!m.booking.service_id) return { ok: false, error: "Please call or text the business to move this booking." };
  // Free the old time first (so moving 30 minutes later doesn't clash with itself); put it back if the new time fails.
  const previous = m.booking.status;
  const { data: released } = await db
    .from("bookings")
    .update({ status: "canceled", canceled_by: "customer", notes: "Moved by the customer to a new time." })
    .eq("id", m.booking.id)
    .eq("status", previous)
    .select("id");
  if (!released?.length) return { ok: false, error: "This booking was just changed. Refresh and try again." };
  const result = await createBooking(db, m.org, {
    serviceId: m.booking.service_id,
    contactId: m.booking.contact_id,
    leadId: m.booking.lead_id,
    subjectId: m.booking.subject_id,
    packageId: m.booking.package_id,
    startMs: choice.startMs,
    date: choice.date,
    checkIn: choice.checkIn,
    checkOut: choice.checkOut,
    unitClass: m.booking.unit_class,
    zip: m.booking.service_zip,
    address: m.booking.address,
    customerNotes: m.booking.customer_notes,
    // Same rules as booking online (approval rules may hold it for the owner's OK).
    source: "customer_link",
    rescheduledFrom: m.booking.id,
  });
  if (!result.ok) {
    await db.from("bookings").update({ status: previous, canceled_by: null, notes: m.booking.notes }).eq("id", m.booking.id).eq("status", "canceled");
    return result;
  }
  await db.from("approval_requests").update({ status: "declined", decided_at: new Date().toISOString() }).eq("booking_id", m.booking.id).eq("status", "pending");
  const lang = m.contact.preferred_language === "es" ? "es" : "en";
  const { data: fresh } = await db.from("bookings").select("*").eq("id", result.bookingId).single();
  const when = fresh ? bookingWhen(fresh, m.org.timezone, lang) : "";
  if (result.status === "pending_approval") await sendBookingReceived(db, m.org, result.bookingId);
  else await sendBookingConfirmed(db, m.org, result.bookingId);
  await notifyOwner(db, m.org.id, {
    kind: "flagged_reply",
    body: `${m.contact.name ?? formatUSPhone(m.contact.phone)} moved ${bookingWhen(m.booking, m.org.timezone)} to ${fresh ? bookingWhen(fresh, m.org.timezone) : "a new time"}${result.status === "pending_approval" ? ". Needs your OK." : "."}`,
    link: result.status === "pending_approval" ? "/schedule" : m.booking.lead_id ? `/inbox/${m.booking.lead_id}` : "/schedule",
  });
  return { ok: true, bookingId: result.bookingId, status: result.status, when };
}
