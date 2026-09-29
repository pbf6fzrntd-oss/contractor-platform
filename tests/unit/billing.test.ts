import { describe, expect, it } from "vitest";
import { mapStripeStatus, planForPrice } from "@/lib/billing/rules";
import { isBillingActive } from "@/lib/entitlements";

describe("billing rules", () => {
  it("maps Stripe statuses to ours", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeStatus("paused")).toBe("unpaid");
    expect(mapStripeStatus("something_new")).toBe("incomplete");
  });

  it("finds our plan from the Stripe price", () => {
    const plans = [
      { id: "core", stripe_price_id: "price_core" },
      { id: "pro", stripe_price_id: "price_pro" },
      { id: "pilot", stripe_price_id: null },
    ];
    expect(planForPrice(plans, "price_pro")).toBe("pro");
    expect(planForPrice(plans, "price_unknown")).toBeNull();
    expect(planForPrice(plans, null)).toBeNull();
  });

  it("keeps texting on for invoiced pilots, trials, active and retrying payments; stops otherwise", () => {
    for (const s of ["manual", "trialing", "active", "past_due"]) expect(isBillingActive(s), s).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete", null]) expect(isBillingActive(s), String(s)).toBe(false);
  });
});
