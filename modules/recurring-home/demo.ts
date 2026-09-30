import "server-only";
import type { Json } from "@/lib/database.types";
import type { AdminClient } from "@/lib/supabase/admin";
import { addDays, localDateString } from "@/lib/time";
import { agreementPresets, termEnd } from "./rules/agreements";
import { renewalReminderText, formatDay } from "./rules/messages";
import { reportFields, serviceCompleteText, summarizeReport, type ReportValues } from "./rules/visit-report";

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * "Try it live" demo records for a cleaning / pest / pool business: an
 * agreement for most route customers (a few renewing soon, one reminder
 * already sent), a termite bond for some pest customers, and visit reports
 * with "service complete" texts for the last two weeks of visits.
 */
export async function seedRecurringHomeDemo(db: AdminClient, org: { id: string; name: string; industry: string | null; timezone: string }, now: Date): Promise<void> {
  const today = localDateString(now, org.timezone);
  const [{ data: services }, { data: contacts }, { data: jobs }] = await Promise.all([
    db.from("recurring_services").select("id, contact_id, service_type, status, price_cents").eq("org_id", org.id),
    db.from("contacts").select("id, name, preferred_language").eq("org_id", org.id),
    db.from("jobs").select("id, contact_id, recurring_service_id, completed_on, completed_at").eq("org_id", org.id).not("recurring_service_id", "is", null).gte("completed_on", addDays(today, -14)),
  ]);
  const active = (services ?? []).filter((s) => s.status !== "canceled");
  const presets = agreementPresets(org.industry);
  const lang = (contactId: string) => (contacts?.find((c) => c.id === contactId)?.preferred_language === "es" ? "es" : "en");

  // Agreements
  const agreements: Record<string, unknown>[] = [];
  const reminders: Record<string, unknown>[] = [];
  active.forEach((s, i) => {
    if (i % 5 === 4) return; // not everyone is on a plan
    const p = presets[0];
    // A few renew in the next few weeks; one already got its reminder.
    const endsSoon = i < 3;
    const ends = endsSoon ? addDays(today, [9, 17, 26][i]) : addDays(today, 40 + Math.floor(Math.random() * 280));
    const start = addDays(ends, -Math.round(p.termMonths * 30.4) + 1);
    const noticeSent = i === 0 ? ends : null;
    agreements.push({
      org_id: org.id,
      contact_id: s.contact_id,
      recurring_service_id: s.id,
      name: p.name,
      kind: p.kind,
      billing: p.billing,
      price_cents: p.billing === "per_visit" ? s.price_cents : p.billing === "monthly" ? (s.price_cents ?? 5000) * 4 : p.billing === "quarterly" ? (s.price_cents ?? 5000) * 2 + 1900 : s.price_cents,
      starts_on: start,
      ends_on: ends,
      term_months: p.termMonths,
      auto_renew: p.autoRenew,
      renewal_notice_days: p.noticeDays,
      renewal_notice_for: noticeSent,
    });
    if (noticeSent) {
      reminders.push({
        org_id: org.id,
        contact_id: s.contact_id,
        direction: "outbound",
        body: `${renewalReminderText(lang(s.contact_id), org.name, p.name, formatDay(ends, lang(s.contact_id)), p.autoRenew)}`,
        category: "informational",
        sender_type: "automation",
        status: "delivered",
        created_at: new Date(now.getTime() - 26 * 3_600_000).toISOString(),
      });
    }
  });
  if (org.industry === "pest_control") {
    for (const s of active.slice(3, 8)) {
      const start = addDays(today, -(120 + Math.floor(Math.random() * 200)));
      agreements.push({ org_id: org.id, contact_id: s.contact_id, recurring_service_id: s.id, name: "Termite bond", kind: "termite_bond", billing: "yearly", price_cents: pick([35000, 42500, 49500, 55000]), starts_on: start, ends_on: termEnd(start, 12), term_months: 12, auto_renew: true, renewal_notice_days: 45 });
    }
  }
  if (agreements.length) await db.from("rh_agreements").insert(agreements as never);
  if (reminders.length) await db.from("messages").insert(reminders as never);

  // Visit reports for the last two weeks of visits
  const fields = reportFields(org.industry);
  const reports: Record<string, unknown>[] = [];
  const texts: Record<string, unknown>[] = [];
  (jobs ?? []).forEach((j, i) => {
    const values: ReportValues = {};
    for (const f of fields) {
      if (f.type === "check") {
        if (Math.random() < 0.8) values[f.key] = true;
      } else if (f.type === "number") {
        // Mostly healthy readings; the occasional one needs attention.
        const [lo, hi] = f.ideal;
        const v = i === 1 ? hi + f.step * 4 : lo + Math.random() * (hi - lo);
        values[f.key] = Math.round(v * 10) / 10;
      } else {
        values[f.key] = Math.random() < 0.7 ? f.options[0].value : f.options[1].value;
      }
    }
    const texted = i % 3 !== 2;
    const service = active.find((s) => s.id === j.recurring_service_id);
    const note = i % 4 === 0 ? pick(["Gate was left open, we closed it", "Dog was out, rescheduled the backyard for next visit", "Everything looks great"]) : null;
    reports.push({
      org_id: org.id,
      job_id: j.id,
      contact_id: j.contact_id,
      recurring_service_id: j.recurring_service_id,
      report: values as Json,
      customer_note: note,
      private_note: i % 5 === 0 ? "Side gate latch is broken, lift and push" : null,
      text_customer: texted,
      texted_at: texted ? j.completed_at : null,
    });
    if (texted && service) {
      texts.push({
        org_id: org.id,
        contact_id: j.contact_id,
        direction: "outbound",
        body: serviceCompleteText(lang(j.contact_id), org.name, service.service_type, summarizeReport(fields, values, lang(j.contact_id)), note),
        category: "informational",
        sender_type: "automation",
        status: "delivered",
        created_at: new Date(Date.parse(j.completed_at) + 10 * 60_000).toISOString(),
      });
      if (i % 4 === 1) texts.push({ org_id: org.id, contact_id: j.contact_id, direction: "inbound", body: lang(j.contact_id) === "es" ? "¡Gracias!" : pick(["Thank you!", "Thanks, looks great", "👍"]), sender_type: "contact", status: "received", created_at: new Date(Date.parse(j.completed_at) + 50 * 60_000).toISOString() });
    }
  });
  if (reports.length) await db.from("rh_visit_reports").insert(reports as never);
  if (texts.length) await db.from("messages").insert(texts as never);
}
