import { z } from "zod";
import { AGREEMENT_KINDS, BILLING, termEnd } from "./agreements";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const schema = z
  .object({
    contact_id: z.string().uuid("Pick a customer."),
    recurring_service_id: z.string().uuid().nullable(),
    name: z.string().trim().min(1, "Name the agreement, e.g. Quarterly pest control plan.").max(100),
    kind: z.enum(AGREEMENT_KINDS),
    billing: z.enum(BILLING),
    price_cents: z.number().int().min(0).max(10_000_000).nullable(),
    starts_on: date,
    ends_on: date.nullable(),
    term_months: z.number().int().min(1, "A term is 1 to 60 months.").max(60, "A term is 1 to 60 months."),
    auto_renew: z.boolean(),
    renewal_notice_days: z.number().int().min(0).max(120, "Reminders can go out up to 120 days early."),
    notes: z.string().trim().max(2000).nullable(),
  })
  .refine((v) => !v.ends_on || v.ends_on >= v.starts_on, { message: "The end date must be after the start date.", path: ["ends_on"] });

export type AgreementInput = z.infer<typeof schema>;

/** Reads the agreement form. Money like "$1,200" is accepted; a blank end date means "one term from the start". */
export function parseAgreementForm(form: FormData, noEndDate = false): { ok: true; value: AgreementInput } | { ok: false; error: string } {
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const dollars = text("price").replace(/[$,\s]/g, "");
  const price = dollars ? Math.round(Number(dollars) * 100) : null;
  if (dollars && (!Number.isFinite(price!) || price! < 0)) return { ok: false, error: "Enter the price like 129 or $1,200." };
  const term = Number(text("term_months") || 12);
  const starts = text("starts_on");
  const parsed = schema.safeParse({
    contact_id: text("contact_id"),
    recurring_service_id: text("recurring_service_id") || null,
    name: text("name"),
    kind: text("kind") || "service_plan",
    billing: text("billing") || "per_visit",
    price_cents: price,
    starts_on: starts,
    ends_on: noEndDate || form.get("no_end") === "on" ? null : text("ends_on") || (/^\d{4}-\d{2}-\d{2}$/.test(starts) && Number.isInteger(term) && term > 0 ? termEnd(starts, term) : null),
    term_months: term,
    auto_renew: form.get("auto_renew") === "on",
    renewal_notice_days: Number(text("renewal_notice_days") || 30),
    notes: text("notes") || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return { ok: true, value: parsed.data };
}
