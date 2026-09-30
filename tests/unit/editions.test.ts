import { describe, expect, it } from "vitest";
import { addonChanges, addonsActive, classifyItems } from "@/lib/billing/rules";
import { bookingOn, canUse, hasFeature } from "@/lib/entitlements";
import { CORE, PILOT } from "./plans";

const plans = [
  { id: "core", stripe_price_id: "price_core" },
  { id: "pro", stripe_price_id: "price_pro" },
  { id: "executive", stripe_price_id: "price_exec" },
];
const catalog = [
  { key: "agent_ready", stripe_price_id: "price_agent" },
  { key: "pet_care", stripe_price_id: "price_pet" },
];

describe("subscriptions with add-ons", () => {
  it("separates the plan from add-ons", () => {
    const r = classifyItems(
      [
        { itemId: "si_1", priceId: "price_pro" },
        { itemId: "si_2", priceId: "price_agent" },
        { itemId: "si_3", priceId: "price_unknown" },
      ],
      plans,
      catalog,
    );
    expect(r).toEqual({ planId: "pro", addons: [{ key: "agent_ready", itemId: "si_2" }] });
  });

  it("still finds add-ons when the plan item comes second, and ignores duplicates", () => {
    const r = classifyItems(
      [
        { itemId: "a", priceId: "price_pet" },
        { itemId: "b", priceId: "price_core" },
        { itemId: "c", priceId: "price_pet" },
      ],
      plans,
      catalog,
    );
    expect(r).toEqual({ planId: "core", addons: [{ key: "pet_care", itemId: "a" }] });
  });

  it("keeps add-ons on while Stripe retries a card, and off when canceled or unpaid", () => {
    expect(addonsActive("active")).toBe(true);
    expect(addonsActive("past_due")).toBe(true);
    expect(addonsActive("canceled")).toBe(false);
    expect(addonsActive("unpaid")).toBe(false);
  });

  it("turns paid add-ons on and off without touching editions, pilots or admin grants", () => {
    const current = [
      { module: "home_services", source: "edition", enabled: true },
      { module: "agent_ready", source: "addon", enabled: true },
      { module: "pet_care", source: "admin", enabled: true },
    ];
    expect(addonChanges(current, ["agent_ready"], true)).toEqual({ enable: [], disable: [] });
    expect(addonChanges(current, [], true)).toEqual({ enable: [], disable: ["agent_ready"] });
    expect(addonChanges(current, ["agent_ready", "automotive"], true)).toEqual({ enable: ["automotive"], disable: [] });
    // Canceled subscription: paid add-ons off; the edition and admin-granted module stay.
    expect(addonChanges(current, ["agent_ready"], false)).toEqual({ enable: [], disable: ["agent_ready"] });
  });
});

describe("who can use what", () => {
  it("unlocks features from the plan or from the Agent Ready add-on", () => {
    expect(hasFeature(CORE, "booking")).toBe(false);
    expect(canUse(CORE, ["home_services"], "booking")).toBe(false);
    expect(canUse(CORE, ["home_services", "agent_ready"], "booking")).toBe(true);
    expect(canUse(CORE, ["agent_ready"], "approvals")).toBe(true);
    expect(canUse(CORE, ["agent_ready"], "team_ai")).toBe(false); // team AI needs Executive
    expect(canUse(PILOT, ["home_services"], "ai_voice")).toBe(true);
  });

  it("needs both the entitlement and the owner's switch for booking", () => {
    expect(bookingOn({ booking_enabled: true }, CORE, ["home_services"])).toBe(false);
    expect(bookingOn({ booking_enabled: false }, PILOT, ["home_services"])).toBe(false);
    expect(bookingOn({ booking_enabled: true }, PILOT, ["home_services"])).toBe(true);
    expect(bookingOn({ booking_enabled: true }, CORE, ["agent_ready"])).toBe(true);
  });
});
