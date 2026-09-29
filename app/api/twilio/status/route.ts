import { createAdminClient } from "@/lib/supabase/admin";
import { handleStatusCallback } from "@/lib/services/inbound";
import { forbidden, readTwilioWebhook } from "@/lib/twilio/webhook";

/** Delivery updates for texts we sent. */
export async function POST(request: Request) {
  const params = await readTwilioWebhook(request);
  if (!params) return forbidden();
  await handleStatusCallback(createAdminClient(), {
    messageSid: params.MessageSid,
    status: params.MessageStatus,
    errorCode: params.ErrorCode ?? null,
  });
  return new Response(null, { status: 204 });
}
