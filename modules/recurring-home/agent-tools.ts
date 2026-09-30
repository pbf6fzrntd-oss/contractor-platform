import { z } from "zod";
import { accessAllows } from "@/lib/agent/oauth";
import type { AgentToolRegistrar } from "@/lib/modules/types";
import { formatUSPhone, normalizeUSPhone } from "@/lib/phone";
import { addDays, localDateString } from "@/lib/time";
import { agreementStanding, BILLING_LABEL, daysUntil, type Billing } from "./rules/agreements";
import { outOfRange, reportFields, summarizeReport, type ReportValues } from "./rules/visit-report";
import { saveVisitReport } from "./visits";

/**
 * AI assistant tools for Recurring Home Services: agreements (read), visit
 * reports (read), and logging a visit ("Read and act"). Private access notes
 * and crew notes are never returned.
 */
export const recurringHomeAgentTools: AgentToolRegistrar = (server, ctx, { logged, ok, fail }) => {
  const { db, org } = ctx;
  const fields = reportFields(org.industry);

  /** A recurring customer by name or phone; null with a reason when it isn't exactly one. */
  async function findCustomer(query: string): Promise<{ serviceId: string; contactId: string; name: string } | { error: string }> {
    const phone = normalizeUSPhone(query);
    let q = db.from("contacts").select("id, name, phone").eq("org_id", org.id).limit(10);
    q = phone ? q.eq("phone", phone) : q.ilike("name", `%${query.replace(/[%_]/g, "")}%`);
    const { data: contacts } = await q;
    const ids = (contacts ?? []).map((c) => c.id);
    const { data: services } = ids.length ? await db.from("recurring_services").select("id, contact_id").eq("org_id", org.id).in("contact_id", ids).neq("status", "canceled") : { data: [] };
    if (!services?.length) return { error: `No route customer matches "${query}".` };
    if (services.length > 1) return { error: `More than one route customer matches "${query}": ${services.map((s) => contacts?.find((c) => c.id === s.contact_id)?.name ?? "?").join(", ")}. Be more specific.` };
    const c = contacts!.find((x) => x.id === services[0].contact_id)!;
    return { serviceId: services[0].id, contactId: c.id, name: c.name ?? formatUSPhone(c.phone) };
  }

  server.registerTool(
    "list_visit_reports",
    {
      title: "Visit reports",
      description: `Recent visit reports (what the crew did at each stop${fields.some((f) => f.type === "number") ? ", water readings" : ""}), newest first, with readings outside the healthy range flagged. Crew notes are private and not included.`,
      inputSchema: {
        customer: z.string().optional().describe("Only this customer (name or phone)."),
        days: z.number().int().min(1).max(90).optional().describe("How far back. Default 14."),
      },
      annotations: { readOnlyHint: true },
    },
    logged("list_visit_reports", async ({ customer, days = 14 }: { customer?: string; days?: number }) => {
      const since = addDays(localDateString(new Date(), org.timezone), -days);
      let contactId: string | null = null;
      if (customer) {
        const found = await findCustomer(customer);
        if ("error" in found) return { result: fail(found.error), summary: "Customer not found" };
        contactId = found.contactId;
      }
      let q = db.from("rh_visit_reports").select("job_id, contact_id, report, customer_note, texted_at").eq("org_id", org.id).gte("created_at", `${since}T00:00:00Z`).order("created_at", { ascending: false }).limit(100);
      if (contactId) q = q.eq("contact_id", contactId);
      const { data: reports } = await q;
      const [{ data: jobs }, { data: contacts }] = await Promise.all([
        (reports ?? []).length ? db.from("jobs").select("id, completed_on").in("id", reports!.map((r) => r.job_id)) : Promise.resolve({ data: [] as { id: string; completed_on: string }[] }),
        (reports ?? []).length ? db.from("contacts").select("id, name, phone").in("id", [...new Set(reports!.map((r) => r.contact_id))]) : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string }[] }),
      ]);
      const out = (reports ?? []).map((r) => {
        const c = contacts?.find((x) => x.id === r.contact_id);
        const values = r.report as ReportValues;
        return {
          date: jobs?.find((j) => j.id === r.job_id)?.completed_on ?? null,
          customer: c?.name ?? (c ? formatUSPhone(c.phone) : null),
          summary: summarizeReport(fields, values, "en"),
          needs_attention: outOfRange(fields, values),
          note_to_customer: r.customer_note,
          customer_was_texted: Boolean(r.texted_at),
        };
      });
      return { result: ok({ since, reports: out }), summary: `Looked at ${out.length} visit report${out.length === 1 ? "" : "s"}` };
    }),
  );

  if (accessAllows(ctx.access, "read_write")) {
    server.registerTool(
      "log_visit_report",
      {
        title: "Log a visit",
        description: `Record that a route customer's visit is done, with what was done (${fields.filter((f) => f.type === "check").map((f) => f.key).join(", ")})${fields.some((f) => f.type === "number") ? ` and readings (${fields.filter((f) => f.type === "number").map((f) => f.key).join(", ")})` : ""}. Optionally texts the customer that the service is done (they get the text in business hours; opt-outs are respected).`,
        inputSchema: {
          customer: z.string().describe("Customer name or phone."),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD. Default today."),
          done: z.array(z.string()).optional().describe("Checklist items done, by key."),
          readings: z.record(z.string(), z.number()).optional().describe("Readings by key, e.g. {\"chlorine\": 3, \"ph\": 7.4}."),
          note_to_customer: z.string().max(500).optional(),
          text_customer: z.boolean().optional().describe("Text the customer that their service is done. Default false."),
        },
      },
      logged(
        "log_visit_report",
        async (args: { customer: string; date?: string; done?: string[]; readings?: Record<string, number>; note_to_customer?: string; text_customer?: boolean }) => {
          const found = await findCustomer(args.customer);
          if ("error" in found) return { result: fail(found.error), summary: "Customer not found" };
          const form = new Map<string, unknown>();
          for (const k of args.done ?? []) form.set(k.toLowerCase(), "on");
          for (const [k, v] of Object.entries(args.readings ?? {})) form.set(k.toLowerCase(), String(v));
          const unknown = [...form.keys()].filter((k) => !fields.some((f) => f.key === k));
          if (unknown.length) return { result: fail(`Unknown items: ${unknown.join(", ")}. Use: ${fields.map((f) => f.key).join(", ")}.`), summary: "Unknown checklist items" };
          const values: ReportValues = {};
          for (const f of fields) {
            const v = form.get(f.key);
            if (v === undefined) continue;
            if (f.type === "check") values[f.key] = true;
            else if (f.type === "number") {
              const n = Number(v);
              if (!Number.isFinite(n) || n < f.min || n > f.max) return { result: fail(`${f.label} should be between ${f.min} and ${f.max}.`), summary: "Reading out of range" };
              values[f.key] = n;
            }
          }
          const result = await saveVisitReport(db, org, {
            recurringServiceId: found.serviceId,
            date: args.date ?? localDateString(new Date(), org.timezone),
            values,
            customerNote: args.note_to_customer?.trim() || null,
            privateNote: null,
            textCustomer: Boolean(args.text_customer),
            photos: [],
            userId: ctx.userId,
          });
          if (!result.ok) return { result: fail(result.error), summary: "Couldn't save the visit" };
          return {
            result: ok({ saved: true, customer: found.name, needs_attention: result.warnings, customer_text: result.texted }),
            summary: `Logged ${found.name}'s visit${result.texted !== "no" ? " and texted them" : ""}`,
          };
        },
      ),
    );
  }

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
