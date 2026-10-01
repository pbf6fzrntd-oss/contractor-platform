import { describe, expect, it, vi } from "vitest";
import { validateDemoDeployment } from "@/lib/deployment";
import { serverEnv } from "@/lib/env";
import { getProvider } from "@/lib/messaging/provider";

const valid = { DEPLOYMENT_MODE: "demo", DEMO_MODE: "on", SMS_PROVIDER: "simulator", FILE_STORAGE: "supabase", NEXT_PUBLIC_SITE_URL: "https://demo.example.com", NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "example-public-key", SUPABASE_SECRET_KEY: "example-secret-key", CRON_SECRET: "a".repeat(40) };
describe("hosted demo isolation", () => {
  it("accepts a configured demo and preserves ordinary deployments", () => {
    expect(validateDemoDeployment(valid)).toEqual([]);
    expect(validateDemoDeployment({})).toEqual([]);
  });
  it.each(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"])("rejects live credential %s without leaking its value", key => {
    const errors = validateDemoDeployment({ ...valid, [key]: "confidential" });
    expect(errors.join()).toContain(key);
    expect(errors.join()).not.toContain("confidential");
  });
  it("rejects volatile storage, insecure URLs and missing credentials", () => {
    expect(validateDemoDeployment({ ...valid, FILE_STORAGE: "local", NEXT_PUBLIC_SITE_URL: "http://demo.example.com", SUPABASE_SECRET_KEY: "", CRON_SECRET: "short" })).toHaveLength(4);
  });
  it("forces simulator and disables billing even after a bad runtime configuration", () => {
    vi.stubEnv("DEPLOYMENT_MODE", "demo");
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_example");
    try {
      expect(getProvider({ provider: "twilio" }).name).toBe("simulator");
      expect(serverEnv.stripeSecretKey).toBe("");
    } finally { vi.unstubAllEnvs(); }
  });
});
