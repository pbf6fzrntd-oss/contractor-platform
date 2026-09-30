import { z } from "zod";
import type { Json } from "@/lib/database.types";
import type { OpenHours } from "@/lib/booking/types";

/** A business's booking settings (organizations.booking_settings). Missing values get these defaults. */
const schema = z.object({
  /** Days open for bookings, 0 = Sunday. */
  openDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  openHour: z.number().int().min(0).max(23).default(8),
  closeHour: z.number().int().min(1).max(24).default(17),
  /** Arrival windows: length and how many visits per window. */
  windowMinutes: z.number().int().min(30).max(480).default(120),
  windowCapacity: z.number().int().min(1).max(50).default(2),
  /** Mobile visits: ZIP codes served (empty = anywhere). */
  serviceZips: z.array(z.string().regex(/^\d{5}$/)).default([]),
  /** Minutes between start times offered for appointments. */
  stepMinutes: z.number().int().min(15).max(120).default(30),
  /** How far ahead customers can book. */
  maxDaysAhead: z.number().int().min(1).max(365).default(60),
  /** Holidays, vacations and other days off (YYYY-MM-DD). */
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(200).default([]),
  /** Text customers a reminder the day before (with a reschedule/cancel link). */
  remindersEnabled: z.boolean().default(true),
  /** Requests waiting for the owner's OK longer than this are released. */
  approvalHoldHours: z.number().int().min(2).max(168).default(24),
  /** AI-agent bookings: minutes the customer has to reply YES. */
  agentVerifyMinutes: z.number().int().min(15).max(1440).default(120),
});

export type BookingSettings = z.infer<typeof schema>;

export function parseBookingSettings(value: Json | null | undefined): BookingSettings {
  const parsed = schema.safeParse(value ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

export function openHoursFrom(s: BookingSettings): OpenHours {
  const hours: OpenHours = {};
  if (s.closeHour <= s.openHour) return hours;
  for (const d of s.openDays) hours[d] = { open: s.openHour, close: s.closeHour };
  return hours;
}

export function validateBookingSettings(input: unknown): { settings: BookingSettings } | { error: string } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Check the booking settings: some values are out of range." };
  if (parsed.data.closeHour <= parsed.data.openHour) return { error: "Closing time must be after opening time." };
  if (!parsed.data.openDays.length) return { error: "Pick at least one day you take bookings." };
  return { settings: parsed.data };
}
