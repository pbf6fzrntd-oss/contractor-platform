import type { OrgSettings } from "@/lib/settings";
import { addDays, localDateString, nextTimeInWindow, zonedTimeToUtc } from "@/lib/time";

/**
 * When to send estimate follow-ups. Each one goes out N days after the
 * estimate was sent (default 2, 5 and 10), at the business's follow-up hour
 * (default 10am local), never outside business hours.
 */
export type PlannedFollowUp = { step: number; templateKey: string; sendAt: Date };

/** Only 3 follow-up templates exist; extra steps reuse the last one. */
export function followUpTemplateKey(step: number): string {
  return `estimate_followup_${Math.min(step, 3)}`;
}

export function planFollowUps(estimateSentAt: Date, settings: OrgSettings, timezone: string): PlannedFollowUp[] {
  if (!settings.followUpsEnabled) return [];
  const sentDay = localDateString(estimateSentAt, timezone);
  const window = { start: settings.businessHoursStart, end: settings.businessHoursEnd };
  return settings.followUpDays.map((days, i) => {
    const target = zonedTimeToUtc(addDays(sentDay, days), settings.followUpHour, 0, timezone);
    return { step: i + 1, templateKey: followUpTemplateKey(i + 1), sendAt: nextTimeInWindow(target, timezone, window) };
  });
}
