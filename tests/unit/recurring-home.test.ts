import { describe, expect, it } from "vitest";
import { evaluateScheduledMessage, isModuleTable, type OutboxItem, type OutboxState } from "@/lib/automation/outbox";
import { getIndustry } from "@/lib/industries";
import { moduleAgentTools, moduleCustomerPanels, moduleDailyJobs, moduleNavEntries } from "@/lib/modules/types";
import { buildNavigation } from "@/lib/navigation";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { PILOT } from "./plans";
import {
  addMonths,
  afterEndDate,
  agreementPresets,
  agreementStanding,
  nextTerm,
  renewalReminderDue,
  termEnd,
  visitsPerYear,
  yearlyValueCents,
  type Agreement,
} from "@/modules/recurring-home/rules/agreements";
import { parseAgreementForm } from "@/modules/recurring-home/rules/form";
import { renewalReminderText } from "@/modules/recurring-home/rules/messages";

const TODAY = "2026-10-01";
const base: Agreement = {
  status: "active",
  starts_on: "2025-11-01",
  ends_on: "2026-10-31",
  term_months: 12,
  auto_renew: true,
  renewal_notice_days: 30,
  renewal_notice_for: null,
  price_cents: 12900,
  billing: "quarterly",
};

describe("Recurring Home Services: which businesses get it", () => {
  it("lets cleaning, pest control and pool companies sign up, on the recurring (route) side", () => {
    for (const key of ["house_cleaning", "pest_control", "pool_service"]) {
      const i = getIndustry(key)!;
      expect(i.status).toBe("available");
      expect(i.businessType).toBe("recurring");
      expect(i.module).toBe("recurring_home");
    }
  });

  it("adds the Agreements menu, customer page section, daily job and AI tool only when the module is on", async () => {
    const { MODULES } = await import("@/modules/registry");
    expect(moduleNavEntries(MODULES, ["home_services"])).toEqual([]);
    expect(moduleNavEntries(MODULES, ["home_services", "recurring_home"]).map((n) => n.href)).toEqual(["/agreements"]);
    expect(moduleCustomerPanels(MODULES, ["home_services"])).toHaveLength(0);
    expect(moduleCustomerPanels(MODULES, ["recurring_home"])).toHaveLength(1);
    expect(moduleAgentTools(MODULES, ["home_services"])).toHaveLength(0);
    expect(moduleAgentTools(MODULES, ["recurring_home"])).toHaveLength(1);
    // Daily jobs run for everyone but only touch businesses with the module on.
    expect(moduleDailyJobs(MODULES).map((j) => j.name)).toEqual(["recurring_home_agreement_renewals"]);
    // Menu: Agreements goes in "More" for a route business, before Settings.
    const nav = buildNavigation("recurring", PILOT, moduleNavEntries(MODULES, ["recurring_home"]));
    expect(nav.more.map((i) => i.href)).toEqual(["/campaigns", "/agreements", "/settings"]);
  });
});

describe("service agreement rules", () => {
  it("adds months without spilling into the next month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(termEnd("2026-10-01", 12)).toBe("2027-09-30");
    expect(termEnd("2026-04-01", 7)).toBe("2026-10-31"); // mosquito season Apr–Oct
  });

  it("shows where an agreement stands", () => {
    expect(agreementStanding({ ...base, ends_on: null }, TODAY)).toBe("ongoing");
    expect(agreementStanding({ ...base, ends_on: "2027-03-01" }, TODAY)).toBe("active");
    expect(agreementStanding(base, TODAY)).toBe("renewing_soon");
    expect(agreementStanding({ ...base, ends_on: "2026-09-15" }, TODAY)).toBe("overdue");
    expect(agreementStanding({ ...base, status: "canceled" }, TODAY)).toBe("canceled");
  });

  it("reminds the customer once per end date, inside the notice window", () => {
    expect(renewalReminderDue(base, TODAY)).toBe(true); // 30 days out
    expect(renewalReminderDue(base, "2026-09-30")).toBe(false); // 31 days out
    expect(renewalReminderDue({ ...base, renewal_notice_for: "2026-10-31" }, TODAY)).toBe(false);
    expect(renewalReminderDue({ ...base, renewal_notice_for: "2025-10-31" }, TODAY)).toBe(true); // last year's reminder
    expect(renewalReminderDue({ ...base, renewal_notice_days: 0 }, TODAY)).toBe(false);
    expect(renewalReminderDue({ ...base, status: "canceled" }, TODAY)).toBe(false);
    expect(renewalReminderDue({ ...base, ends_on: null }, TODAY)).toBe(false);
    expect(renewalReminderDue({ ...base, ends_on: "2026-09-30" }, TODAY)).toBe(false); // already past
  });

  it("rolls auto-renewing agreements forward and ends the rest", () => {
    expect(afterEndDate(base, TODAY)).toEqual({ action: "none" });
    expect(afterEndDate({ ...base, ends_on: "2026-09-30" }, TODAY)).toEqual({ action: "renew", ends_on: "2027-09-30" });
    expect(afterEndDate({ ...base, ends_on: "2024-09-30" }, TODAY)).toEqual({ action: "renew", ends_on: "2027-09-30" }); // two missed terms
    expect(afterEndDate({ ...base, ends_on: "2026-09-30", auto_renew: false }, TODAY)).toEqual({ action: "end" });
    expect(afterEndDate({ ...base, ends_on: "2026-09-30", status: "ended" }, TODAY)).toEqual({ action: "none" });
  });

  it("renews now from the day after the current end (or today if it already ended)", () => {
    expect(nextTerm(base, TODAY)).toEqual({ starts_on: "2026-11-01", ends_on: "2027-10-31" });
    expect(nextTerm({ ...base, ends_on: "2026-09-01" }, TODAY)).toEqual({ starts_on: TODAY, ends_on: "2027-09-30" });
  });

  it("works out what an agreement is worth in a year", () => {
    expect(yearlyValueCents(base)).toBe(51600);
    expect(yearlyValueCents({ price_cents: 5000, billing: "monthly" })).toBe(60000);
    expect(yearlyValueCents({ price_cents: 15000, billing: "per_visit" }, visitsPerYear("biweekly"))).toBe(390000);
    expect(yearlyValueCents({ price_cents: 15000, billing: "per_visit" })).toBeNull();
    expect(yearlyValueCents({ price_cents: null, billing: "yearly" })).toBeNull();
  });

  it("offers the usual plans for each trade", () => {
    expect(agreementPresets("pest_control").map((p) => p.kind)).toEqual(["service_plan", "termite_bond", "mosquito_season"]);
    expect(agreementPresets("pool_service")[1]).toMatchObject({ kind: "pool_season", autoRenew: false });
    expect(agreementPresets("house_cleaning")[0].kind).toBe("cleaning_plan");
    expect(agreementPresets("lawn_care")[0].name).toMatch(/Mosquito/); // the lawn cross-sell
    expect(agreementPresets(null)).toHaveLength(1);
  });
});

