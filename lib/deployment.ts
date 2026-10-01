/** A separate hosted demo uses real persistence, but no live providers. */
export function validateDemoDeployment(env: Record<string, string | undefined>): string[] {
  if (env.DEPLOYMENT_MODE !== "demo") return [];
  const errors: string[] = [];
  for (const [key, value] of Object.entries({ DEMO_MODE: "on", SMS_PROVIDER: "simulator", FILE_STORAGE: "supabase" })) {
    if (env[key] !== value) errors.push(`${key} must be ${value} for a hosted demo`);
  }
  for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    try {
      const url = new URL(env[key] || "");
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    } catch { errors.push(`${key} must be an HTTPS URL`); }
  }
  for (const key of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
    if (!env[key] || /placeholder|_xxx|change-me/i.test(env[key]!)) errors.push(`${key} must be configured`);
  }
  if ((env.CRON_SECRET || "").length < 32 || /change-me/.test(env.CRON_SECRET || "")) errors.push("CRON_SECRET must contain at least 32 characters");
  for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    if (env[key]) errors.push(`${key} must be absent from a demo deployment`);
  }
  return errors;
}
