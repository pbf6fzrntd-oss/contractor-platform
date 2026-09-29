import { describe, expect, it } from "vitest";
import { canAddUser, hasFeature } from "@/lib/entitlements";
import { stageLabel } from "@/lib/leads/stages";
import { formatUSPhone, normalizeUSPhone } from "@/lib/phone";
import { safeNextPath } from "@/lib/redirects";
import { parseBusinessForm } from "@/lib/validation/business";
import { CORE, PILOT } from "./plans";

describe("phone numbers", () => {
  it.each([
    ["(843) 555-1234", "+18435551234"],
    ["843.555.1234", "+18435551234"],
    ["1-843-555-1234", "+18435551234"],
    ["+1 843 555 1234", "+18435551234"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeUSPhone(input)).toBe(expected);
  });

  it.each(["", "555-1234", "(143) 555-1234", "843 055 1234", "+44 20 7946 0958", "843555123456"])(
    "rejects %s",
    (input) => {
      expect(normalizeUSPhone(input)).toBeNull();
    },
  );

  it("formats for display", () => {
    expect(formatUSPhone("+18435551234")).toBe("(843) 555-1234");
  });
});

describe("safe redirects", () => {
  it("allows our own pages", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "", null, undefined])("blocks %s", (next) => {
    expect(safeNextPath(next, "/home")).toBe("/home");
  });
});

describe("plans", () => {
  it("checks features", () => {
    expect(hasFeature(PILOT, "campaigns")).toBe(true);
    expect(hasFeature(CORE, "campaigns")).toBe(false);
  });
  it("checks the user limit", () => {
    expect(canAddUser(CORE, 1)).toBe(true);
    expect(canAddUser(CORE, 2)).toBe(false);
  });
});

describe("lead stage labels", () => {
  it("uses industry words on top of the same stages", () => {
    expect(stageLabel("project", "estimate_sent")).toBe("Estimate sent");
    expect(stageLabel("recurring", "estimate_sent")).toBe("Quote sent");
    expect(stageLabel("recurring", "won")).toBe("Signed up");
  });
});

describe("business form", () => {
  function form(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("accepts a complete form and cleans it up", () => {
    const result = parseBusinessForm(
      form({
        name: "  Summerville Lawn Pros ",
        business_type: "recurring",
        default_language: "es",
        alert_phone: "(843) 555-1234",
        google_review_url: "https://g.page/r/abc",
      }),
    );
    expect(result.success && result.data).toEqual({
      name: "Summerville Lawn Pros",
      business_type: "recurring",
      default_language: "es",
      alert_phone: "+18435551234",
      google_review_url: "https://g.page/r/abc",
    });
  });

  it("treats blank optional fields as not provided", () => {
    const result = parseBusinessForm(form({ name: "A", business_type: "project", alert_phone: "", google_review_url: "" }));
    expect(result.success && result.data).toMatchObject({ alert_phone: null, google_review_url: null, default_language: "en" });
  });

  it.each([
    [{ name: "", business_type: "project" }, "business name"],
    [{ name: "A" }, "type of business"],
    [{ name: "A", business_type: "project", alert_phone: "555" }, "10-digit"],
    [{ name: "A", business_type: "project", google_review_url: "g.page/r/x" }, "https://"],
  ])("explains what's wrong: %o", (fields, message) => {
    const result = parseBusinessForm(form(fields as Record<string, string>));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain(message);
  });
});
