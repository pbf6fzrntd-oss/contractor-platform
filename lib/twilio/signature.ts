import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio signs every webhook so we know the request really came from Twilio.
 * Signature = base64(HMAC-SHA1(authToken, fullUrl + each param name+value, sorted by name)).
 */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function isValidTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
