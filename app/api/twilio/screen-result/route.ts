import { createAdminClient } from "@/lib/supabase/admin";
import { markCallAccepted } from "@/lib/services/inbound";
import { twiml } from "@/lib/twilio/twiml";
import { forbidden, readTwilioWebhook } from "@/lib/twilio/webhook";

export async function POST(request: Request) {
  const params = await readTwilioWebhook(request);
  if (!params) return forbidden();
  if (params.Digits === "1" && params.ParentCallSid) {
    await markCallAccepted(createAdminClient(), params.ParentCallSid);
    return twiml(""); // connects the call
  }
  return twiml("<Hangup/>");
}
