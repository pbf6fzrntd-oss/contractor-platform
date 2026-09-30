import { addDays, localDateString, zonedTimeToUtc } from "@/lib/time";

/**
 * When to send a booking's reminder: 5pm (business time) the day before.
 * No reminder if that moment has already passed (e.g. booked for tomorrow at 9pm tonight).
 */
export const REMINDER_HOUR = 17;

export function reminderSendAt(startsAtIso: string, timeZone: string, nowMs: number): Date | null {
  const startDay = localDateString(new Date(startsAtIso), timeZone);
  const at = zonedTimeToUtc(addDays(startDay, -1), REMINDER_HOUR, 0, timeZone);
  return at.getTime() > nowMs + 5 * 60_000 ? at : null;
}

/** Words a customer might text back to a reminder or a "reply YES" request. */
const CONFIRM = new Set(["C", "CONFIRM", "CONFIRMED", "YES", "Y", "YEP", "YEAH", "OK", "OKAY", "SI", "CONFIRMO", "CONFIRMAR", "CONFIRMADO", "CONFIRMADA"]);
const RESCHEDULE = new Set(["R", "RESCHEDULE", "CHANGE", "MOVE", "REPROGRAMAR", "CAMBIAR", "CAMBIO"]);

/** Classifies a short reply (already normalized to upper-case words) about a booking. */
export function classifyBookingReply(normalized: string): "confirm" | "reschedule" | null {
  const word = normalized.trim();
  if (CONFIRM.has(word)) return "confirm";
  if (RESCHEDULE.has(word)) return "reschedule";
  return null;
}

/** Should a request that's waiting for the owner be released? */
export function isApprovalExpired(createdAtIso: string, nowMs: number, holdHours: number): boolean {
  return Date.parse(createdAtIso) + holdHours * 3_600_000 <= nowMs;
}

/** Has an AI-agent booking run out of time for the customer's YES? */
export function isVerificationExpired(verifyByIso: string | null, nowMs: number): boolean {
  return verifyByIso !== null && Date.parse(verifyByIso) <= nowMs;
}
