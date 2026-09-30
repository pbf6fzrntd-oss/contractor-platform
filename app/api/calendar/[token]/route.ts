import { buildCalendarFeed, orgForCalendarToken } from "@/lib/services/calendar";
import { createAdminClient } from "@/lib/supabase/admin";

/** The private calendar feed. The secret token in the address is the only key; it finds exactly one business. */
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const { token } = await params;
  const db = createAdminClient();
  const org = await orgForCalendarToken(db, token.replace(/\.ics$/, ""));
  if (!org) return new Response("Not found", { status: 404 });
  return new Response(await buildCalendarFeed(db, org), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bookings.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
