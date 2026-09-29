import type { Language } from "@/lib/business-types";
import type { OrgSettings } from "@/lib/settings";
import type { MessageCategory } from "@/lib/templates/defaults";
import type { HourWindow } from "@/lib/time";

/**
 * Who may receive which kind of text, and when. Every outgoing text is
 * checked here (via lib/messaging/send.ts).
 */

export type ContactConsent = {
  opted_out_at: string | null;
  marketing_consent_at: string | null;
};

/** Special sends that are allowed even to someone who opted out. */
export type SendPurpose = "normal" | "opt_out_confirmation" | "help_reply";

export type PolicyResult = { allowed: true } | { allowed: false; reason: "opted_out" | "no_marketing_consent" };

export function checkSendPolicy(
  category: MessageCategory,
  contact: ContactConsent,
  purpose: SendPurpose = "normal",
): PolicyResult {
  if (purpose !== "normal") return { allowed: true };
  if (contact.opted_out_at) return { allowed: false, reason: "opted_out" };
  if (category === "marketing" && !contact.marketing_consent_at) {
    return { allowed: false, reason: "no_marketing_consent" };
  }
  return { allowed: true };
}

/** Marketing texts: never outside 8am–8pm local (stricter than the ~9pm legal limit). */
export const MARKETING_WINDOW: HourWindow = { start: 8, end: 20 };

/** Owner-sent service notices (rain delays): allowed 6am–9pm; warn before 7am. */
export const SERVICE_NOTICE_WINDOW: HourWindow = { start: 6, end: 21 };
export const SERVICE_NOTICE_EARLY_WARNING_HOUR = 7;

/**
 * Hours automated texts of each category may go out.
 * Conversational replies (e.g. missed-call text-back) have no limit.
 */
export function automatedSendWindow(category: MessageCategory, settings: OrgSettings): HourWindow | null {
  if (category === "marketing") return MARKETING_WINDOW;
  if (category === "informational") return { start: settings.businessHoursStart, end: settings.businessHoursEnd };
  return null;
}

const FOOTER: Record<Language, string> = {
  en: "Reply STOP to opt out.",
  es: "Responda STOP para no recibir más mensajes.",
};

/**
 * Adds opt-out instructions to the first text a contact ever gets from the
 * business and to every marketing text (unless the text already mentions STOP).
 */
export function addComplianceFooter(
  body: string,
  { isFirstMessage, category, language }: { isFirstMessage: boolean; category: MessageCategory; language: Language },
): string {
  if (!isFirstMessage && category !== "marketing") return body;
  if (/\bSTOP\b/.test(body)) return body;
  return `${body}\n${FOOTER[language]}`;
}