describe("agreement form", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const good = { contact_id: "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b", name: "Termite bond", kind: "termite_bond", billing: "yearly", price: "$1,200", starts_on: "2026-10-01", term_months: "12", auto_renew: "on", renewal_notice_days: "45" };

  it("reads money and fills in the end date from the term", () => {
    const r = parseAgreementForm(form(good));
    expect(r.ok && r.value).toMatchObject({ price_cents: 120000, ends_on: "2027-09-30", auto_renew: true, renewal_notice_days: 45, recurring_service_id: null });
  });

  it("gives friendly errors", () => {
    expect(parseAgreementForm(form({ ...good, name: "" }))).toMatchObject({ ok: false, error: expect.stringMatching(/Name the agreement/) });
    expect(parseAgreementForm(form({ ...good, contact_id: "" }))).toMatchObject({ ok: false, error: "Pick a customer." });
    expect(parseAgreementForm(form({ ...good, ends_on: "2026-01-01" }))).toMatchObject({ ok: false, error: expect.stringMatching(/after the start/) });
    expect(parseAgreementForm(form({ ...good, price: "lots" }))).toMatchObject({ ok: false });
    expect(parseAgreementForm(form({ ...good, kind: "hacked" })).ok).toBe(false);
  });
});

describe("renewal reminder texts", () => {
  it("say renews vs ends, name the business, and leave the STOP line to the send pipeline", () => {
    const en = renewalReminderText("en", "Palmetto Pest", "Termite bond", "October 31", true);
    expect(en).toBe('Palmetto Pest: Your "Termite bond" renews on October 31. Nothing to do if you\'d like to keep it. Questions or changes? Just reply.');
    expect(renewalReminderText("en", "Palmetto Pest", "Mosquito season", "October 31", false)).toMatch(/ends on October 31\. Reply YES to renew/);
    expect(renewalReminderText("es", "Palmetto Pest", "Plan", "31 de octubre", false)).toMatch(/Responda SI para renovarlo/);
    for (const t of [en, renewalReminderText("es", "X", "Y", "Z", true)]) expect(t).not.toMatch(/STOP/);
  });
});

describe("module texts in the outbox", () => {
  const item: OutboxItem = { kind: "module_notice", category: "informational", context: { body_en: "Hi", guard: { table: "rh_agreements", id: "a1", column: "ends_on", equals: "2026-10-31" } } };
  const state: OutboxState = {
    now: new Date("2026-10-01T16:00:00Z"),
    timezone: "America/New_York",
    settings: DEFAULT_SETTINGS,
    contact: { opted_out_at: null, marketing_consent_at: null, do_not_autotext: false, review_requested_at: null },
    lead: null,
    lastInboundAt: null,
    hasReviewLink: false,
    broadcastStatus: null,
    guardOk: true,
  };

  it("sends while the condition still holds, in business hours", () => {
    expect(evaluateScheduledMessage(item, state)).toEqual({ action: "send" });
    expect(evaluateScheduledMessage(item, { ...state, now: new Date("2026-10-02T02:00:00Z") }).action).toBe("defer");
  });

  it("skips if the agreement changed, the customer opted out, or is never auto-texted", () => {
    expect(evaluateScheduledMessage(item, { ...state, guardOk: false })).toEqual({ action: "skip", reason: "no_longer_needed" });
    expect(evaluateScheduledMessage(item, { ...state, contact: { ...state.contact!, opted_out_at: "2026-09-01" } })).toEqual({ action: "skip", reason: "opted_out" });
    expect(evaluateScheduledMessage(item, { ...state, contact: { ...state.contact!, do_not_autotext: true } })).toEqual({ action: "skip", reason: "do_not_autotext" });
    expect(evaluateScheduledMessage({ ...item, context: {} }, state)).toEqual({ action: "skip", reason: "no_longer_needed" });
  });

  it("only checks module tables (never core tables like contacts)", () => {
    expect(isModuleTable("rh_agreements")).toBe(true);
    for (const t of ["contacts", "organizations", "subject_private", "rh_", "rh_agreements; drop", "RH_AGREEMENTS"]) expect(isModuleTable(t)).toBe(false);
  });
});
