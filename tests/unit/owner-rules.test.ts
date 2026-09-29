import { describe, expect, it } from "vitest";
import { applySettingsChanges, DEFAULT_SETTINGS } from "@/lib/settings";
import { findDefaultTemplate, validateTemplateBody } from "@/lib/templates/validate";

describe("automation setting changes (screen and AI assistant share these limits)", () => {
  it("applies valid changes and keeps the rest", () => {
    const r = applySettingsChanges(DEFAULT_SETTINGS, { followUpDays: [3, 7], reviewDelayHours: 4 });
    expect("settings" in r && r.settings).toMatchObject({ followUpDays: [3, 7], reviewDelayHours: 4, followUpHour: 10 });
  });

  it.each([
    [{ followUpDays: [] }, /Follow-up days/],
    [{ followUpDays: [1, 2, 3, 4, 5, 6] }, /Follow-up days/],
    [{ followUpDays: [90] }, /Follow-up days/],
    [{ followUpHour: 22 }, /Follow-up time/],
    [{ businessHoursStart: 5 }, /Business hours/],
    [{ reviewDelayHours: 100 }, /Review delay/],
    [{ reviewAfterVisits: 0 }, /Visits/],
  ])("refuses %o", (changes, message) => {
    const r = applySettingsChanges(DEFAULT_SETTINGS, changes);
    expect("error" in r && r.error).toMatch(message);
  });
});

describe("message wording checks", () => {
  const review = findDefaultTemplate("review_request", "project")!;

  it("finds the right default for each business type", () => {
    expect(findDefaultTemplate("rain_delay", "recurring")?.key).toBe("rain_delay");
    expect(findDefaultTemplate("missed_call_reply", "project")?.text.en).toContain("job site");
    expect(findDefaultTemplate("nope", "project")).toBeUndefined();
  });

  it("accepts good wording", () => {
    expect(validateTemplateBody("Thanks from {business_name}! {review_link}", "en", review)).toBeNull();
  });

  it.each([
    ["", /can't be empty/],
    ["Thanks! {review_link}", /Keep \{business_name\}/],
    ["{business_name} {reveiw_link}", /unknown placeholder: \{reveiw_link\}/],
    ["{business_name} " + "x".repeat(1000), /too long/],
  ])("explains what's wrong with %j", (body, message) => {
    expect(validateTemplateBody(body, "es", review)).toMatch(message);
  });
});
