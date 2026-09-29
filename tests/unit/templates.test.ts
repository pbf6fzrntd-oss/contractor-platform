import { describe, expect, it } from "vitest";
import { BUSINESS_TYPES } from "@/lib/business-types";
import { DEFAULT_TEMPLATES, defaultTemplatesFor } from "@/lib/templates/defaults";
import { findUnknownVariables, renderTemplate } from "@/lib/templates/render";

const CORE_KEYS = [
  "missed_call_reply",
  "estimate_followup_1",
  "estimate_followup_2",
  "estimate_followup_3",
  "review_request",
  "help_reply",
  "opt_out_confirmation",
  "opt_in_confirmation",
];

describe("default templates", () => {
  it.each(BUSINESS_TYPES)("gives %s businesses every core template in English and Spanish", (type) => {
    const rows = defaultTemplatesFor(type);
    for (const key of CORE_KEYS) {
      for (const language of ["en", "es"]) {
        expect(rows.filter((r) => r.key === key && r.language === language), `${key}/${language}`).toHaveLength(1);
      }
    }
  });

  it.each(BUSINESS_TYPES)("never gives %s businesses two versions of the same template", (type) => {
    const ids = defaultTemplatesFor(type).map((r) => `${r.key}/${r.language}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives lawn businesses rain delay and seasonal campaigns, but not trades", () => {
    const lawn = defaultTemplatesFor("recurring").map((r) => r.key);
    const trade = defaultTemplatesFor("project").map((r) => r.key);
    expect(lawn).toContain("rain_delay");
    expect(lawn).toContain("campaign_pine_straw");
    expect(trade).not.toContain("rain_delay");
    expect(trade.some((k) => k.startsWith("campaign_"))).toBe(false);
  });

  it("marks every campaign as marketing (stricter consent rules)", () => {
    for (const t of DEFAULT_TEMPLATES.filter((t) => t.key.startsWith("campaign_"))) {
      expect(t.category, t.key).toBe("marketing");
    }
  });

  it("uses only known placeholders, and names the business in every template", () => {
    for (const t of DEFAULT_TEMPLATES) {
      for (const body of Object.values(t.text)) {
        expect(findUnknownVariables(body), `${t.key}: ${body}`).toEqual([]);
        expect(body, t.key).toContain("{business_name}");
      }
    }
  });

  it("uses valid template keys (the database only accepts lowercase letters, numbers, _)", () => {
    for (const t of DEFAULT_TEMPLATES) expect(t.key).toMatch(/^[a-z0-9_]{1,50}$/);
  });

  it("keeps texts short enough to stay within a few SMS segments", () => {
    for (const t of DEFAULT_TEMPLATES) {
      for (const body of Object.values(t.text)) expect(body.length, t.key).toBeLessThan(300);
    }
  });
});

describe("renderTemplate", () => {
  it("fills in placeholders", () => {
    expect(renderTemplate("Hi {first_name}, it's {business_name}.", { first_name: "Mike", business_name: "Joe's Roofing" })).toBe(
      "Hi Mike, it's Joe's Roofing.",
    );
  });

  it("drops a missing name cleanly", () => {
    expect(renderTemplate("Hi {first_name}, it's {business_name}.", { business_name: "Joe's" })).toBe("Hi, it's Joe's.");
    expect(renderTemplate("Thanks for choosing {business_name}, {first_name}!", { business_name: "Joe's" })).toBe(
      "Thanks for choosing Joe's!",
    );
    expect(renderTemplate("Hola {first_name}, le escribe {business_name}.", { first_name: "  ", business_name: "Joe's" })).toBe(
      "Hola, le escribe Joe's.",
    );
  });

  it("leaves unknown placeholders visible so typos get noticed", () => {
    expect(renderTemplate("Hi {frist_name}", { first_name: "Mike" })).toBe("Hi {frist_name}");
    expect(findUnknownVariables("Hi {frist_name} {first_name} {oops}")).toEqual(["frist_name", "oops"]);
  });
});
