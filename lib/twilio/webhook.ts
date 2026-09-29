import "server-only";
import { after } from "next/server";
import { publicEnv, serverEnv } from "@/lib/env";
import { isValidTwilioSignature } from "@/lib/twilio/signature";

/**
 * Reads a Twilio webhook and checks its signature, so nobody can fake calls
 * or texts. Returns null (and the route answers 403) if it isn't genuine.
 */
export async function readTwilioWebhook(request: Request): Promise<Record<string, string> | null> {
  if (serverEnv.smsProvider !== "twilio") return null;
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  const url = new URL(request.url);
  // Twilio signs the public address it called, not the internal one.
  const signedUrl = `${publicEnv.siteUrl}${url.pathname}${url.search}`;
  const ok = isValidTwilioSignature(
    serverEnv.twilioAuthToken,
    request.headers.get("x-twilio-signature"),
    signedUrl,
    params,
  );
  return ok ? params : null;
}

export const forbidden = () => new Response("Forbidden", { status: 403 });

export const webhookUrl = (path: string) => `${publicEnv.siteUrl}/api/twilio/${path}`;

/** Run work after answering Twilio, so the caller isn't kept waiting. */
export function runAfterResponse(task: () => Promise<unknown>) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error("Background webhook task failed", error);
    }
  });
}
