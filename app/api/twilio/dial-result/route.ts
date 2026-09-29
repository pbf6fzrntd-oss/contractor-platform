import { createAdminClient } from "@/lib/supabase/admin";
import { findBusinessLine, handleMissedCall, isCallAccepted, markCallAnswered } from "@/lib/services/inbound";
import { missedCallGreeting, say, twiml } from "@/lib/twilio/twiml";
import { forbidden, readTwilioWebhook, runAfterResponse } from "@/lib/twilio/webhook";

/** After ringing the owner: answered (and accepted) or missed? */
export async function POST(request: Request) {
  const params = await readTwilioWebhook(request);
  if (!params) return forbidden();

  const db = createAdminClient();
  if (params.DialCallStatus === "completed" && (await isCallAccepted(db, params.CallSid))) {
    await markCallAnswered(db, params.CallSid);
    return twiml("<Hangup/>");
  }

  const line = await findBusinessLine(db, params.To);
  if (!line) return twiml("<Hangup/>");
  const language = line.org.default_language === "es" ? "es" : "en";
  runAfterResponse(() => handleMissedCall(db, line, { from: params.From, callSid: params.CallSid }));
  return twiml(`${say(missedCallGreeting(line.org.name, language), language)}<Hangup/>`);
}
