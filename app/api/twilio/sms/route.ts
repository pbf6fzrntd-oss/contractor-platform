import { mediaFromTwilio } from "@/lib/files/mms";
import { saveInboundMedia } from "@/lib/services/inbound-media";
import { createAdminClient } from "@/lib/supabase/admin";
import { findBusinessLine, handleInboundSms } from "@/lib/services/inbound";
import { twiml } from "@/lib/twilio/twiml";
import { forbidden, readTwilioWebhook, runAfterResponse } from "@/lib/twilio/webhook";

/** A text arrived at a business number. */
export async function POST(request: Request) {
  const params = await readTwilioWebhook(request);
  if (!params) return forbidden();

  const db = createAdminClient();
  const line = await findBusinessLine(db, params.To);
  if (line) {
    const media = mediaFromTwilio(params);
    const result = await handleInboundSms(db, line, { from: params.From, body: params.Body ?? "", messageSid: params.MessageSid, mediaCount: media.length });
    // Photos are downloaded after we answer Twilio, so the text shows up right away.
    if (media.length && result.messageId && result.contactId) {
      const target = { orgId: line.org.id, contactId: result.contactId, messageId: result.messageId, media };
      runAfterResponse(() => saveInboundMedia(db, target));
    }
  }
  return twiml(""); // we reply (if needed) through the API, not here
}
