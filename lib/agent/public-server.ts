import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveDay } from "@/lib/agent/dates";
import { getIndustry } from "@/lib/industries";
import type { PublicAgentToolRegistrar } from "@/lib/modules/types";
import { formatUSPhone } from "@/lib/phone";
import { priceText } from "@/lib/public/profile";
import { allowPublicRequest } from "@/lib/public/rate-limit";
import { loadBookingData, openingsOn } from "@/lib/services/booking";
import { requestPublicBooking, type PublicBusiness } from "@/lib/services/public-booking";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateString } from "@/lib/time";

/**
 * The PUBLIC agent connection for ONE business: what a customer's AI agent
 * (ChatGPT, Claude, Siri, Gemini acting for a customer) may do. No key needed.
 *
 * Safety rules:
 *  - Only public, allow-listed business facts (public_business_profile()).
 *  - Never any customer's details, private notes, codes, VINs or files;
 *    open times show only times, never who else is booked.
 *  - Bookings go through the same rules, approval rules (outside-agent
 *    bookings wait for the owner's OK by default) and texting rules.
 */

export type PublicAgentContext = { db: AdminClient; biz: PublicBusiness; ipHash: string; bookingUrl: string | null };

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 1) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

export function buildPublicAgentServer(ctx: PublicAgentContext, extensions: PublicAgentToolRegistrar[] = []): McpServer {
  const { db, biz } = ctx;
  const { org, profile } = biz;
  const industry = getIndustry(profile.industry);
  const today = () => localDateString(new Date(), org.timezone);
  const when = (ms: number) =>
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: org.timezone }).format(new Date(ms));

  const server = new McpServer(
    { name: `${profile.slug}-booking`, version: "1.0.0" },
    {
      instructions: [
        `This is ${profile.name}, a ${industry?.label.toLowerCase() ?? "local service business"}${profile.service_area ? ` serving ${profile.service_area}` : ""} (time zone ${org.timezone}).`,
        "You're acting for a customer. Use these tools to answer questions about the business, check open times and request a booking.",
        "Prices are typical ranges, not quotes; say the business confirms the exact price.",
        "Only request a booking after the customer chose a time and agreed to receive texts from the business about it.",
        "Bookings may need the business's OK; tell the customer they'll get a text when it's confirmed.",
        ...(industry?.voice.never.length ? [`Never do these: ${industry.voice.never.join(" ")}`] : []),
      ].join(" "),
    },
  );

  server.registerTool(
    "get_business_info",
    {
      title: "About the business",
      description: "Name, what they do, area served, phone, hours, licenses and insurance, and how to book.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      ok({
        name: profile.name,
        industry: industry?.label ?? null,
        about: profile.about,
        service_area: profile.service_area,
        phone_or_text: profile.phone ? formatUSPhone(profile.phone) : null,
        hours: profile.hours,
        licenses_and_insurance: profile.credentials.map((c) => `${c.label}${c.number ? ` #${c.number}` : ""}${c.issuer ? ` (${c.issuer})` : ""}`),
        online_booking: profile.booking_available ? (ctx.bookingUrl ?? "available through request_booking") : "not available; call or text",
        google_reviews: profile.review_url,
      }),
  );

  server.registerTool(
    "list_services",
    {
      title: "Services and typical prices",
      description: "Services this business offers, with typical price ranges (estimates) and whether they can be booked here.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      ok(
        profile.services.map((s) => ({
          service_id: s.id,
          name: s.name,
          typical_price: priceText(s),
          how_booked: s.booking_mode.replace(/_/g, " "),
          ...(s.requires.length ? { customer_must_provide: s.requires } : {}),
        })),
      ),
  );

  if (profile.booking_available) {
    server.registerTool(
      "find_open_times",
      {
        title: "Find open times",
        description: "Open times for a service on a date. Returns only times (never other customers). Overnight stays: use request_booking with check-in/out dates.",
        inputSchema: {
          service_id: z.string().uuid(),
          date: z.string().max(20).describe('YYYY-MM-DD, "today", "tomorrow" or a weekday'),
          zip: z.string().regex(/^\d{5}$/).optional().describe("Where the visit happens, for businesses that come to you."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ service_id, date, zip }) => {
        const service = profile.services.find((s) => s.id === service_id);
        if (!service) return fail("Unknown service_id. Use list_services.");
        const day = resolveDay(date, today());
        if (!day || day < today() || day > addDays(today(), 120)) return fail("Pick a date between today and 4 months out.");
        const data = await loadBookingData(db, org, day, addDays(day, 1));
        const row = data.services.find((s) => s.id === service.id);
        const openings = row ? openingsOn(data, row, day, org, Date.now(), zip ?? null) : [];
        return ok({
          service: service.name,
          date: day,
          open: openings.slice(0, 30).map((o) =>
            o.kind === "day" ? { book_with: { date: o.date }, note: "any time that day" } : { book_with: { start: new Date(o.startMs).toISOString() }, time: when(o.startMs), ...(o.kind === "window" ? { arrival_window: o.label } : {}) },
          ),
        });
      },
    );

    server.registerTool(
      "request_booking",
      {
        title: "Request a booking",
        description:
          "Request a booking for the customer you're helping. Only after they chose the time and agreed to get texts from the business about this booking. The business may need to confirm; the customer gets a text either way.",
        inputSchema: {
          service_id: z.string().uuid(),
          start: z.string().datetime().optional().describe("From find_open_times (book_with.start)."),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("From find_open_times (book_with.date) for whole-day services."),
          check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          customer_name: z.string().min(1).max(100),
          customer_mobile: z.string().max(20).describe("US mobile number; the business texts it about the booking."),
          zip: z.string().regex(/^\d{5}$/).optional(),
          notes: z.string().max(1000).optional().describe("What the customer needs. No passwords, codes or card numbers."),
          language: z.enum(["en", "es"]).optional(),
          customer_agreed_to_texts: z.literal(true).describe("The customer agreed to receive text messages from this business about this booking."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      async (a) => {
        if (!(await allowPublicRequest(db, org.id, ctx.ipHash, "booking"))) return fail("Too many booking requests. Try again later, or have the customer call or text the business.");
        const r = await requestPublicBooking(db, biz, {
          serviceId: a.service_id,
          startMs: a.start ? Date.parse(a.start) : undefined,
          date: a.date,
          checkIn: a.check_in,
          checkOut: a.check_out,
          name: a.customer_name,
          phone: a.customer_mobile,
          zip: a.zip ?? null,
          notes: a.notes ?? null,
          language: a.language ?? "en",
          consentText: `The customer's AI agent confirmed the customer agreed to receive text messages from ${profile.name} about this booking. Reply STOP to opt out.`,
          channel: "outside_agent",
        });
        if (!r.ok) return fail(r.error);
        return ok({
          reference: r.reference,
          status: r.status === "pending_approval" ? "requested: the business will confirm by text" : "confirmed",
          when: r.when,
        });
      },
    );
  }

  for (const register of extensions) register(server, { db, org }, { ok, fail });
  return server;
}
