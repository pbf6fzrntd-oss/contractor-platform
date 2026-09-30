import { z } from "zod";
import type { AgentToolRegistrar } from "@/lib/modules/types";
import { formatUSPhone } from "@/lib/phone";
import { localDateString } from "@/lib/time";
import { agreementStanding, BILLING_LABEL, daysUntil, type Billing } from "./rules/agreements";

/**
 * AI assistant tools for Recurring Home Services. Read-only for now: the
 * owner's assistant can see agreements and what's coming up for renewal.
 * Private access notes are never returned.
 */
export const recurringHomeAgentTools: AgentToolRegistrar = (server, ctx, { logged, ok }) => {
  const { db, org } = ctx;

  server.registerTool(
    "list_service_agreements",
    {
      title: "Service agreements",
      description:
        "The business's service agreements (quarterly pest plans, termite bonds, pool seasons, cleaning plans): customer, price, end date, whether it renews on its own, and whether the renewal reminder went out. Use renewing_within_days to see what's coming up.",
      inputSchema: {
        renewing_within_days: z.number().int().min(1).max(365).optional().describe("Only agreements that renew or end within this many days."),
        include_ended: z.boolean().optional().describe("Include ended and canceled agreements."),
      },
      annotations: { readOnlyHint: true },
    },
    logged("list_service_agreements", async ({ renewing_within_days, include_ended }: { renewing_within_days?: number; include_ended?: boolean }) => {
      const today = localDateString(new Date(), org.timezone);
      let q = db.from("rh_agreements").select("*").eq("org_id", org.id).order("ends_on", { ascending: true, nullsFirst: false }).limit(200);
      if (!include_ended) q = q.eq("status", "active");
      const { data: rows } = await q;
      const list = (rows ?? []).filter((a) => !renewing_within_days || (a.ends_on && daysUntil(a.ends_on, today) <= renewing_within_days));
      const { data: contacts } = list.length ? await db.from("contacts").select("id, name, phone").in("id", [...new Set(list.map((a) => a.contact_id))]) : { data: [] };
      const out = list.map((a) => {
        const c = contacts?.find((x) => x.id === a.contact_id);
        return {
          agreement: a.name,
          customer: c?.name ?? (c ? formatUSPhone(c.phone) : null),
          price: a.price_cents != null ? `$${(a.price_cents / 100).toFixed(2)} ${BILLING_LABEL[a.billing as Billing]}` : null,
          starts_on: a.starts_on,
          ends_on: a.ends_on,
          renews_automatically: a.auto_renew,
          standing: agreementStanding(a, today).replace(/_/g, " "),
          renewal_reminder_sent: Boolean(a.ends_on && a.renewal_notice_for === a.ends_on),
        };
      });
      return { result: ok({ today, agreements: out }), summary: `Looked at ${out.length} service agreement${out.length === 1 ? "" : "s"}` };
    }),
  );
};
