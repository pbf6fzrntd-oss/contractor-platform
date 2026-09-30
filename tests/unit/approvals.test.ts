import { describe, expect, it } from "vitest";
import {
  APPROVAL_RULES,
  DEFAULT_APPROVAL_SETTINGS,
  evaluateApproval,
  hasBehaviorWarning,
  parseApprovalSettings,
  rulesFor,
  type ApprovalSettings,
} from "@/lib/approvals/rules";
import { bookingConfirmedText, bookingDeclinedText, bookingReceivedText } from "@/lib/booking/messages";
import { summarizeSources } from "@/lib/reports/sources";

const all = (on: boolean): ApprovalSettings =>
  Object.fromEntries(Object.entries(DEFAULT_APPROVAL_SETTINGS).map(([k, v]) => [k, { ...v, on }])) as ApprovalSettings;

describe("approval rules (core)", () => {
  it("never holds bookings the owner or team make", () => {
    for (const source of ["owner", "team"] as const) {
      expect(evaluateApproval(all(true), { source, isNewCustomer: true, priceCents: 9_999_999, hoursUntilStart: 1 })).toEqual({ needsApproval: false, reasons: [] });
    }
  });

  it("by default holds anything booked from outside, but not the owner's own assistant", () => {
    const d = DEFAULT_APPROVAL_SETTINGS;
    expect(evaluateApproval(d, { source: "customer_link" })).toEqual({ needsApproval: true, reasons: ["Booked online"] });
    expect(evaluateApproval(d, { source: "outside_agent" }).reasons).toEqual(["Booked by a customer's AI agent"]);
    expect(evaluateApproval(d, { source: "voice" }).reasons).toEqual(["Booked by the phone assistant"]);
    expect(evaluateApproval(d, { source: "ai_assistant" }).needsApproval).toBe(false);
  });

  it("lets the owner auto-confirm outside bookings", () => {
    const s = { ...DEFAULT_APPROVAL_SETTINGS, outside_channels: { on: false } };
    expect(evaluateApproval(s, { source: "customer_link", isNewCustomer: true }).needsApproval).toBe(false);
  });

  it.each([
    ["own_assistant", { source: "ai_assistant" as const }, "Booked by your AI assistant"],
    ["new_customer", { source: "ai_assistant" as const, isNewCustomer: true }, "New customer"],
    ["price_over", { source: "ai_assistant" as const, priceCents: 150_000 }, "Priced over $1,000"],
    ["short_notice", { source: "ai_assistant" as const, hoursUntilStart: 5 }, "Less than 24 hours away"],
    ["outside_service_area", { source: "ai_assistant" as const, zip: "29401", serviceZips: ["29483"] }, "Outside your service area (29401)"],
  ])("%s", (key, facts, reason) => {
    const s = { ...all(false), [key]: { ...DEFAULT_APPROVAL_SETTINGS[key as keyof ApprovalSettings], on: true } };
    expect(evaluateApproval(s, facts)).toEqual({ needsApproval: true, reasons: [reason] });
  });

  it("doesn't trigger on thresholds that aren't crossed or facts that are unknown", () => {
    const s = all(true);
    const r = evaluateApproval({ ...s, outside_channels: { on: false } }, { source: "ai_assistant", priceCents: 100_000, hoursUntilStart: 48, zip: "29483", serviceZips: ["29483"], isNewCustomer: false });
    expect(r.reasons).toEqual(["Booked by your AI assistant"]);
    expect(evaluateApproval({ ...all(false), price_over: { on: true, value: 1000 } }, { source: "ai_assistant" }).needsApproval).toBe(false);
  });

  it("lists every reason that applies", () => {
    const r = evaluateApproval(DEFAULT_APPROVAL_SETTINGS, { source: "outside_agent", zip: "29401", serviceZips: ["29483"] });
    expect(r.reasons).toEqual(["Booked by a customer's AI agent", "Outside your service area (29401)"]);
  });
});

