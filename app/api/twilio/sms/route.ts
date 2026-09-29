import { createAdminClient } from "@/lib/supabase/admin";
import { findBusinessLine, handleInboundSms } from "@/lib/services/inbound";
import { twiml } from "@/lib/twilio/twiml";
import { forbidden, readTwilioWebhook } from "@/lib/twilio/webhook";

/** A text arrived at a business number. */
export async function POST(request: Request) {
  const params = await readTwilioWebhook(request);
  if (!params) return forbidden();

  const db = createAdminClient();
  const line = await findBusinessLine(db, params.To);
  if (line) {
    await handleInboundSms(db, line, { from: params.From, body: params.Body ?? "", messageSid: params.MessageSid });
  }
  return twiml(""); // we reply (if needed) through the API, not here
}
