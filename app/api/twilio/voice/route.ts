import { createAdminClient } from "@/lib/supabase/admin";
import { findBusinessLine, handleMissedCall, recordIncomingCall } from "@/lib/services/inbound";
import { escapeXml, missedCallGreeting, say, twiml } from "@/lib/twilio/twiml";
import { forbidden, readTwilioWebhook, runAfterResponse, webhookUrl } from "@/lib/twilio/webhook";

/**
 * Someone called a business number.
 * - "Keep your number" setup: the call only reaches us because the owner
 *   didn't answer, so it's a missed call right away.
 * - "New number" setup: ring the owner's cell first (with "press 1 to accept"
 *   so their voicemail doesn't count as answering).
 */
export async function POST(request: Request) {
  const params = await readTwilioWebhook(request);
  if (!params) return forbidden();

  const db = createAdminClient();
  const line = await findBusinessLine(db, params.To);
  if (!line) return twiml(`${say("Sorry, this number is not in service.")}<Hangup/>`);

  const language = line.org.default_language === "es" ? "es" : "en";

  if (line.phone.setup_mode === "new_number" && line.phone.forward_to) {
    await recordIncomingCall(db, line, params.From, params.CallSid);
    return twiml(
      `<Dial timeout="20" answerOnBridge="true" callerId="${escapeXml(line.phone.e164)}" action="${webhookUrl("dial-result")}">` +
        `<Number url="${webhookUrl("screen")}">${escapeXml(line.phone.forward_to)}</Number></Dial>`,
    );
  }

  runAfterResponse(() => handleMissedCall(db, line, { from: params.From, callSid: params.CallSid }));
  return twiml(`${say(missedCallGreeting(line.org.name, language), language)}<Hangup/>`);
}