describe("approval rules for each module", () => {
  const only = (key: keyof ApprovalSettings, value?: number) => ({ ...all(false), [key]: { on: true, value: value ?? DEFAULT_APPROVAL_SETTINGS[key].value } });

  it("pet care: behavior warnings and vaccine problems", () => {
    expect(evaluateApproval(only("aggressive_pet"), { source: "customer_link", petBehaviorWarning: true }).reasons).toEqual(["Pet has a behavior warning"]);
    expect(evaluateApproval(only("aggressive_pet"), { source: "customer_link", petBehaviorWarning: false }).needsApproval).toBe(false);
    expect(evaluateApproval(only("vaccine_problem"), { source: "voice", vaccineStatus: "expiring" }).reasons).toEqual(["Vaccines expire before the visit ends"]);
    expect(evaluateApproval(only("vaccine_problem"), { source: "voice", vaccineStatus: "missing" }).reasons).toEqual(["Vaccine records missing"]);
    expect(evaluateApproval(only("vaccine_problem"), { source: "voice", vaccineStatus: "ok" }).needsApproval).toBe(false);
  });

  it("moving: long moves", () => {
    expect(evaluateApproval(only("move_distance_over", 50), { source: "outside_agent", moveDistanceMiles: 120 }).reasons).toEqual(["Move over 50 miles"]);
    expect(evaluateApproval(only("move_distance_over", 50), { source: "outside_agent", moveDistanceMiles: 12 }).needsApproval).toBe(false);
  });

  it("automotive: big repair estimates; project & quote: big quotes", () => {
    expect(evaluateApproval(only("repair_estimate_over", 1000), { source: "outside_agent", repairEstimateCents: 250_000 }).reasons).toEqual(["Repair estimate over $1,000"]);
    expect(evaluateApproval(only("quote_over", 5000), { source: "customer_link", quoteCents: 600_000 }).reasons).toEqual(["Quote over $5,000"]);
    expect(evaluateApproval(only("quote_over", 5000), { source: "customer_link", quoteCents: 400_000 }).needsApproval).toBe(false);
  });

  it("shows each business only the rules for its modules", () => {
    const keys = (m: string[]) => rulesFor(m).map((r) => r.key);
    expect(keys(["home_services"])).not.toContain("aggressive_pet");
    expect(keys(["pet_care"])).toContain("aggressive_pet");
    expect(keys(["automotive"])).toEqual(expect.arrayContaining(["repair_estimate_over", "quote_over"]));
    expect(keys(["automotive"])).not.toContain("move_distance_over");
    expect(APPROVAL_RULES.length).toBe(Object.keys(DEFAULT_APPROVAL_SETTINGS).length);
  });

  it("spots behavior warnings in notes without exposing them", () => {
    expect(hasBehaviorWarning("Bites during nail trims")).toBe(true);
    expect(hasBehaviorWarning("reactive to big dogs, needs muzzle")).toBe(true);
    expect(hasBehaviorWarning("Sweet, loves treats")).toBe(false);
    expect(hasBehaviorWarning(null)).toBe(false);
  });

  it("reads saved settings on top of defaults, ignoring junk", () => {
    const s = parseApprovalSettings({ new_customer: { on: true }, price_over: { on: true, value: 250 } });
    expect(s.new_customer.on).toBe(true);
    expect(s.price_over).toEqual({ on: true, value: 250 });
    expect(s.outside_channels.on).toBe(true);
    expect(parseApprovalSettings({ price_over: "yes" }).price_over).toEqual(DEFAULT_APPROVAL_SETTINGS.price_over);
  });
});

describe("booking texts to customers", () => {
  it("name the business, give the time, and never add their own STOP line", () => {
    for (const lang of ["en", "es"] as const) {
      for (const text of [bookingReceivedText(lang, "Rick's Roofing", "Mon, Oct 5"), bookingConfirmedText(lang, "Rick's Roofing", "Mon, Oct 5"), bookingDeclinedText(lang, "Rick's Roofing", "Mon, Oct 5")]) {
        expect(text.startsWith("Rick's Roofing:")).toBe(true);
        expect(text).toContain("Mon, Oct 5");
        expect(text).not.toMatch(/\bSTOP\b/);
      }
    }
  });
});

describe("where the work came from", () => {
  it("counts leads, wins and bookings per source, busiest first", () => {
    const rows = summarizeSources(
      [
        { source: "missed_call", stage: "won" },
        { source: "missed_call", stage: "new" },
        { source: "missed_call", stage: "contacted" },
        { source: "inbound_text", stage: "lost" },
        { source: "outside_agent", stage: "won" },
      ],
      [
        { source: "outside_agent", status: "confirmed" },
        { source: "customer_link", status: "canceled" },
        { source: "owner", status: "completed" },
      ],
    );
    expect(rows[0]).toMatchObject({ label: "Missed calls (texted back)", leads: 3, won: 1, bookings: 0 });
    expect(rows.find((r) => r.label === "Customers' AI agents")).toMatchObject({ leads: 1, won: 1, bookings: 1 });
    expect(rows.find((r) => r.label === "Online booking page")).toBeUndefined(); // only a canceled booking: nothing to show
    expect(summarizeSources([], [])).toEqual([]);
  });
});
