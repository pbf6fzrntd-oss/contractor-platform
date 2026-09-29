import "server-only";
import { publicEnv } from "@/lib/env-public";

/**
 * Server-only settings from environment variables (.env.local locally,
 * Project Settings > Environment Variables on Vercel). See .env.example.
 * Secrets are never written in code.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export { publicEnv };

export const serverEnv = {
  /** Supabase secret key (sb_secret_...). Server only: bypasses row-level security. */
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  /** "simulator" (default: nothing real is sent) or "twilio". */
  get smsProvider(): "simulator" | "twilio" {
    return process.env.SMS_PROVIDER === "twilio" ? "twilio" : "simulator";
  },
  get twilioAccountSid() {
    return required("TWILIO_ACCOUNT_SID");
  },
  get twilioAuthToken() {
    return required("TWILIO_AUTH_TOKEN");
  },
  /** Area code for new business numbers. */
  get defaultAreaCode() {
    return process.env.DEFAULT_AREA_CODE ?? "843";
  },
  /**
   * Allow real texts before carrier (A2P) registration is approved. Only
   * useful with a Twilio trial account texting your own verified numbers.
   */
  get allowUnregisteredTexting() {
    return process.env.ALLOW_UNREGISTERED_TEXTING === "true";
  },
  /** Secret the scheduler must send to /api/cron/dispatch. */
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  /** Comma-separated emails of platform admins (you), who can see /admin. */
  get platformAdminEmails(): string[] {
    return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY ?? "";
  },
  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET ?? "";
  },
};
