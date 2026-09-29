import { createAdminClient } from "@/lib/supabase/admin";
import { say, twiml } from "@/lib/twilio/twiml";
import { forbidden, readTwilioWebhook, webhookUrl } from "@/lib/twilio/webhook";

/** Played to the OWNER when they pick up: press 1 to take the call. Voicemail can't press 1. */
export async function POST(request: Request) {
  const params = await readTwilioWebhook(request);
  if (!params) return forbidden();

  const db = createAdminClient();
  const { data: call } = await db.from("calls").select("org_id").eq("provider_sid", params.ParentCallSid ?? "").maybeSingle();
  const { data: org } = call
    ? await db.from("organizations").select("name").eq("id", call.org_id).maybeSingle()
    : { data: null };

  return twiml(
    `<Gather numDigits="1" timeout="6" action="${webhookUrl("screen-result")}">` +
      `${say(`Call for ${org?.name ?? "your business"}. Press 1 to accept.`)}</Gather><Hangup/>`,
  );
}
