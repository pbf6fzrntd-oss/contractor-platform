import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * A private link a customer uses to see, reschedule or cancel ONE booking.
 * It's the booking id plus a signature, so it can't be guessed or changed to
 * reach someone else's booking. It only shows that booking's time and service.
 */
function signature(bookingId: string): string {
  return createHmac("sha256", serverEnv.fileSigningSecret).update(`manage-booking|${bookingId}`).digest("base64url").slice(0, 22);
}

export function manageToken(bookingId: string): string {
  return `${bookingId.replace(/-/g, "")}${signature(bookingId)}`;
}

/** The booking id inside a valid token, or null. */
export function bookingIdFromToken(token: string): string | null {
  const m = /^([0-9a-f]{32})([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const id = m[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const expected = Buffer.from(signature(id));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export function manageUrl(bookingId: string): string {
  return `${publicEnv.siteUrl}/m/${manageToken(bookingId)}`;
}
