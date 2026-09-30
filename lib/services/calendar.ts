import "server-only";
import { randomBytes } from "node:crypto";
import { buildCalendar, type CalendarEvent } from "@/lib/calendar/ics";
import { isScheduledOn } from "@/lib/automation/schedule";
import { publicEnv } from "@/lib/env";
import { toOrg, type Org } from "@/lib/org";
import { bookingWhen } from "@/lib/services/booking";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateString } from "@/lib/time";

/**
 * A business's private calendar feed: its bookings (2 weeks back, 3 months
 * ahead) and, for lawn businesses, each day's route. Shows the customer's
 * name, service and address only: never notes, gate codes or other private details.
 */
export const FEED_DAYS_BACK = 14;
export const FEED_DAYS_AHEAD = 90;
export const ROUTE_DAYS_AHEAD = 21;

export function newCalendarToken(): string {
  return randomBytes(24).toString("base64url");
}

export function calendarFeedUrl(token: string): string {
  return `${publicEnv.siteUrl}/api/calendar/${token}`;
}

/** The business for a feed token (null if the token is unknown). */
export async function orgForCalendarToken(db: AdminClient, token: string): Promise<Org | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { data } = await db.from("organizations").select("*").eq("calendar_token", token).maybeSingle();
  return data ? toOrg(data) : null;
}

const STATUS: Record<string, "CONFIRMED" | "TENTATIVE" | "CANCELLED"> = {
  confirmed: "CONFIRMED",
  in_progress: "CONFIRMED",
  completed: "CONFIRMED",
  requested: "TENTATIVE",
  pending_approval: "TENTATIVE",
  canceled: "CANCELLED",
};

export async function buildCalendarFeed(db: AdminClient, org: Org, now = new Date()): Promise<string> {
  const today = localDateString(now, org.timezone);
  const from = addDays(today, -FEED_DAYS_BACK);
  const to = addDays(today, FEED_DAYS_AHEAD);
  const { data: bookings } = await db
    .from("bookings")
    .select("id, mode, status, starts_at, ends_at, check_in, check_out, service_date, address, service_id, contact_id")
    .eq("org_id", org.id)
    .gte("service_date", from)
    .lte("service_date", to)
    .neq("status", "no_show")
    .order("starts_at")
    .limit(2000);
  const list = bookings ?? [];
  const [{ data: services }, { data: contacts }] = await Promise.all([
    db.from("service_catalog").select("id, name").eq("org_id", org.id),
    list.length ? db.from("contacts").select("id, name, phone").in("id", [...new Set(list.map((b) => b.contact_id))]) : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string }[] }),
  ]);
  const events: CalendarEvent[] = list.map((b) => {
    const c = contacts?.find((x) => x.id === b.contact_id);
    const service = services?.find((s) => s.id === b.service_id)?.name ?? "Visit";
    const who = c?.name ?? c?.phone ?? "Customer";
    const tentative = b.status === "requested" || b.status === "pending_approval";
    return {
      uid: `booking-${b.id}@${new URL(publicEnv.siteUrl).hostname}`,
      kind: "timed",
      start: b.starts_at,
      end: b.ends_at,
      title: `${tentative ? "(Waiting) " : ""}${service}: ${who}`,
      location: b.address,
      description: `${bookingWhen(b, org.timezone)}\nOpen in the app: ${publicEnv.siteUrl}/schedule`,
      status: STATUS[b.status] ?? "CONFIRMED",
    };
  });

  if (org.business_type === "recurring") {
    const [{ data: recurring }, { data: moves }] = await Promise.all([
      db.from("recurring_services").select("id, frequency, service_day, start_date, status, paused_until").eq("org_id", org.id).neq("status", "canceled"),
      db.from("service_date_moves").select("recurring_service_id, from_date, to_date").eq("org_id", org.id).gte("to_date", today),
    ]);
    for (let i = 0; i <= ROUTE_DAYS_AHEAD; i++) {
      const day = addDays(today, i);
      const count = (recurring ?? []).filter((s) => isScheduledOn(s, day, moves ?? [])).length;
      if (count) events.push({ uid: `route-${org.id}-${day}@${new URL(publicEnv.siteUrl).hostname}`, kind: "allday", date: day, title: `Route: ${count} customer${count === 1 ? "" : "s"}`, description: `See the list: ${publicEnv.siteUrl}/today?date=${day}` });
    }
  }
  return buildCalendar(`${org.name} bookings`, events, now);
}
