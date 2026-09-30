import "server-only";
import { reminderSendAt } from "@/lib/booking/reminders";
import { parseBookingSettings } from "@/lib/booking/settings";
import type { Org } from "@/lib/org";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Queues the day-before reminder for a confirmed booking. The outbox re-checks
 * everything at send time (still confirmed? same time? opted out?), so a
 * canceled or moved booking's reminder is simply skipped.
 */
export async function scheduleBookingReminder(db: AdminClient, org: Org, bookingId: string, nowMs = Date.now()): Promise<boolean> {
  if (!parseBookingSettings(org.booking_settings).remindersEnabled) return false;
  const { data: b } = await db.from("bookings").select("id, contact_id, lead_id, starts_at, status").eq("id", bookingId).eq("org_id", org.id).maybeSingle();
  if (!b || b.status !== "confirmed") return false;
  const sendAt = reminderSendAt(b.starts_at, org.timezone, nowMs);
  if (!sendAt) return false;
  const { error } = await db.from("scheduled_messages").insert({
    org_id: org.id,
    contact_id: b.contact_id,
    lead_id: b.lead_id,
    kind: "booking_reminder",
    category: "informational",
    send_at: sendAt.toISOString(),
    context: { booking_id: b.id, starts_at: b.starts_at },
  });
  return !error;
}
