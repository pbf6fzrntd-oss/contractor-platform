import { z } from "zod";
import type { Json } from "@/lib/database.types";

/**
 * Automation settings stored in organizations.settings. Any missing or bad
 * value falls back to the default, so old businesses keep working when new
 * settings are added.
 */
const schema = z.object({
  missedCallTextEnabled: z.boolean().catch(true),
  followUpsEnabled: z.boolean().catch(true),
  /** Days after "estimate sent" to send each follow-up. */
  followUpDays: z
    .array(z.number().int().min(1).max(60))
    .min(1)
    .max(5)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b))
    .catch([2, 5, 10]),
  /** Local hour of day follow-ups go out. */
  followUpHour: z.number().int().min(8).max(18).catch(10),
  stopFollowUpsOnReply: z.boolean().catch(true),
  reviewsEnabled: z.boolean().catch(true),
  reviewDelayHours: z.number().int().min(0).max(72).catch(2),
  /** Recurring customers get one review request after this many visits. */
  reviewAfterVisits: z.number().int().min(1).max(20).catch(3),
  /** Automatic updates (follow-ups, reviews) only go out in these hours. */
  businessHoursStart: z.number().int().min(7).max(12).catch(9),
  businessHoursEnd: z.number().int().min(15).max(21).catch(19),
});

export type OrgSettings = z.infer<typeof schema>;

export function parseSettings(value: Json | null | undefined): OrgSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  // Every field has .catch(), so missing or bad values become defaults and this never throws.
  return schema.parse(input);
}

export const DEFAULT_SETTINGS: OrgSettings = parseSettings({});

/**
 * Applies changes to automation settings, with the same limits the settings
 * screen enforces. Returns a plain-English problem instead of saving bad values.
 */
export function applySettingsChanges(
  current: OrgSettings,
  changes: Partial<OrgSettings>,
): { settings: OrgSettings } | { error: string } {
  const next = { ...current, ...changes };
  const days = next.followUpDays;
  if (!Array.isArray(days) || days.length === 0 || days.length > 5 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 60)) {
    return { error: "Follow-up days should be up to 5 whole numbers between 1 and 60, like 2, 5, 10." };
  }
  if (!(Number.isInteger(next.followUpHour) && next.followUpHour >= 8 && next.followUpHour <= 18)) {
    return { error: "Follow-up time must be a whole hour from 8 (8am) to 18 (6pm)." };
  }
  if (!(next.businessHoursStart >= 7 && next.businessHoursStart <= 12 && next.businessHoursEnd >= 15 && next.businessHoursEnd <= 21)) {
    return { error: "Business hours must start between 7am and noon and end between 3pm and 9pm." };
  }
  if (!(Number.isInteger(next.reviewDelayHours) && next.reviewDelayHours >= 0 && next.reviewDelayHours <= 72)) {
    return { error: "Review delay must be 0–72 hours." };
  }
  if (!(Number.isInteger(next.reviewAfterVisits) && next.reviewAfterVisits >= 1 && next.reviewAfterVisits <= 20)) {
    return { error: "Visits before a review request: 1–20." };
  }
  return { settings: parseSettings(next) };
}
