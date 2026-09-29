import { describe, expect, it } from "vitest";
import { planReviewRequest } from "@/lib/automation/reviews";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings";

const NY = "America/New_York";
const fresh = { review_requested_at: null, opted_out_at: null, do_not_autotext: false };
const base = {
  completedAt: new Date("2026-09-29T15:00:00Z"), // 11am local
  settings: DEFAULT_SETTINGS,
  timezone: NY,
  contact: fresh,
  hasReviewLink: true,
  hasPendingReview: false,
  visitCount: null,
};

describe("review requests", () => {
  it("asks 2 hours after a one-off job", () => {
    const plan = planReviewRequest(base);
    expect(plan).toEqual({ schedule: true, sendAt: new Date("2026-09-29T17:00:00Z") });
  });

  it("waits for morning when the job finishes late", () => {
    const plan = planReviewRequest({ ...base, completedAt: new Date("2026-09-29T22:30:00Z") }); // 6:30pm
    expect(plan).toEqual({ schedule: true, sendAt: new Date("2026-09-30T13:00:00Z") }); // 9am next day
  });

  it("asks each customer only once, ever", () => {
    expect(planReviewRequest({ ...base, contact: { ...fresh, review_requested_at: "2026-05-01" } })).toEqual({
      schedule: false,
      reason: "already_requested",
    });
    expect(planReviewRequest({ ...base, hasPendingReview: true })).toEqual({ schedule: false, reason: "already_scheduled" });
  });

  it("asks recurring customers once, after their 3rd visit, not after every mow", () => {
    expect(planReviewRequest({ ...base, visitCount: 1 })).toEqual({ schedule: false, reason: "not_enough_visits" });
    expect(planReviewRequest({ ...base, visitCount: 2 })).toEqual({ schedule: false, reason: "not_enough_visits" });
    expect(planReviewRequest({ ...base, visitCount: 3 }).schedule).toBe(true);
    // 4th visit after they were asked on the 3rd: no.
    expect(
      planReviewRequest({ ...base, visitCount: 4, contact: { ...fresh, review_requested_at: "2026-09-01" } }).schedule,
    ).toBe(false);
  });

  it("respects the visit setting", () => {
    expect(planReviewRequest({ ...base, settings: parseSettings({ reviewAfterVisits: 5 }), visitCount: 4 }).schedule).toBe(false);
    expect(planReviewRequest({ ...base, settings: parseSettings({ reviewAfterVisits: 1 }), visitCount: 1 }).schedule).toBe(true);
  });

  it.each([
    [{ settings: parseSettings({ reviewsEnabled: false }) }, "reviews_disabled"],
    [{ contact: { ...fresh, opted_out_at: "2026-01-01" } }, "opted_out"],
    [{ contact: { ...fresh, do_not_autotext: true } }, "do_not_autotext"],
    [{ hasReviewLink: false }, "no_review_link"],
  ])("doesn't schedule when %o", (override, reason) => {
    expect(planReviewRequest({ ...base, ...override })).toEqual({ schedule: false, reason });
  });

  it("can send right away with a zero delay (inside business hours)", () => {
    const plan = planReviewRequest({ ...base, settings: parseSettings({ reviewDelayHours: 0 }) });
    expect(plan).toEqual({ schedule: true, sendAt: base.completedAt });
  });
});
