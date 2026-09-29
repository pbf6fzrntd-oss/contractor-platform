import { describe, expect, it } from "vitest";
import {
  customerStatus,
  selectCampaignRecipients,
  selectNoticeRecipients,
  type RecipientContact,
  type ServiceWithContact,
} from "@/lib/automation/recipients";

// Tuesday Sep 29, 2026
const TUE = "2026-09-29";

const contact = (id: string, over: Partial<RecipientContact> = {}): RecipientContact => ({
  id,
  phone: `+1843555${id.padStart(4, "0")}`,
  name: id,
  preferred_language: "en",
  opted_out_at: null,
  marketing_consent_at: null,
  ...over,
});
const service = (id: string, contactId: string, over: Partial<ServiceWithContact> = {}): ServiceWithContact => ({
  id,
  contact_id: contactId,
  service_type: "Mowing",
  frequency: "weekly",
  service_day: 2,
  start_date: "2026-09-01",
  status: "active",
  paused_until: null,
  ...over,
});

describe("rain delay / service notice recipients", () => {
  const contacts = [
    contact("1"),
    contact("2", { preferred_language: "es" }),
    contact("3", { opted_out_at: "2026-09-01" }),
    contact("4"),
    contact("5"),
    contact("6"),
    contact("7"),
  ];
  const services = [
    service("a", "1"), // weekly Tue
    service("b", "2", { frequency: "biweekly" }), // on Sep 29 (week 4 from Sep 1)
    service("c", "3"), // opted out
    service("d", "4", { frequency: "biweekly", start_date: "2026-09-08" }), // off-week
    service("e", "5", { status: "paused" }),
    service("f", "6", { service_day: 3 }), // Wednesday
    service("g", "7", { status: "canceled" }),
    service("h", "1", { service_type: "Shrubs" }), // 2nd service, same customer
  ];

  it("texts exactly the customers scheduled that day, once each, in their language", () => {
    const s = selectNoticeRecipients(services, contacts, TUE);
    expect(s.recipients.map((r) => r.contactId).sort()).toEqual(["1", "2"]);
    expect(s.recipients.find((r) => r.contactId === "1")?.serviceIds).toEqual(["a", "h"]);
    expect(s.recipients.find((r) => r.contactId === "2")?.language).toBe("es");
  });

  it("counts (but never texts) opted-out customers", () => {
    expect(selectNoticeRecipients(services, contacts, TUE).excluded.opted_out).toBe(1);
  });

  it("includes customers moved onto that day by an earlier rain delay", () => {
    const moves = [{ recurring_service_id: "f", from_date: "2026-09-30", to_date: TUE }];
    const s = selectNoticeRecipients(services, contacts, TUE, moves);
    expect(s.recipients.map((r) => r.contactId)).toContain("6");
  });

  it("doesn't text customers already moved off that day", () => {
    const moves = [{ recurring_service_id: "a", from_date: TUE, to_date: "2026-10-01" }, { recurring_service_id: "h", from_date: TUE, to_date: "2026-10-01" }];
    expect(selectNoticeRecipients(services, contacts, TUE, moves).recipients.map((r) => r.contactId)).toEqual(["2"]);
  });
});

describe("campaign recipients", () => {
  const consent = "2026-03-01";
  const contacts = [
    contact("1", { marketing_consent_at: consent }), // active, consent
    contact("2"), // active, NO consent
    contact("3", { marketing_consent_at: consent, opted_out_at: "2026-09-01" }), // opted out
    contact("4", { marketing_consent_at: consent }), // past customer
    contact("5", { marketing_consent_at: consent }), // paused = still active
    contact("6", { marketing_consent_at: consent }), // not a customer (lead only)
  ];
  const services = [
    service("a", "1"),
    service("b", "2"),
    service("c", "3"),
    service("d", "4", { status: "canceled" }),
    service("e", "5", { status: "paused", service_type: "Full service" }),
  ];

  it("only includes people with written marketing consent, and reports who was left out", () => {
    const s = selectCampaignRecipients(services, contacts, { statuses: ["active"] }, TUE);
    expect(s.recipients.map((r) => r.contactId).sort()).toEqual(["1", "5"]);
    expect(s.excluded).toEqual({ opted_out: 1, no_marketing_consent: 1 });
  });

  it("can target past customers (win-back) or everyone", () => {
    expect(selectCampaignRecipients(services, contacts, { statuses: ["past"] }, TUE).recipients.map((r) => r.contactId)).toEqual(["4"]);
    expect(selectCampaignRecipients(services, contacts, { statuses: ["active", "past"] }, TUE).recipients).toHaveLength(3);
  });

  it("can target a service type", () => {
    const s = selectCampaignRecipients(services, contacts, { statuses: ["active"], serviceTypes: ["full service"] }, TUE);
    expect(s.recipients.map((r) => r.contactId)).toEqual(["5"]);
  });

  it("never includes contacts who aren't customers", () => {
    const s = selectCampaignRecipients(services, contacts, { statuses: ["active", "past"] }, TUE);
    expect(s.recipients.map((r) => r.contactId)).not.toContain("6");
  });

  it("works out active vs past customers", () => {
    expect(customerStatus([service("x", "1", { status: "canceled" }), service("y", "1")], TUE)).toBe("active");
    expect(customerStatus([service("x", "1", { status: "canceled" })], TUE)).toBe("past");
    expect(customerStatus([], TUE)).toBeNull();
  });
});
