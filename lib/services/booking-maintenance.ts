import "server-only";
import { isApprovalExpired, isVerificationExpired } from "@/lib/booking/reminders";
import { parseBookingSettings } from "@/lib/booking/settings";
import { toOrg } from "@/lib/org";
import { textAboutBooking } from "@/lib/services/approvals";
import { bookingWhen } from "@/lib/services/booking";
import { notifyOwner } from "@/lib/services/conversations";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Releases time slots held by requests nobody finished:
 *  - AI-agent requests the customer never confirmed with YES (quietly: we
 *    don't keep texting a number that may not be theirs);
 *  - requests the owner didn't approve within the hold time (the customer is
 *    told and invited to pick another time; the owner gets a note).
 * Runs with the every-minute scheduler. Safe to run repeatedly.
 */
export async function expireStaleBookings(db: AdminClient, now = new Date()): Promise<{ unverified: number; unapproved: number }> {
  const nowMs = now.getTime();
  const { data: waiting } = await db
    .from("bookings")
    .select("id, org_id, status, created_at, verify_by, customer_verified_at, mode, starts_at, ends_at, check_in, check_out, service_date")
    .in("status", ["requested", "pending_approval"])
    .order("created_at")
    .limit(500);
  const orgIds = [...new Set((waiting ?? []).map((b) => b.org_id))];
  const { data: orgs } = orgIds.length ? await db.from("organizations").select("*").in("id", orgIds) : { data: [] };
  let unverified = 0;
  let unapproved = 0;

  for (const b of waiting ?? []) {
    const orgRow = orgs?.find((o) => o.id === b.org_id);
    if (!orgRow) continue;
    const org = toOrg(orgRow);
    const settings = parseBookingSettings(org.booking_settings);

    if (b.status === "requested" && isVerificationExpired(b.verify_by, nowMs)) {
      const { data: done } = await db.from("bookings").update({ status: "canceled", canceled_by: "system", notes: "The customer didn't confirm their AI assistant's request in time." }).eq("id", b.id).eq("status", "requested").select("id");
      if (done?.length) unverified += 1;
      continue;
    }

    // The owner's clock starts when the request reached them (after the customer's YES, for AI-agent requests).
    if (b.status === "pending_approval" && isApprovalExpired(b.customer_verified_at ?? b.created_at, nowMs, settings.approvalHoldHours)) {
      const { data: done } = await db.from("bookings").update({ status: "canceled", canceled_by: "system", notes: `Released: not approved within ${settings.approvalHoldHours} hours.` }).eq("id", b.id).eq("status", "pending_approval").select("id");
      if (!done?.length) continue;
      unapproved += 1;
      await db.from("approval_requests").update({ status: "expired", decided_at: now.toISOString() }).eq("booking_id", b.id).eq("status", "pending");
      await textAboutBooking(db, org, b.id, "expired", null);
      await notifyOwner(db, org.id, {
        kind: "system",
        body: `A booking request for ${bookingWhen(b, org.timezone)} waited ${settings.approvalHoldHours} hours without an answer, so the time was released and the customer was told.`,
        link: "/schedule",
      });
    }
  }
  return { unverified, unapproved };
}
