import "server-only";
import { randomUUID } from "node:crypto";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * The phone company behind the app. "simulator" pretends to send and records
 * everything in the database (for demos and building before carrier
 * approval); "twilio" talks to Twilio's API.
 */

export type ProviderMessageStatus = "queued" | "sent" | "delivered" | "failed" | "undelivered";

export type SendSmsResult =
  | { ok: true; sid: string; status: ProviderMessageStatus }
  | { ok: false; error: string; code?: number };

export interface SmsProvider {
  name: "simulator" | "twilio";
  sendSms(input: { from: string; messagingServiceSid?: string | null; to: string; body: string }): Promise<SendSmsResult>;
  buyNumber(areaCode: string): Promise<{ e164: string; sid: string | null }>;
}

const simulator: SmsProvider = {
  name: "simulator",
  async sendSms() {
    return { ok: true, sid: `SIM${randomUUID().replace(/-/g, "")}`, status: "delivered" };
  },
  async buyNumber(areaCode) {
    // 555 numbers are reserved for fiction, so these can never reach a real phone.
    const digits = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
    return { e164: `+1${areaCode}555${digits}`, sid: null };
  },
};

function twilioAuthHeader() {
  const raw = `${serverEnv.twilioAccountSid}:${serverEnv.twilioAuthToken}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function twilioRequest(path: string, init: { method: "GET" | "POST"; form?: Record<string, string> }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${serverEnv.twilioAccountSid}${path}`;
  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: twilioAuthHeader(),
      ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form ? new URLSearchParams(init.form) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

export function mapTwilioStatus(status: string): ProviderMessageStatus {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
    case "read":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
    case "canceled":
      return "failed";
    default:
      return "queued"; // accepted, queued, sending, scheduled
  }
}

const twilio: SmsProvider = {
  name: "twilio",
  async sendSms({ from, messagingServiceSid, to, body }) {
    const form: Record<string, string> = {
      To: to,
      Body: body,
      StatusCallback: `${publicEnv.siteUrl}/api/twilio/status`,
    };
    if (messagingServiceSid) form.MessagingServiceSid = messagingServiceSid;
    else form.From = from;
    const { ok, json } = await twilioRequest("/Messages.json", { method: "POST", form });
    if (!ok) {
      return { ok: false, error: String(json.message ?? "Twilio error"), code: Number(json.code) || undefined };
    }
    return { ok: true, sid: String(json.sid), status: mapTwilioStatus(String(json.status)) };
  },
  async buyNumber(areaCode) {
    const search = await twilioRequest(
      `/AvailablePhoneNumbers/US/Local.json?AreaCode=${encodeURIComponent(areaCode)}&SmsEnabled=true&VoiceEnabled=true&PageSize=1`,
      { method: "GET" },
    );
    const available = (search.json.available_phone_numbers as { phone_number: string }[] | undefined)?.[0];
    if (!available) throw new Error(`No numbers available in area code ${areaCode}. Try another area code.`);
    const bought = await twilioRequest("/IncomingPhoneNumbers.json", {
      method: "POST",
      form: {
        PhoneNumber: available.phone_number,
        VoiceUrl: `${publicEnv.siteUrl}/api/twilio/voice`,
        VoiceMethod: "POST",
        SmsUrl: `${publicEnv.siteUrl}/api/twilio/sms`,
        SmsMethod: "POST",
      },
    });
    if (!bought.ok) throw new Error(String(bought.json.message ?? "Couldn't buy the number from Twilio."));
    return { e164: String(bought.json.phone_number), sid: String(bought.json.sid) };
  },
};

/**
 * The texting provider. A pretend (simulator) business number ALWAYS uses the
 * simulator, even when the site texts through Twilio, so demo businesses and
 * test numbers can never text a real phone.
 */
export function getProvider(phone?: { provider: string } | null): SmsProvider {
  if (phone?.provider === "simulator") return simulator;
  return serverEnv.smsProvider === "twilio" ? twilio : simulator;
}
