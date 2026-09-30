/**
 * Photos customers text in (MMS). Pure helpers: which attachments a Twilio
 * webhook lists, and which addresses we're willing to download from.
 */

export type MediaRef = { url: string; contentType: string };

/** At most this many attachments per text are saved (Twilio allows 10). */
export const MAX_MEDIA_PER_TEXT = 10;

/** Only Twilio's own media addresses (never a link someone typed into a text). */
export function isTwilioMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "api.twilio.com" && u.port === "" && /^\/2010-04-01\/Accounts\/AC[0-9a-f]{32}\/Messages\/MM[0-9a-f]{32}\/Media\/ME[0-9a-f]{32}$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** The attachments in a Twilio incoming-text webhook (NumMedia, MediaUrl0, MediaContentType0, …). */
export function mediaFromTwilio(params: Record<string, string>): MediaRef[] {
  const count = Math.min(Number.parseInt(params.NumMedia ?? "0", 10) || 0, MAX_MEDIA_PER_TEXT);
  const out: MediaRef[] = [];
  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`];
    if (url && isTwilioMediaUrl(url)) out.push({ url, contentType: params[`MediaContentType${i}`] ?? "" });
  }
  return out;
}

/** What to show in the conversation for a photo-only text. */
export function mediaOnlyBody(count: number): string {
  return count === 1 ? "📷 Photo" : `📷 ${count} photos`;
}
