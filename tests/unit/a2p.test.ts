import { describe, expect, it } from "vitest";
import { defaultOptIn, defaultUseCase, sampleMessages, validateRegistration, type RegistrationInput } from "@/lib/automation/a2p";
import { defaultTemplatesFor } from "@/lib/templates/defaults";

const good: RegistrationInput = {
  brand_type: "standard",
  legal_name: "Summerville Lawn Pros LLC",
  ein: "12-3456789",
  business_address: "100 Main St, Summerville, SC 29483",
  website: "https://summervillelawnpros.com",
  contact_name: "Dana Owner",
  contact_email: "dana@example.com",
  contact_phone: "(843) 555-1234",
  use_case_description: defaultUseCase("Summerville Lawn Pros", "recurring"),
  opt_in_description: defaultOptIn("Summerville Lawn Pros", "https://summervillelawnpros.com"),
  sample_messages: ["a", "b"],
};

describe("carrier registration", () => {
  it("accepts a complete standard registration", () => {
    expect(validateRegistration(good)).toEqual([]);
  });

  it("requires EIN and website for standard brands, but not for sole proprietors", () => {
    const missing = { ...good, ein: "123", website: "" };
    expect(validateRegistration(missing)).toHaveLength(2);
    expect(validateRegistration({ ...missing, brand_type: "sole_proprietor" })).toEqual([]);
  });

  it("builds sample messages from the business's real templates, with opt-out language", () => {
    const templates = defaultTemplatesFor("recurring");
    const samples = sampleMessages(templates.filter((t) => t.language === "en"), "Summerville Lawn Pros", null);
    expect(samples.length).toBeGreaterThanOrEqual(4);
    expect(samples[0]).toContain("Summerville Lawn Pros");
    expect(samples[0]).toMatch(/Reply STOP to opt out\.$/);
    expect(samples.some((s) => s.includes("Rain today"))).toBe(true);
  });

  it("mentions promotions in the use case only for businesses that send them", () => {
    expect(defaultUseCase("X", "recurring")).toMatch(/seasonal offers/);
    expect(defaultUseCase("X", "project")).not.toMatch(/seasonal offers/);
    expect(defaultOptIn("X", "https://x.com/")).toContain("https://x.com/sms-terms");
  });
});
