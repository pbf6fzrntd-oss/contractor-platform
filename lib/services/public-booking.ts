import "server-only";
import { parsePublicProfile, type PublicProfile } from "@/lib/public/profile";
import { normalizeUSPhone } from "@/lib/phone";
import { toOrg, type Org } from "@/lib/org";
import { sendBookingConfirmed, sendBookingReceived, textAboutBooking } from "@/lib/services/approvals";
import { bookingWhen, createBooking } from "@/lib/services/booking";
import { notifyOwner } from "@/lib/services/conversations";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Everything the public side (booking page, customers' AI agents) may do.
 * The business is ALWAYS found from the public slug, never from ids a caller
 * sends, and every id a caller sends is re-checked against that business.
 */

export type PublicBusiness = { org: Org; profile: PublicProfile };

export async function loadPublicBusiness(db: AdminClient, slug: string): Promise<PublicBusiness | null> {
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) return null;
  const [{ data: orgId }, { data: profileJson }] = await Promise.all([
    db.rpc("public_profile_org", { p_slug: slug }),
    db.rpc("public_business_profile", { p_slug: slug }),
  ]);
  const profile = parsePublicProfile(profileJson);
  if (!orgId || !profile) return null;
  const { data: row } = await db.from("organizations").select("*").eq("id", orgId).single();
  return row ? { org: toOrg(row), profile } : null;
}

export type PublicBookingInput = {
  serviceId: string;
  startMs?: number;
  date?: string;
  checkIn?: string;
  checkOut?: string;
  name: string;
  phone: string;
  zip?: string | null;
  notes?: string | null;
  language: "en" | "es";
  /** Exact consent wording the customer agreed to (web form) or the agent affirmed. */
  consentText: string;
  channel: "customer_link" | "outside_agent";
};

export type PublicBookingResult =
  | { ok: true; reference: string; status: "confirmed" | "pending_approval" | "awaiting_customer"; when: string; texted: boolean }
  | { ok: false; error: string };

export async function requestPublicBooking(db: AdminClient, biz: PublicBusiness, input: PublicBookingInput): Promise<PublicBookingResult> {
  const { org, profile } = biz;
  if (!profile.booking_available) return { ok: false, error: "This business isn't taking online bookings right now. Please call or text them." };
  // The service must be one this business shows publicly.
  if (!profile.services.some((s) => s.id === input.serviceId)) return { ok: false, error: "That service isn't available to book online." };
  const phone = normalizeUSPhone(input.phone);
  if (!phone) return { ok: false, error: "Enter a 10-digit US mobile number." };
  const name = input.name.trim().slice(0, 100);
  if (!name) return { ok: false, error: "Enter a name." };
  if (input.zip && !/^\d{5}$/.test(input.zip)) return { ok: false, error: "Enter a 5-digit ZIP code." };

  // Find or add the customer (never reveals whether they were already a customer).
  let { data: contact } = await db.from("contacts").select("*").eq("org_id", org.id).eq("phone", phone).maybeSingle();
  if (!contact) {
    const { data, error } = await db.from("contacts").insert({ org_id: org.id, phone, name, preferred_language: input.language }).select("*").single();
    if (error || !data) return { ok: false, error: "Something went wrong. Please try again." };
    contact = data;
  } else if (!contact.name) {
    await db.from("contacts").update({ name }).eq("id", contact.id).eq("org_id", org.id);
  }

  // Their agreement to texts about this booking goes in the permanent consent log.
  await db.rpc("record_consent_event", {
    p_org_id: org.id,
    p_contact_id: contact.id,
    p_kind: "service_texts_attested",
    p_method: input.channel === "outside_agent" ? "ai_agent_request" : "web_form",
    p_evidence: input.consentText.slice(0, 900),
  });

  // Attach to their open lead, or start one so it shows in the inbox.
  const { data: open } = await db.from("leads").select("id").eq("org_id", org.id).eq("contact_id", contact.id).in("stage", ["new", "contacted", "estimate_sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let leadId = open?.id ?? null;
  if (!leadId) {
    const { data: lead } = await db
      .from("leads")
      .insert({ org_id: org.id, contact_id: contact.id, source: input.channel === "outside_agent" ? "outside_agent" : "booking_page", notes: input.notes?.slice(0, 2000) || null, unread: true })
      .select("id")
      .single();
    leadId = lead?.id ?? null;
  }

  const result = await createBooking(db, org, {
    serviceId: input.serviceId,
    contactId: contact.id,
    leadId,
    startMs: input.startMs,
    date: input.date,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    zip: input.zip ?? null,
    customerNotes: input.notes?.slice(0, 1000) || null,
    source: input.channel,
    // A customer's AI agent can't prove the phone number is theirs: the customer must text YES first.
    holdForCustomerVerification: input.channel === "outside_agent",
  });
  if (!result.ok) return result;

  const { data: b } = await db.from("bookings").select("mode, starts_at, ends_at, check_in, check_out, service_date").eq("id", result.bookingId).single();
  const when = b ? bookingWhen(b, org.timezone, input.language) : "";
  if (result.status === "requested") {
    const texted = await textAboutBooking(db, org, result.bookingId, "verify", null);
    // The owner hears about it once the customer confirms (lib/services/booking-replies.ts).
    return { ok: true, reference: result.bookingId.slice(0, 8).toUpperCase(), status: "awaiting_customer", when, texted };
  }
  const waiting = result.status === "pending_approval";
  const texted = waiting ? await sendBookingReceived(db, org, result.bookingId) : await sendBookingConfirmed(db, org, result.bookingId);

  await notifyOwner(db, org.id, {
    kind: "new_lead",
    body: `${waiting ? "Booking request" : "New booking"} from ${name} (${input.channel === "outside_agent" ? "their AI agent" : "online"}): ${when}${waiting ? ". Needs your OK." : "."}`,
    link: waiting ? "/schedule" : leadId ? `/inbox/${leadId}` : "/schedule",
  });
  return { ok: true, reference: result.bookingId.slice(0, 8).toUpperCase(), status: waiting ? "pending_approval" : "confirmed", when, texted };
}
