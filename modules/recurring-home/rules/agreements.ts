/**
 * Service agreements (pure rules): quarterly pest plans, termite bonds,
 * mosquito and pool seasons, cleaning plans. Dates are YYYY-MM-DD in the
 * business's time zone. No database or texting here.
 */

export const AGREEMENT_KINDS = ["service_plan", "termite_bond", "mosquito_season", "pool_season", "cleaning_plan", "other"] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

export const BILLING = ["per_visit", "monthly", "quarterly", "yearly", "one_time"] as const;
export type Billing = (typeof BILLING)[number];

export const BILLING_LABEL: Record<Billing, string> = {
  per_visit: "per visit",
  monthly: "a month",
  quarterly: "a quarter",
  yearly: "a year",
  one_time: "one time",
};

export type Agreement = {
  status: string;
  starts_on: string;
  ends_on: string | null;
  term_months: number;
  auto_renew: boolean;
  renewal_notice_days: number;
  renewal_notice_for: string | null;
  price_cents: number | null;
  billing: string;
};

export type AgreementPreset = { name: string; kind: AgreementKind; billing: Billing; termMonths: number; noticeDays: number; autoRenew: boolean };

/** Quick picks for the "new agreement" form, per industry. */
export function agreementPresets(industry: string | null): AgreementPreset[] {
  switch (industry) {
    case "pest_control":
      return [
        { name: "Quarterly pest control plan", kind: "service_plan", billing: "quarterly", termMonths: 12, noticeDays: 30, autoRenew: true },
        { name: "Termite bond", kind: "termite_bond", billing: "yearly", termMonths: 12, noticeDays: 45, autoRenew: true },
        { name: "Mosquito season (Apr–Oct)", kind: "mosquito_season", billing: "monthly", termMonths: 7, noticeDays: 21, autoRenew: false },
      ];
    case "pool_service":
      return [
        { name: "Weekly pool service", kind: "service_plan", billing: "monthly", termMonths: 12, noticeDays: 30, autoRenew: true },
        { name: "Pool season (opening to closing)", kind: "pool_season", billing: "monthly", termMonths: 7, noticeDays: 21, autoRenew: false },
      ];
    case "house_cleaning":
      return [
        { name: "Recurring cleaning plan", kind: "cleaning_plan", billing: "per_visit", termMonths: 12, noticeDays: 14, autoRenew: true },
        { name: "Vacation rental turnover contract", kind: "cleaning_plan", billing: "per_visit", termMonths: 12, noticeDays: 30, autoRenew: true },
      ];
    case "lawn_care":
    case "landscaping":
      return [
        { name: "Mosquito season add-on (Apr–Oct)", kind: "mosquito_season", billing: "monthly", termMonths: 7, noticeDays: 21, autoRenew: false },
        { name: "Yearly lawn service plan", kind: "service_plan", billing: "monthly", termMonths: 12, noticeDays: 30, autoRenew: true },
      ];
    default:
      return [{ name: "Service plan", kind: "service_plan", billing: "monthly", termMonths: 12, noticeDays: 30, autoRenew: true }];
  }
}

/** Adds whole months, keeping the day (or the month's last day: Jan 31 + 1 month = Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

export type Standing = "ongoing" | "active" | "renewing_soon" | "overdue" | "ended" | "canceled";

/** Where an agreement stands today (for badges and lists). */
export function agreementStanding(a: Agreement, today: string): Standing {
  if (a.status === "canceled") return "canceled";
  if (a.status === "ended") return "ended";
  if (!a.ends_on) return "ongoing";
  const days = daysUntil(a.ends_on, today);
  if (days < 0) return "overdue";
  return days <= Math.max(a.renewal_notice_days, 30) ? "renewing_soon" : "active";
}

/** Should the customer get their renewal reminder today? Once per end date. */
export function renewalReminderDue(a: Agreement, today: string): boolean {
  if (a.status !== "active" || !a.ends_on || a.renewal_notice_days <= 0) return false;
  if (a.renewal_notice_for === a.ends_on) return false;
  const days = daysUntil(a.ends_on, today);
  return days >= 0 && days <= a.renewal_notice_days;
}

/**
 * What happens after the end date passes: auto-renewing agreements roll
 * forward by their term (as many terms as needed); the rest end.
 */
export function afterEndDate(a: Agreement, today: string): { action: "none" } | { action: "renew"; ends_on: string } | { action: "end" } {
  if (a.status !== "active" || !a.ends_on || a.ends_on >= today) return { action: "none" };
  if (!a.auto_renew) return { action: "end" };
  let end = a.ends_on;
  for (let i = 0; i < 20 && end < today; i++) end = addMonths(end, a.term_months);
  return { action: "renew", ends_on: end };
}

const dayAfter = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** The end date of a term that starts on `start` (Oct 1 + 12 months → Sep 30). */
export function termEnd(start: string, termMonths: number): string {
  return dayBefore(addMonths(start, termMonths));
}

/** "Renew now": the next term starts the day after the current end (or today if it already ended or has no end). */
export function nextTerm(a: Pick<Agreement, "ends_on" | "term_months">, today: string): { starts_on: string; ends_on: string } {
  const start = a.ends_on && a.ends_on >= today ? dayAfter(a.ends_on) : today;
  return { starts_on: start, ends_on: termEnd(start, a.term_months) };
}

const PER_YEAR: Partial<Record<Billing, number>> = { monthly: 12, quarterly: 4, yearly: 1, one_time: 1 };

/** About how much an agreement is worth in a year (null for per-visit pricing without a visit count). */
export function yearlyValueCents(a: Pick<Agreement, "price_cents" | "billing">, visitsPerYear?: number | null): number | null {
  if (a.price_cents == null) return null;
  if (a.billing === "per_visit") return visitsPerYear ? a.price_cents * visitsPerYear : null;
  const n = PER_YEAR[a.billing as Billing];
  return n ? a.price_cents * n : null;
}

/** Visits a year for a recurring frequency. */
export function visitsPerYear(frequency: string | null | undefined): number | null {
  return frequency === "weekly" ? 52 : frequency === "biweekly" ? 26 : frequency === "every_4_weeks" ? 13 : null;
}
