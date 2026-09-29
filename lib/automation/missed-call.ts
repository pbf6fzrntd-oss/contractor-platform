/**
 * Should a missed call get an automatic text back?
 * No if: the feature is off, the contact is marked "do not auto-text", they
 * opted out, or there was any text with them in the last 12 hours (someone's
 * already talking to them, or we already texted after a previous missed call).
 */
export const MISSED_CALL_COOLDOWN_HOURS = 12;

export type MissedCallDecision =
  | { send: true }
  | { send: false; reason: "disabled" | "do_not_autotext" | "opted_out" | "recent_conversation" };

export function shouldTextBackMissedCall(input: {
  enabled: boolean;
  contact: { do_not_autotext: boolean; opted_out_at: string | null };
  lastMessageAt: Date | null;
  now: Date;
}): MissedCallDecision {
  if (!input.enabled) return { send: false, reason: "disabled" };
  if (input.contact.do_not_autotext) return { send: false, reason: "do_not_autotext" };
  if (input.contact.opted_out_at) return { send: false, reason: "opted_out" };
  if (
    input.lastMessageAt &&
    input.now.getTime() - input.lastMessageAt.getTime() < MISSED_CALL_COOLDOWN_HOURS * 3_600_000
  ) {
    return { send: false, reason: "recent_conversation" };
  }
  return { send: true };
}
