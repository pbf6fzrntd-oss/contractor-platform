import "server-only";
import type { Json, Tables } from "@/lib/database.types";
import { toOrg, type Org } from "@/lib/org";
import { formatUSPhone } from "@/lib/phone";
import { notifyOwner } from "@/lib/services/conversations";
import type { AdminClient } from "@/lib/supabase/admin";
import { localDateString } from "@/lib/time";
import { afterEndDate, renewalReminderDue } from "./rules/agreements";
import { formatDay, renewalReminderText } from "./rules/messages";

export const MODULE_ID = "recurring_home";
type AgreementRow = Tables<"rh_agreements">;

/**
 * Queues the customer's renewal reminder in the outbox. It goes out in
 * business hours, through the normal send rules (opt-outs, STOP line), and is
 * skipped if the agreement's end date changes before then.
 */
export async function queueRenewalReminder(db: AdminClient, org: Pick<Org, "id" | "name">, a: AgreementRow, now = new Date()): Promise<boolean> {
  if (!a.ends_on) return false;
  const { error } = await db.from("scheduled_messages").insert({
    org_id: org.id,
    contact_id: a.contact_id,
    kind: "module_notice",
    category: "informational",
    send_at: now.toISOString(),
    context: {
      module: MODULE_ID,
      purpose: "agreement_renewal",
      agreement_id: a.id,
      body_en: renewalReminderText("en", org.name, a.name, formatDay(a.ends_on, "en"), a.auto_renew),
      body_es: renewalReminderText("es", org.name, a.name, formatDay(a.ends_on, "es"), a.auto_renew),
      guard: { table: "rh_agreements", id: a.id, column: "ends_on", equals: a.ends_on },
    },
  });
  if (error) return false;
  await db.from("rh_agreements").update({ renewal_notice_for: a.ends_on }).eq("id", a.id);
  return true;
}

/**
 * Once a day: remind customers whose agreement is coming up for renewal,
 * roll auto-renewing agreements forward, end the rest, and tell the owner.
 */
export async function runAgreementRenewals(db: AdminClient, now: Date): Promise<Json> {
  const { data: enabled } = await db.from("org_modules").select("org_id").eq("module", MODULE_ID).eq("enabled", true);
  const orgIds = (enabled ?? []).map((r) => r.org_id);
  if (!orgIds.length) return { reminded: 0, renewed: 0, ended: 0 };
  const [{ data: agreements }, { data: orgRows }] = await Promise.all([
    db.from("rh_agreements").select("*").in("org_id", orgIds).eq("status", "active").not("ends_on", "is", null).limit(5000),
    db.from("organizations").select("*").in("id", orgIds),
  ]);
  const contactIds = [...new Set((agreements ?? []).map((a) => a.contact_id))];
  const { data: contacts } = contactIds.length ? await db.from("contacts").select("id, name, phone").in("id", contactIds) : { data: [] };
  const who = (id: string) => {
    const c = contacts?.find((x) => x.id === id);
    return c?.name ?? (c ? formatUSPhone(c.phone) : "A customer");
  };

  let reminded = 0;
  let renewed = 0;
  let ended = 0;
  const notes = new Map<string, string[]>();
  const note = (orgId: string, text: string) => notes.set(orgId, [...(notes.get(orgId) ?? []), text]);

  for (const a of agreements ?? []) {
    const orgRow = orgRows?.find((o) => o.id === a.org_id);
    if (!orgRow) continue;
    const org = toOrg(orgRow);
    const today = localDateString(now, org.timezone);

    const after = afterEndDate(a, today);
    if (after.action === "renew") {
      await db.from("rh_agreements").update({ ends_on: after.ends_on }).eq("id", a.id).eq("ends_on", a.ends_on!);
      renewed++;
      note(org.id, `${who(a.contact_id)}'s "${a.name}" renewed through ${formatDay(after.ends_on, "en")}.`);
      continue;
    }
    if (after.action === "end") {
      await db.from("rh_agreements").update({ status: "ended" }).eq("id", a.id).eq("status", "active");
      ended++;
      note(org.id, `${who(a.contact_id)}'s "${a.name}" ended (it doesn't renew on its own). Worth a call?`);
      continue;
    }
    if (renewalReminderDue(a, today) && (await queueRenewalReminder(db, org, a, now))) {
      reminded++;
      note(org.id, `${who(a.contact_id)}'s "${a.name}" ${a.auto_renew ? "renews" : "ends"} ${formatDay(a.ends_on!, "en")}. We're texting them a reminder.`);
    }
  }

  for (const [orgId, lines] of notes) {
    await notifyOwner(db, orgId, {
      kind: "system",
      body: lines.length === 1 ? lines[0] : `Service agreements: ${lines.length} updates. ${lines.slice(0, 3).join(" ")}${lines.length > 3 ? " …" : ""}`,
      link: "/agreements",
    });
  }
  return { reminded, renewed, ended };
}
