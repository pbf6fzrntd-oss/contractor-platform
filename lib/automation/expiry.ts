/**
 * Expiry rules (pure): when to warn the owner about a license or insurance
 * policy, and when to remind a customer about a pet's vaccine record.
 * Dates are YYYY-MM-DD in the business's time zone.
 */

export type CredentialAlertStage = "30" | "7" | "expired";

const RANK: Record<CredentialAlertStage, number> = { "30": 1, "7": 2, expired: 3 };

/** Whole days from `today` until `date` (negative once it's past). */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/** Which warning applies today: 30 days out, 7 days out, or expired (null = nothing yet). */
export function credentialAlertStage(expiresOn: string, today: string): CredentialAlertStage | null {
  const days = daysUntil(expiresOn, today);
  if (days < 0) return "expired";
  if (days <= 7) return "7";
  if (days <= 30) return "30";
  return null;
}

/**
 * The warning to send now, or null. Each warning is sent once per expiry date;
 * a renewed license (new date) starts over. A skipped step isn't sent late
 * (added 5 days before expiry → only the 7-day warning).
 */
export function credentialAlertDue(
  c: { expiresOn: string | null; alertStage: string | null; alertFor: string | null },
  today: string,
): CredentialAlertStage | null {
  if (!c.expiresOn) return null;
  const stage = credentialAlertStage(c.expiresOn, today);
  if (!stage) return null;
  if (c.alertFor !== c.expiresOn || !c.alertStage) return stage;
  return RANK[stage] > (RANK[c.alertStage as CredentialAlertStage] ?? 0) ? stage : null;
}

export function credentialAlertText(label: string, stage: CredentialAlertStage, expiresOn: string, today: string): string {
  const date = new Date(`${expiresOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (stage === "expired") return `Your ${label} expired on ${date}. It's hidden from your public profile until you add the new date in Settings → Licenses & insurance.`;
  const days = daysUntil(expiresOn, today);
  return `Your ${label} expires in ${days} day${days === 1 ? "" : "s"} (${date}). Renew it, then update the date in Settings → Licenses & insurance.`;
}

/** Customers are reminded this many days before a vaccine record expires. */
export const VACCINE_REMINDER_DAYS = 14;
/** ...and not about records that expired longer ago than this (old records aren't worth a text). */
export const VACCINE_REMINDER_GRACE_DAYS = 7;

/** Should the customer get a reminder about this vaccine record today? */
export function vaccineReminderDue(
  r: { expiresOn: string | null; reminderSentAt: string | null; hasNewerRecord: boolean; deleted: boolean },
  today: string,
): boolean {
  if (!r.expiresOn || r.reminderSentAt || r.hasNewerRecord || r.deleted) return false;
  const days = daysUntil(r.expiresOn, today);
  return days <= VACCINE_REMINDER_DAYS && days >= -VACCINE_REMINDER_GRACE_DAYS;
}

/** "rabies" → "rabies", "bordetella" → "bordetella (kennel cough)", Spanish when asked. */
const DOC_LABELS: Record<string, { en: string; es: string }> = {
  rabies: { en: "rabies", es: "rabia" },
  dhpp: { en: "DHPP", es: "DHPP (moquillo/parvo)" },
  bordetella: { en: "bordetella (kennel cough)", es: "bordetella (tos de las perreras)" },
  fvrcp: { en: "FVRCP", es: "FVRCP" },
  canine_influenza: { en: "canine flu", es: "influenza canina" },
  leptospirosis: { en: "leptospirosis", es: "leptospirosis" },
};

/** Vaccine types offered when adding a record (keys are stored as files.document_type). */
export const VACCINE_TYPES = Object.keys(DOC_LABELS);

export function documentLabel(type: string | null, lang: "en" | "es"): string {
  if (!type) return lang === "es" ? "vacuna" : "vaccine";
  return DOC_LABELS[type]?.[lang] ?? type.replace(/_/g, " ");
}
