import { describe, expect, it } from "vitest";
import { addComplianceFooter, automatedSendWindow, checkSendPolicy } from "@/lib/automation/compliance";
import { shouldTextBackMissedCall } from "@/lib/automation/missed-call";
import { checkSendingGate } from "@/lib/messaging/gate";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const subscribed = { opted_out_at: null, marketing_consent_at: null };
const optedOut = { opted_out_at: "2026-09-01T00:00:00Z", marketing_consent_at: null };
const marketingOk = { opted_out_at: null, marketing_consent_at: "2026-09-01T00:00:00Z" };

describe("who can receive what", () => {
  it("blocks every normal text to someone who opted out", () => {
    for (const category of ["conversational", "informational", "marketing"] as const) {
      expect(checkSendPolicy(category, optedOut)).toEqual({ allowed: false, reason: "opted_out" });
    }
  });

  it("still sends the one opt-out confirmation and HELP replies", () => {
    expect(checkSendPolicy("conversational", optedOut, "opt_out_confirmation").allowed).toBe(true);
    expect(checkSendPolicy("conversational", optedOut, "help_reply").allowed).toBe(true);
  });

  it("requires recorded consent for marketing, but not for updates", () => {
    expect(checkSendPolicy("marketing", subscribed)).toEqual({ allowed: false, reason: "no_marketing_consent" });
    expect(checkSendPolicy("marketing", marketingOk).allowed).toBe(true);
    expect(checkSendPolicy("informational", subscribed).allowed).toBe(true);
  });
});

describe("opt-out footer", () => {
  it("is added to the first text a contact gets", () => {
    expect(addComplianceFooter("Hi", { isFirstMessage: true, category: "conversational", language: "en" })).toBe(
      "Hi\nReply STOP to opt out.",
    );
  });
  it("is added to every marketing text, in the contact's language", () => {
    expect(addComplianceFooter("Hola", { isFirstMessage: false, category: "marketing", language: "es" })).toBe(
      "Hola\nResponda STOP para no recibir más mensajes.",
    );
  });
  it("is not repeated on later updates or when the text already says STOP", () => {
    expect(addComplianceFooter("Hi", { isFirstMessage: false, category: "informational", language: "en" })).toBe("Hi");
    expect(addComplianceFooter("Reply STOP to end", { isFirstMessage: true, category: "marketing", language: "en" })).toBe(
      "Reply STOP to end",
    );
  });
});

describe("sending hours", () => {
  it("limits marketing to 8am-8pm and updates to business hours; replies anytime", () => {
    expect(automatedSendWindow("marketing", DEFAULT_SETTINGS)).toEqual({ start: 8, end: 20 });
    expect(automatedSendWindow("informational", DEFAULT_SETTINGS)).toEqual({ start: 9, end: 19 });
    expect(automatedSendWindow("conversational", DEFAULT_SETTINGS)).toBeNull();
  });
});

describe("business-level sending gate", () => {
  const ok = { hasPhoneNumber: true, textingApproved: true, subscriptionStatus: "manual", monthlyLimit: 100, sentThisMonth: 5 };
  it("allows a business in good standing", () => expect(checkSendingGate(ok)).toBeNull());
  it("explains each blocker", () => {
    expect(checkSendingGate({ ...ok, hasPhoneNumber: false })).toBe("no_business_number");
    expect(checkSendingGate({ ...ok, textingApproved: false })).toBe("texting_not_approved");
    expect(checkSendingGate({ ...ok, subscriptionStatus: "canceled" })).toBe("billing_inactive");
    expect(checkSendingGate({ ...ok, sentThisMonth: 100 })).toBe("monthly_limit_reached");
  });
  it("keeps working while a card payment is being retried", () => {
    expect(checkSendingGate({ ...ok, subscriptionStatus: "past_due" })).toBeNull();
  });
});

describe("missed-call text-back guardrails", () => {
  const now = new Date("2026-09-29T15:00:00Z");
  const contact = { do_not_autotext: false, opted_out_at: null };
  const base = { enabled: true, contact, lastMessageAt: null, now };

  it("texts a brand-new caller", () => expect(shouldTextBackMissedCall(base)).toEqual({ send: true }));
  it("respects the on/off setting", () =>
    expect(shouldTextBackMissedCall({ ...base, enabled: false })).toEqual({ send: false, reason: "disabled" }));
  it("skips suppliers/family marked do-not-auto-text", () =>
    expect(shouldTextBackMissedCall({ ...base, contact: { ...contact, do_not_autotext: true } }).send).toBe(false));
  it("skips people who opted out", () =>
    expect(shouldTextBackMissedCall({ ...base, contact: { ...contact, opted_out_at: "2026-01-01" } })).toEqual({
      send: false,
      reason: "opted_out",
    }));
  it("doesn't text twice within 12 hours (or mid-conversation)", () => {
    const elevenHoursAgo = new Date(now.getTime() - 11 * 3_600_000);
    const thirteenHoursAgo = new Date(now.getTime() - 13 * 3_600_000);
    expect(shouldTextBackMissedCall({ ...base, lastMessageAt: elevenHoursAgo })).toEqual({
      send: false,
      reason: "recent_conversation",
    });
    expect(shouldTextBackMissedCall({ ...base, lastMessageAt: thirteenHoursAgo }).send).toBe(true);
  });
});
