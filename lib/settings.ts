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
