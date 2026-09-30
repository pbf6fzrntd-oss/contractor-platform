import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeTrend, weekStart } from "@/lib/automation/trend";
import { DEMO_TRADES, tradeFor } from "@/lib/demo/content";
import { buildDemoScenario, rng } from "@/lib/demo/scenario";
import { getIndustry } from "@/lib/industries";
import { getProvider } from "@/lib/messaging/provider";
import { findUnknownVariables } from "@/lib/templates/render";

const NOW = new Date("2026-09-30T15:00:00Z"); // Wednesday 11am in Charleston

describe("demo businesses: the story", () => {
  it("has wording for every trade businesses can pick", () => {
    for (const key of DEMO_TRADES) {
      expect(getIndustry(key)?.status, key).toBe("available");
      const t = tradeFor(key);
      expect(t.asks.length).toBeGreaterThan(2);
      expect(t.asksEs.length).toBeGreaterThan(0);
      expect(t.jobs.length).toBeGreaterThan(0);
      expect(t.business).not.toMatch(/\.$/); // templates say "This is {business_name}."
    }
  });

  it.each(DEMO_TRADES)("builds a believable history for %s", (key) => {
    const s = buildDemoScenario(key, NOW, 42);
    const contacts = new Set(s.contacts.map((c) => c.key));
    const leads = new Set(s.leads.map((l) => l.key));
    expect(s.leads.length).toBeGreaterThan(30);
    // Every row points at something that exists.
    for (const l of s.leads) expect(contacts.has(l.contactKey)).toBe(true);
    for (const m of s.messages) {
      expect(contacts.has(m.contactKey)).toBe(true);
      if (m.leadKey) expect(leads.has(m.leadKey)).toBe(true);
      expect(Date.parse(m.at)).toBeLessThanOrEqual(NOW.getTime()); // history only
      expect(findUnknownVariables(m.body), m.body).toEqual([]); // no "{first_name}" left in texts
      expect(m.body).not.toMatch(/\bthere\b\./); // no "Sorry to hear that there."
    }
    // Phones are unique and look like US numbers.
    expect(new Set(s.contacts.map((c) => c.phone)).size).toBe(s.contacts.length);
    for (const c of s.contacts) expect(c.phone).toMatch(/^\+1843555\d{4}$/);
    // Some of everything: new, waiting estimates, won and lost.
    const stages = new Set(s.leads.map((l) => l.stage));
    for (const st of ["new", "estimate_sent", "won", "lost"]) expect(stages.has(st as never), st).toBe(true);
    // Recurring businesses get a route; trades get booked visits when they book by arrival window.
    if (getIndustry(key)!.businessType === "recurring") expect(s.recurring.length).toBeGreaterThan(15);
    else expect(s.recurring).toEqual([]);
  });

  it("never has the business answer before the customer asks, or text at night", () => {
    const s = buildDemoScenario("roofing", NOW, 7);
    for (const l of s.leads.filter((x) => x.source !== "manual")) {
      const msgs = s.messages.filter((m) => m.leadKey === l.key);
      const firstAsk = msgs.findIndex((m) => m.direction === "inbound");
      const firstPersonal = msgs.findIndex((m) => m.direction === "outbound" && !m.auto);
      if (firstAsk >= 0 && firstPersonal >= 0) expect(firstPersonal).toBeGreaterThan(firstAsk);
    }
    const hour = (iso: string) => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date(iso)));
    for (const m of s.messages.filter((x) => x.direction === "outbound" && !x.auto)) expect(hour(m.at)).toBeGreaterThanOrEqual(7);
  });

  it("is the same story for the same seed, and a different one for another", () => {
    expect(buildDemoScenario("hvac", NOW, 5)).toEqual(buildDemoScenario("hvac", NOW, 5));
    expect(buildDemoScenario("hvac", NOW, 5).contacts[0].name).not.toBe(buildDemoScenario("hvac", NOW, 6).contacts[0].name);
    const r = rng(1);
    expect(r.int(1, 1)).toBe(1);
  });

  it("shows a growing business (last 7 days beats the week before)", () => {
    for (const key of ["roofing", "lawn_care"]) {
      const s = buildDemoScenario(key, NOW, 3);
      const week = (from: number, to: number) => s.leads.filter((l) => l.source !== "campaign" && NOW.getTime() - Date.parse(l.createdAt) >= from * 86_400_000 && NOW.getTime() - Date.parse(l.createdAt) < to * 86_400_000).length;
      expect(week(0, 7)).toBeGreaterThan(week(7, 14));
    }
  });
});

describe("dashboard trend", () => {
  it("counts leads per Monday-to-Sunday week and money won in the last 30 days", () => {
    expect(weekStart("2026-09-30")).toBe("2026-09-28"); // Wednesday -> Monday
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday -> previous Monday
    const t = computeTrend(
      [
        { created_at: "2026-09-29T14:00:00Z", source: "missed_call", stage: "won", won_at: "2026-09-29T20:00:00Z", estimate_amount_cents: 500_000 },
        { created_at: "2026-09-22T14:00:00Z", source: "inbound_text", stage: "won", won_at: "2026-09-25T14:00:00Z", estimate_amount_cents: 120_000 },
        { created_at: "2026-07-01T14:00:00Z", source: "missed_call", stage: "won", won_at: "2026-07-05T14:00:00Z", estimate_amount_cents: 999_900 },
        { created_at: "2026-09-30T13:00:00Z", source: "missed_call", stage: "new", won_at: null, estimate_amount_cents: null },
      ],
      NOW,
      "America/New_York",
    );
    expect(t.weeks).toHaveLength(12);
    expect(t.weeks.at(-1)).toEqual({ start: "2026-09-28", leads: 2 });
    expect(t.weeks.at(-2)).toEqual({ start: "2026-09-21", leads: 1 });
    expect(t.won30).toEqual({ count: 2, cents: 620_000 });
    expect(t.missedCallLeads30).toBe(2);
    expect(t.missedCallWon30).toEqual({ count: 1, cents: 500_000 });
  });
});

describe("pretend numbers never text a real phone", () => {
  it("uses the simulator for a simulator number even when the site texts through Twilio", () => {
    const before = process.env.SMS_PROVIDER;
    process.env.SMS_PROVIDER = "twilio";
    try {
      expect(getProvider({ provider: "simulator" }).name).toBe("simulator");
      expect(getProvider({ provider: "twilio" }).name).toBe("twilio");
    } finally {
      process.env.SMS_PROVIDER = before;
    }
  });
});
